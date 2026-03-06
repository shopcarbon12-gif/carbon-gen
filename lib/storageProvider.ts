import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type StorageProviderType = "r2";

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

let cachedR2Client: S3Client | null = null;
let cachedR2Key = "";

function normalizePath(value: string) {
  return String(value || "").replace(/^\/+/, "");
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

function getRequiredR2Config() {
  const cfg = getR2Config();
  if (!cfg) {
    throw new Error(
      "Missing R2 configuration. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
    );
  }
  return cfg;
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

export function getActiveStorageProvider(): { type: StorageProviderType; r2: R2Config } {
  const r2 = getRequiredR2Config();
  return { type: "r2", r2 };
}

export function getStoragePublicUrl(path: string) {
  const provider = getActiveStorageProvider();
  const normalized = normalizePath(path);
  const base = getR2PublicBase(provider.r2);
  return `${base}/${normalized}`;
}

export async function uploadBytesToStorage(params: {
  path: string;
  bytes: Uint8Array;
  contentType?: string;
}) {
  const provider = getActiveStorageProvider();
  const normalized = normalizePath(params.path);
  const contentType = params.contentType || "application/octet-stream";

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

export async function deleteStorageObjects(paths: string[]) {
  const provider = getActiveStorageProvider();
  const normalized = Array.from(new Set(paths.map(normalizePath))).filter(Boolean);
  if (!normalized.length) return { deleted: 0 };

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

export async function listStorageFiles(prefix: string) {
  const provider = getActiveStorageProvider();
  const normalizedPrefix = normalizePath(prefix);
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

export async function downloadStorageObject(path: string): Promise<{
  body: ArrayBuffer;
  contentType: string;
}> {
  const provider = getActiveStorageProvider();
  const normalized = normalizePath(path);
  if (!normalized) {
    throw new Error("Missing storage object path.");
  }

  const client = getR2Client(provider.r2);
  const resp = await client.send(
    new GetObjectCommand({
      Bucket: provider.r2.bucket,
      Key: normalized,
    })
  );
  if (!resp.Body) {
    throw new Error("Storage object body is empty.");
  }
  const bytes = await resp.Body.transformToByteArray();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const contentType = String(resp.ContentType || "").trim() || "application/octet-stream";
  return { body, contentType };
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
