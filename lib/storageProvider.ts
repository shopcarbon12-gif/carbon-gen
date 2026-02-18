import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type StorageProviderType = "supabase" | "r2";

type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicBaseUrl: string;
};

type StorageFile = {
  path: string;
  size?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

const DEFAULT_BUCKET_FALLBACK = "items";

let cachedR2Client: S3Client | null = null;
let cachedR2Key = "";

function normalizeProvider(value: string | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "r2") return "r2";
  if (raw === "supabase") return "supabase";
  return "auto";
}

function normalizePath(value: string) {
  return String(value || "").replace(/^\/+/, "");
}

function getSupabaseBucket(required: boolean) {
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
  if (!bucket && required) {
    throw new Error("Missing SUPABASE_STORAGE_BUCKET_ITEMS.");
  }
  return bucket || DEFAULT_BUCKET_FALLBACK;
}

function getR2Config(): R2Config | null {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const bucket = String(process.env.R2_BUCKET || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;

  const endpoint =
    String(process.env.R2_ENDPOINT || "").trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;
  const publicBaseUrl = String(process.env.R2_PUBLIC_URL_BASE || "").trim();

  return {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
    publicBaseUrl,
  };
}

function getR2PublicBase(config: R2Config) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/+$/, "");
  }
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
}

function getR2Client(config: R2Config) {
  const key = `${config.endpoint}|${config.accessKeyId}|${config.bucket}`;
  if (!cachedR2Client || cachedR2Key !== key) {
    cachedR2Client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedR2Key = key;
  }
  return cachedR2Client;
}

export function getActiveStorageProvider(): { type: StorageProviderType; r2?: R2Config } {
  const desired = normalizeProvider(process.env.IMAGE_STORAGE_PROVIDER);
  const r2 = getR2Config();
  if (desired === "r2") {
    if (!r2) {
      throw new Error(
        "IMAGE_STORAGE_PROVIDER is set to r2 but R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY are missing."
      );
    }
    return { type: "r2", r2 };
  }
  if (desired === "supabase") {
    return { type: "supabase" };
  }
  if (r2) {
    return { type: "r2", r2 };
  }
  return { type: "supabase" };
}

export function getStoragePublicUrl(path: string) {
  const provider = getActiveStorageProvider();
  const normalized = normalizePath(path);
  if (provider.type === "r2" && provider.r2) {
    const base = getR2PublicBase(provider.r2);
    return `${base}/${normalized}`;
  }
  const bucket = getSupabaseBucket(true);
  const supabase = getSupabaseAdmin();
  return supabase.storage.from(bucket).getPublicUrl(normalized).data.publicUrl;
}

export async function uploadBytesToStorage(params: {
  path: string;
  bytes: Uint8Array;
  contentType?: string;
}) {
  const provider = getActiveStorageProvider();
  const normalized = normalizePath(params.path);
  const contentType = params.contentType || "application/octet-stream";

  if (provider.type === "r2" && provider.r2) {
    const client = getR2Client(provider.r2);
    await client.send(
      new PutObjectCommand({
        Bucket: provider.r2.bucket,
        Key: normalized,
        Body: params.bytes,
        ContentType: contentType,
      })
    );
    const publicUrl = getStoragePublicUrl(normalized);
    return { url: publicUrl, path: normalized };
  }

  const bucket = getSupabaseBucket(true);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(normalized, params.bytes, { contentType });
  if (error) {
    throw new Error(error.message);
  }
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(normalized).data.publicUrl;
  return { url: publicUrl, path: normalized };
}

export async function deleteStorageObjects(paths: string[]) {
  const provider = getActiveStorageProvider();
  const normalized = Array.from(new Set(paths.map(normalizePath))).filter(Boolean);
  if (!normalized.length) return { deleted: 0 };

  if (provider.type === "r2" && provider.r2) {
    const client = getR2Client(provider.r2);
    const chunkSize = 1000;
    let deleted = 0;
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const chunk = normalized.slice(i, i + chunkSize);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: provider.r2.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        })
      );
      deleted += chunk.length;
    }
    return { deleted };
  }

  const bucket = getSupabaseBucket(true);
  const supabase = getSupabaseAdmin();
  let deleted = 0;
  for (let i = 0; i < normalized.length; i += 1000) {
    const chunk = normalized.slice(i, i + 1000);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      throw new Error(error.message);
    }
    deleted += chunk.length;
  }
  return { deleted };
}

export async function listStorageFiles(prefix: string) {
  const provider = getActiveStorageProvider();
  const normalizedPrefix = normalizePath(prefix);

  if (provider.type === "r2" && provider.r2) {
    const client = getR2Client(provider.r2);
    const files: StorageFile[] = [];
    let continuationToken: string | undefined;
    do {
      const resp = await client.send(
        new ListObjectsV2Command({
          Bucket: provider.r2.bucket,
          Prefix: normalizedPrefix ? `${normalizedPrefix.replace(/\/+$/, "")}/` : undefined,
          ContinuationToken: continuationToken,
        })
      );
      for (const entry of resp.Contents || []) {
        if (!entry.Key) continue;
        files.push({
          path: entry.Key,
          size: typeof entry.Size === "number" ? entry.Size : null,
          updatedAt: entry.LastModified ? entry.LastModified.toISOString() : null,
          createdAt: entry.LastModified ? entry.LastModified.toISOString() : null,
        });
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
    return files;
  }

  const bucket = getSupabaseBucket(true);
  const supabase = getSupabaseAdmin();
  const queue: string[] = [normalizedPrefix || ""];
  const files: StorageFile[] = [];

  while (queue.length) {
    const current = queue.shift() as string;
    const { data, error } = await supabase.storage.from(bucket).list(current, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(error.message);
    }
    for (const entry of (data || []) as Array<{
      name: string;
      id: string | null;
      metadata?: { size?: number } | null;
      created_at?: string | null;
      updated_at?: string | null;
    }>) {
      const childPath = `${current}/${entry.name}`.replace(/^\/+/, "");
      if (!entry.id) {
        queue.push(childPath);
      } else {
        files.push({
          path: childPath,
          size: entry.metadata?.size ?? null,
          createdAt: entry.created_at || entry.updated_at || null,
          updatedAt: entry.updated_at || entry.created_at || null,
        });
      }
    }
  }

  return files;
}

export function getR2AllowedHost() {
  const cfg = getR2Config();
  if (!cfg) return "";
  if (cfg.publicBaseUrl) {
    try {
      return new URL(cfg.publicBaseUrl).hostname || "";
    } catch {
      return "";
    }
  }
  return `${cfg.accountId}.r2.cloudflarestorage.com`;
}
