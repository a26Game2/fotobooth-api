import { createClient } from "redis";
import { config } from "./config.js";

const redis = config.redisUrl ? createClient({
  url: config.redisUrl,
  socket: { connectTimeout: 1_500, reconnectStrategy: false }
}) : null;

let connectPromise: Promise<void> | null = null;
let retryAfter = 0;
let hasLoggedError = false;
const inFlight = new Map<string, Promise<unknown>>();

redis?.on("error", (error) => {
  if (!hasLoggedError) {
    console.warn(`Redis unavailable; falling back to PostgreSQL: ${error.message}`);
    hasLoggedError = true;
  }
});

async function client() {
  if (!redis) return null;
  if (redis.isReady) return redis;
  if (Date.now() < retryAfter) return null;
  if (!connectPromise) {
    connectPromise = redis.connect()
      .then(() => { hasLoggedError = false; })
      .catch(() => { retryAfter = Date.now() + 30_000; })
      .finally(() => { connectPromise = null; });
  }
  await connectPromise;
  return redis.isReady ? redis : null;
}

export const getRedisConnection = () => client();

async function loadOnce<T>(key: string, loader: () => Promise<T>) {
  const current = inFlight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const promise = loader().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export async function cacheGetOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds = config.cacheTtlSeconds) {
  const connection = await client();
  if (connection) {
    try {
      const existing = await connection.get(key);
      if (existing !== null) return { value: JSON.parse(existing) as T, hit: true };
    } catch {
      // Cache failures must never break public booking flows.
    }
  }

  const value = await loadOnce(key, loader);
  if (connection) {
    try { await connection.setEx(key, ttlSeconds, JSON.stringify(value)); } catch { /* graceful fallback */ }
  }
  return { value, hit: false };
}

export async function invalidateCache(patterns: string[]) {
  const connection = await client();
  if (!connection) return;
  for (const pattern of patterns) {
    try {
      for await (const batch of connection.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        const keys = Array.isArray(batch) ? batch : [batch];
        if (keys.length) await connection.del(keys);
      }
    } catch {
      // Data remains correct because every cache entry has a short TTL.
    }
  }
}

export async function cacheStatus() {
  const connection = await client();
  if (!connection) return "unavailable" as const;
  try {
    return await connection.ping() === "PONG" ? "ready" as const : "unavailable" as const;
  } catch {
    return "unavailable" as const;
  }
}

export const cacheKeys = {
  configuration: "tred:public:configuration",
  cities: "tred:public:cities",
  services: "tred:public:services",
  service: (slug: string) => `tred:public:service:${slug}`,
  pricing: (serviceSlug: string, citySlug: string) => `tred:pricing:${serviceSlug}:${citySlug}`,
  adminServices: "tred:admin:services"
};

export const invalidateCatalogCache = () => invalidateCache(["tred:public:*", "tred:pricing:*", "tred:admin:services"]);
export const invalidateConfigurationCache = () => invalidateCache([cacheKeys.configuration, "tred:pricing:*"]);
