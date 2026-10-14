import { flushAuditLogs } from "../audit.js";
import { getRedisConnection } from "../cache.js";
import { prisma } from "../db.js";

try {
  console.log(JSON.stringify(await flushAuditLogs()));
} finally {
  const redis = await getRedisConnection();
  if (redis?.isOpen) await redis.quit();
  await prisma.$disconnect();
}
