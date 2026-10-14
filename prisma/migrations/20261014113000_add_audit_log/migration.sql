CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "actorName" TEXT NOT NULL,
  "actorRole" "AdminRole" NOT NULL,
  "authType" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "requestBody" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditLog_eventId_key" ON "AuditLog"("eventId");
CREATE INDEX "AuditLog_occurredAt_idx" ON "AuditLog"("occurredAt");
CREATE INDEX "AuditLog_actorUserId_occurredAt_idx" ON "AuditLog"("actorUserId", "occurredAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_method_statusCode_idx" ON "AuditLog"("method", "statusCode");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
