import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getStoragePublicUrl, listStorageFiles } from "@/lib/storageProvider";
import {
  listAllModelsAsc,
  listModelsForUser,
} from "@/lib/modelsRepository";

type CachedUploadsResponse = {
  expiresAt: number;
  files: Array<{
    id: string;
    path: string;
    fileName: string;
    modelName: string;
    gender: string;
    uploadedAt: string | null;
    url: string | null;
    previewUrl: string | null;
  }>;
};

const uploadsResponseCache = new Map<string, CachedUploadsResponse>();
const UPLOADS_CACHE_TTL_MS = 10_000;
const MAX_MODEL_UPLOAD_STORAGE_SCAN = Number.parseInt(
  process.env.MODEL_UPLOAD_STORAGE_SCAN_MAX || "",
  10
) || 3000;
const MAX_MODEL_UPLOAD_RESPONSE_LIMIT = 500;

function extractPathFromStorageUrl(url: string) {
  try {
    const u = new URL(url);
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/authenticated/",
    ];

    for (const marker of markers) {
      const idx = u.pathname.indexOf(marker);
      if (idx < 0) continue;
      const rest = u.pathname.slice(idx + marker.length);
      const slash = rest.indexOf("/");
      if (slash < 0) continue;
      const bucket = rest.slice(0, slash);
      const objectPath = decodeURIComponent(rest.slice(slash + 1));
      return { bucket, objectPath };
    }

    return null;
  } catch {
    return null;
  }
}

function extractPathFromR2StorageUrl(url: string) {
  try {
    const u = new URL(url);
    const host = String(u.hostname || "").toLowerCase();
    const configuredBucket = String(process.env.R2_BUCKET || "").trim();
    const configuredPublicBase = String(process.env.R2_PUBLIC_URL_BASE || "").trim();
    const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));

    if (host.includes("r2.cloudflarestorage.com")) {
      if (parts.length >= 2) {
        const bucket = parts[0];
        const objectPath = parts.slice(1).join("/");
        if (bucket && objectPath) return { bucket, objectPath };
      }
      if (configuredBucket && parts.length >= 1) {
        const objectPath = parts.join("/");
        if (objectPath) return { bucket: configuredBucket, objectPath };
      }
      return null;
    }

    if (host.endsWith(".r2.dev")) {
      const objectPath = parts.join("/");
      if (!objectPath) return null;
      return { bucket: configuredBucket || "r2", objectPath };
    }

    if (configuredPublicBase) {
      try {
        const base = new URL(configuredPublicBase);
        if (host === String(base.hostname || "").toLowerCase()) {
          const baseParts = base.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
          let objectParts = parts;
          if (baseParts.length && parts.length >= baseParts.length) {
            const isBasePrefix = baseParts.every((seg, idx) => parts[idx] === seg);
            if (isBasePrefix) {
              objectParts = parts.slice(baseParts.length);
            }
          }
          const objectPath = objectParts.join("/");
          if (objectPath) return { bucket: configuredBucket || "r2", objectPath };
        }
      } catch {
        // Ignore malformed configured base and continue to fallback.
      }
    }

    return null;
  } catch {
    return null;
  }
}

function sanitizeReferenceUrl(value: unknown) {
  if (typeof value !== "string") return "";
  let v = value.trim();
  if (!v) return "";
  v = v.replace(/%0d%0a/gi, "");
  v = v.replace(/%0d/gi, "");
  v = v.replace(/%0a/gi, "");
  v = v.replace(/[\r\n]+/g, "");
  return v.trim();
}

function isTemporaryReferenceUrl(raw: string) {
  const v = String(raw || "").toLowerCase();
  if (!v) return false;
  if (v.includes("/storage/v1/object/sign/")) return true;
  if (v.includes("token=") || v.includes("x-amz-signature=") || v.includes("x-amz-security-token="))
    return true;
  if (v.includes("dl.dropboxusercontent.com")) return true;
  return false;
}

