import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import cron from "node-cron";
import { Prisma, type AdminRole } from "@prisma/client";
import { prisma } from "./db.js";
import { config } from "./config.js";
import { getRedisConnection } from "./cache.js";

const pendingKey = "tred:audit:pending";
const processingKey = "tred:audit:processing";
const flushLockKey = "tred:audit:flush-lock";
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const sensitiveKey = /(password|passwordhash|token|secret|api[-_]?key|authorization|cookie)/i;

type AuditEvent = {
  eventId: string;
  actorUserId?: string;
  actorEmail?: string;
  actorName: string;
  actorRole: AdminRole;
  authType: "jwt" | "api-key";
  action: string;
  method: string;
  path: string;
  statusCode: number;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestBody?: unknown;
  occurredAt: string;
};

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditValue(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" && value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = sensitiveKey.test(key) ? "[REDACTED]" : sanitizeAuditValue(item, depth + 1);
  }
  return result;
}

function compactRequestBody(request: Request) {
  const files = ((request.files as Express.Multer.File[] | undefined) ?? []).map((file) => ({
    fieldName: file.fieldname,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size
  }));
  const singleFile = request.file ? [{
    fieldName: request.file.fieldname,
    originalName: request.file.originalname,
    mimeType: request.file.mimetype,
    sizeBytes: request.file.size
  }] : [];
  const sanitized = sanitizeAuditValue({ body: request.body, query: request.query, files: [...files, ...singleFile] });
  const encoded = JSON.stringify(sanitized);
  return encoded.length <= 50_000 ? sanitized : { truncated: true, originalBytes: Buffer.byteLength(encoded), note: "Audit payload exceeded 50 KB" };
}

export function auditEntity(path: string, body: unknown) {
  const parts = path.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const entityType = parts[0];
  const objectBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const bodyId = objectBody.id ?? objectBody.serviceId ?? objectBody.cityId;
  const entityId = parts[1] ?? (typeof bodyId === "string" ? bodyId : undefined);
  return { entityType, entityId };
}

function toCreateInput(event: AuditEvent): Prisma.AuditLogCreateManyInput {
  return {
    eventId: event.eventId,
    actorUserId: event.actorUserId,
    actorEmail: event.actorEmail,
    actorName: event.actorName,
    actorRole: event.actorRole,
    authType: event.authType,
    action: event.action,
    method: event.method,
    path: event.path,
    statusCode: event.statusCode,
    entityType: event.entityType,
    entityId: event.entityId,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    requestBody: event.requestBody === undefined ? undefined : event.requestBody as Prisma.InputJsonValue,
    occurredAt: new Date(event.occurredAt)
  };
}

async function persist(events: AuditEvent[]) {
  if (!events.length) return 0;
  const result = await prisma.auditLog.createMany({ data: events.map(toCreateInput), skipDuplicates: true });
  return result.count;
}

export async function enqueueAuditLog(event: AuditEvent) {
  const connection = await getRedisConnection();
  if (!connection) {
    await persist([event]);
    return "database" as const;
  }
  await connection.rPush(pendingKey, JSON.stringify(event));
  return "redis" as const;
}

export async function flushAuditLogs() {
  const connection = await getRedisConnection();
  if (!connection) return { queued: 0, persisted: 0 };
  const lockToken = randomUUID();
  const lock = await connection.set(flushLockKey, lockToken, { NX: true, EX: 55 });
  if (lock !== "OK") return { queued: 0, persisted: 0, skipped: "locked" as const };

  try {
    // Recover events left in the processing queue if the previous flush was interrupted.
    for (let index = 0; index < config.auditLogBatchSize; index += 1) {
      const recovered = await connection.lMove(processingKey, pendingKey, "LEFT", "RIGHT");
      if (recovered === null) break;
    }

    const rawEvents: string[] = [];
    for (let index = 0; index < config.auditLogBatchSize; index += 1) {
      const raw = await connection.lMove(pendingKey, processingKey, "LEFT", "RIGHT");
      if (raw === null) break;
      rawEvents.push(raw);
    }
    if (!rawEvents.length) return { queued: 0, persisted: 0 };

    const events: AuditEvent[] = [];
    for (const raw of rawEvents) {
      try { events.push(JSON.parse(raw) as AuditEvent); }
      catch { await connection.lRem(processingKey, 1, raw); }
    }
    const persisted = await persist(events);
    for (const raw of rawEvents) await connection.lRem(processingKey, 1, raw);
    return { queued: rawEvents.length, persisted };
  } finally {
    if (await connection.get(flushLockKey) === lockToken) await connection.del(flushLockKey);
  }
}

export function auditAdminMutations(request: Request, response: Response, next: NextFunction) {
  if (!request.auth || !mutationMethods.has(request.method)) return next();
  const occurredAt = new Date();
  response.once("finish", () => {
    const path = request.originalUrl.split("?")[0];
    const { entityType, entityId } = auditEntity(path, request.body);
    const event: AuditEvent = {
      eventId: randomUUID(),
      actorUserId: request.auth?.userId,
      actorEmail: request.auth?.email,
      actorName: request.auth?.name ?? "Unknown",
      actorRole: request.auth!.role,
      authType: request.auth!.type,
      action: `${request.method} ${path}`,
      method: request.method,
      path,
      statusCode: response.statusCode,
      entityType,
      entityId,
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
      requestBody: compactRequestBody(request),
      occurredAt: occurredAt.toISOString()
    };
    void enqueueAuditLog(event).catch((error) => console.error("Could not enqueue audit log", error));
  });
  return next();
}

export function startAuditLogCron() {
  if (!cron.validate(config.auditLogCron)) throw new Error(`AUDIT_LOG_CRON không hợp lệ: ${config.auditLogCron}`);
  const task = cron.schedule(config.auditLogCron, () => {
    void flushAuditLogs().catch((error) => console.error("Could not flush audit logs", error));
  }, { timezone: "Asia/Ho_Chi_Minh", noOverlap: true });
  void flushAuditLogs().catch((error) => console.error("Could not run initial audit flush", error));
  return task;
}
