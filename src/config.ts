import "dotenv/config";
import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  adminApiKey: process.env.ADMIN_API_KEY,
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "storage/uploads"),
  redisUrl: process.env.REDIS_URL,
  cacheTtlSeconds: Math.max(10, Number(process.env.CACHE_TTL_SECONDS ?? 300)),
  auditLogCron: process.env.AUDIT_LOG_CRON ?? "* * * * *",
  auditLogBatchSize: Math.max(1, Math.min(1000, Number(process.env.AUDIT_LOG_BATCH_SIZE ?? 100))),
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  serviceCoversBucket: process.env.SUPABASE_SERVICE_COVERS_BUCKET ?? "service-covers"
};