function fileNameFromPath(path: string) {
  return path.split("/").pop() || path;
}

function fileNameFromUrl(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    return fileNameFromPath(decodeURIComponent(u.pathname));
  } catch {
    return fileNameFromPath(rawUrl);
  }
}

function canonicalNameFromFileName(name: string) {
  let v = String(name || "").trim().toLowerCase();
  v = v.split("?")[0].split("#")[0];
  v = v.split("/").pop() || v;
  v = v.replace(/^\d{10,}-/, "");
  v = v.replace(/\s+/g, "_");

  const candidatePatterns = [
    /^chatgpt_image_/,
    /^image_/,
    /^img_/,
    /^dalle_/,
    /^openai_/,
    /^gemini_/,
    /^victor_?\d+\./,
    /^\d+\.(png|jpe?g|webp|gif|avif|heic|heif|tiff?|bmp)$/,
    /^(beige|black|white|gray|grey|blue|red|green|brown|tan|cream|navy)_/,
  ];

  for (let i = 0; i < 3; i += 1) {
    const idx = v.indexOf("_");
    if (idx <= 0) break;
    const tail = v.slice(idx + 1);
    if (candidatePatterns.some((re) => re.test(tail))) {
      v = tail;
      continue;
    }
    break;
  }

  return v;
}

