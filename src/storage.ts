import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const allowedTypes: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

let client: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

export class StorageConfigurationError extends Error {}

function storageClient() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new StorageConfigurationError("SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình");
  }
  client ??= createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return client;
}

async function ensureBucket() {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const supabase = storageClient();
    const { data, error } = await supabase.storage.getBucket(config.serviceCoversBucket);
    if (data && !error) return;
    const created = await supabase.storage.createBucket(config.serviceCoversBucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: Object.keys(allowedTypes)
    });
    if (created.error && !created.error.message.toLowerCase().includes("already exists")) throw created.error;
  })().catch((error) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

export async function uploadServiceCover(serviceSlug: string, file: Express.Multer.File) {
  const extension = allowedTypes[file.mimetype];
  if (!extension) throw new Error("Ảnh cover chỉ hỗ trợ JPG, PNG hoặc WebP");
  await ensureBucket();
  const supabase = storageClient();
  const objectPath = `${serviceSlug}/${randomUUID()}${extension}`;
  const uploaded = await supabase.storage.from(config.serviceCoversBucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    cacheControl: "31536000",
    upsert: false
  });
  if (uploaded.error) throw uploaded.error;
  const publicUrl = supabase.storage.from(config.serviceCoversBucket).getPublicUrl(objectPath).data.publicUrl;
  return { objectPath, publicUrl };
}

function objectPathFromPublicUrl(publicUrl: string) {
  const marker = `/storage/v1/object/public/${config.serviceCoversBucket}/`;
  const markerIndex = publicUrl.indexOf(marker);
  return markerIndex === -1 ? null : decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
}

export async function deleteServiceCover(publicUrl: string | null | undefined) {
  if (!publicUrl) return;
  const objectPath = objectPathFromPublicUrl(publicUrl);
  if (!objectPath) return;
  const removed = await storageClient().storage.from(config.serviceCoversBucket).remove([objectPath]);
  if (removed.error) throw removed.error;
}