function timestampFromFileName(name: string) {
  const m = name.match(/^(\d{10,})-/);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeGender(value: unknown) {
  const g = String(value || "").trim().toLowerCase();
  if (g === "male" || g === "female") return g;
  return "";
}

function parseTimestampFromPath(path: string) {
  const fileName = path.split("/").pop() || "";
  const m = fileName.match(/^(\d{10,})-/);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function loadModelRowsForSession(userId: string | null) {
  const rows = new Map<string, any>();
  if (userId) {
    const userRows = await listModelsForUser(userId);
    for (const row of userRows || []) {
      const id = String((row as any)?.model_id || "");
      if (id) rows.set(id, row);
    }
  }
  // Always merge global rows to ensure cross-workspace/session uploads are visible.
  const allRows = await listAllModelsAsc();
  for (const row of allRows || []) {
    const id = String((row as any)?.model_id || "");
    if (id && !rows.has(id)) rows.set(id, row);
  }
  return Array.from(rows.values()).reverse();
}

export async function GET(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const r2Bucket = String(process.env.R2_BUCKET || "").trim();
    const userId = req.cookies.get("carbon_gen_user_id")?.value?.trim() || null;
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(MAX_MODEL_UPLOAD_RESPONSE_LIMIT, Math.floor(limitRaw)))
      : 250;
    const cacheKey = userId || "__global__";
    const cached = uploadsResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ files: cached.files.slice(0, limit) });
    }
    const modelRows = await loadModelRowsForSession(userId);
    const uploadPrefix = userId ? `models/uploads/${userId}` : "models/uploads";
    const storageFiles = await listStorageFiles(uploadPrefix, {
      maxKeys: MAX_MODEL_UPLOAD_STORAGE_SCAN,
      pageSize: 1000,
    }).catch(() => []);

    const entries: Array<{
      id: string;
      path: string;
      fileName: string;
      modelName: string;
      gender: string;
      uploadedAt: string | null;
      url: string | null;
      previewUrl: string | null;
      __bucket?: string | null;
      __objectPath?: string | null;
    }> = [];

    for (const row of modelRows || []) {
      const urls = Array.isArray((row as any).ref_image_urls) ? (row as any).ref_image_urls : [];
      const modelName = String((row as any).name || "");
      const gender = normalizeGender((row as any).gender);
      const createdAt = String((row as any).created_at || "") || null;
      const cleanedUrls = urls
        .map((raw: unknown) => sanitizeReferenceUrl(raw))
        .filter((raw: string) => raw.length > 0);

      const normalizedUrls: string[] = Array.from(
        new Set<string>(
          cleanedUrls
            .map((rawUrl: string) => {
              if (!isTemporaryReferenceUrl(rawUrl)) return sanitizeReferenceUrl(rawUrl);
              const legacyParsed = extractPathFromStorageUrl(rawUrl);
              const r2Parsed = legacyParsed ? null : extractPathFromR2StorageUrl(rawUrl);
              const parsed = legacyParsed || r2Parsed;
              if (parsed?.objectPath) {
                try {
                  return getStoragePublicUrl(parsed.objectPath);
                } catch {
                  return sanitizeReferenceUrl(rawUrl);
                }
              }
              return sanitizeReferenceUrl(rawUrl);
            })
            .filter((value: unknown): value is string => Boolean(value))
        )
      );
      if (normalizedUrls.length < 1) continue;

      for (const rawUrl of normalizedUrls) {

        const legacyParsed = extractPathFromStorageUrl(rawUrl);
        const r2Parsed = legacyParsed ? null : extractPathFromR2StorageUrl(rawUrl);
        const parsed = legacyParsed || r2Parsed;
        // Keep legacy storage-path entries when parseable to support old rows after migration.
        // Keep only the configured R2 bucket when parseable.
        if (r2Parsed && r2Bucket && r2Parsed.bucket !== r2Bucket) continue;

        const path = parsed?.objectPath || rawUrl;
        const fileName = parsed ? fileNameFromPath(parsed.objectPath) : fileNameFromUrl(rawUrl);
        const rebuiltUrl = parsed?.objectPath ? getStoragePublicUrl(parsed.objectPath) : "";
        const preferredPreviewUrl = parsed?.objectPath
          ? `/api/storage/preview?path=${encodeURIComponent(parsed.objectPath)}`
          : rawUrl;
        const fallbackUrl = rebuiltUrl || rawUrl;

        entries.push({
          id: parsed ? `${parsed.bucket}/${parsed.objectPath}` : `url:${rawUrl}`,
          path,
          fileName,
          modelName,
          gender,
          uploadedAt: timestampFromFileName(fileName) || createdAt || null,
          url: fallbackUrl,
          previewUrl: preferredPreviewUrl,
          __bucket: parsed?.bucket || null,
          __objectPath: parsed?.objectPath || null,
        });
      }
    }

    for (const file of storageFiles) {
      const fileName = fileNameFromPath(file.path);
      entries.push({
        id: `storage:${file.path}`,
        path: file.path,
        fileName,
        modelName: "",
        gender: "",
        uploadedAt: parseTimestampFromPath(file.path) || file.createdAt || file.updatedAt || null,
        url: getStoragePublicUrl(file.path),
        previewUrl: `/api/storage/preview?path=${encodeURIComponent(file.path)}`,
        __bucket: null,
        __objectPath: file.path,
      });
    }

    // Deduplicate repeated uploads by source filename only.
    // Keep only the latest uploaded copy for that filename.
    const byCanonical = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) {
      const key = canonicalNameFromFileName(entry.fileName);
      const prev = byCanonical.get(key);
      if (!prev) {
        byCanonical.set(key, entry);
        continue;
      }
      const prevTs = prev.uploadedAt ? new Date(prev.uploadedAt).getTime() : 0;
      const nextTs = entry.uploadedAt ? new Date(entry.uploadedAt).getTime() : 0;
      if (nextTs >= prevTs) {
        byCanonical.set(key, entry);
      }
    }

    const deduped = Array.from(byCanonical.values());

    const files = deduped.map((entry) => ({
        id: entry.id,
        path: entry.path,
        fileName: entry.fileName,
        modelName: entry.modelName,
        gender: entry.gender,
        uploadedAt: entry.uploadedAt,
        url: entry.url,
        previewUrl: entry.previewUrl,
      }));
    uploadsResponseCache.set(cacheKey, {
      expiresAt: Date.now() + UPLOADS_CACHE_TTL_MS,
      files,
    });
    return NextResponse.json({ files: files.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load model uploads" }, { status: 500 });
  }
}
