import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

async function loadModelRowsForSession(userId: string | null) {
  const supabase = getSupabaseAdmin();
  if (userId) {
    const { data, error } = await supabase
      .from("models")
      .select("model_id,name,gender,created_at,ref_image_urls")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    if ((data || []).length) {
      return data || [];
    }
  }

  // Fallback for legacy/cross-domain sessions that do not map to the current cookie user_id.
  const { data, error } = await supabase
    .from("models")
    .select("model_id,name,gender,created_at,ref_image_urls")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function GET(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
    const userId = req.cookies.get("carbon_gen_user_id")?.value?.trim() || null;
    const modelRows = await loadModelRowsForSession(userId);

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
    const staleModelIds = new Set<string>();

    for (const row of modelRows || []) {
      const urls = Array.isArray((row as any).ref_image_urls) ? (row as any).ref_image_urls : [];
      const modelId = String((row as any).model_id || "").trim();
      const modelName = String((row as any).name || "");
      const gender = normalizeGender((row as any).gender);
      const createdAt = String((row as any).created_at || "") || null;
      const cleanedUrls = urls
        .map((raw: unknown) => sanitizeReferenceUrl(raw))
        .filter((raw: string) => raw.length > 0);

      const hasTemporaryRefs = cleanedUrls.some((rawUrl: string) => isTemporaryReferenceUrl(rawUrl));
      if (hasTemporaryRefs) {
        if (modelId) staleModelIds.add(modelId);
        continue;
      }

      for (const rawUrl of cleanedUrls) {

        const parsed = extractPathFromStorageUrl(rawUrl);
        // Keep only the configured bucket when parseable; otherwise keep legacy URL entries.
        if (parsed && bucket && parsed.bucket !== bucket) continue;

        const path = parsed?.objectPath || rawUrl;
        const fileName = parsed ? fileNameFromPath(parsed.objectPath) : fileNameFromUrl(rawUrl);

        entries.push({
          id: parsed ? `${parsed.bucket}/${parsed.objectPath}` : `url:${rawUrl}`,
          path,
          fileName,
          modelName,
          gender,
          uploadedAt: timestampFromFileName(fileName) || createdAt || null,
          url: rawUrl,
          previewUrl: rawUrl,
          __bucket: parsed?.bucket || null,
          __objectPath: parsed?.objectPath || null,
        });
      }
    }

    if (staleModelIds.size) {
      const supabase = getSupabaseAdmin();
      const userCookieId = req.cookies.get("carbon_gen_user_id")?.value?.trim() || null;
      let staleDelete = supabase.from("models").delete().in("model_id", Array.from(staleModelIds));
      if (userCookieId) {
        staleDelete = staleDelete.eq("user_id", userCookieId);
      }
      await staleDelete;
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

    // Generate signed preview URLs for private buckets while preserving original stored URLs.
    if (bucket) {
      const supabase = getSupabaseAdmin();
      const signTargets = deduped.filter(
        (entry) => entry.__bucket === bucket && entry.__objectPath
      );

      if (signTargets.length) {
        const paths = signTargets.map((entry) => String(entry.__objectPath));
        const { data: signedData } = await supabase.storage
          .from(bucket)
          .createSignedUrls(paths, 60 * 60 * 24 * 7);

        const signedByPath = new Map<string, string>();
        for (const row of signedData || []) {
          if (row?.path && row?.signedUrl) {
            signedByPath.set(String(row.path), String(row.signedUrl));
          }
        }

        for (const entry of deduped) {
          const objectPath = entry.__objectPath || "";
          if (objectPath && signedByPath.has(objectPath)) {
            entry.previewUrl = signedByPath.get(objectPath) || entry.previewUrl;
          }
        }
      }
    }

    return NextResponse.json({
      files: deduped.map((entry) => ({
        id: entry.id,
        path: entry.path,
        fileName: entry.fileName,
        modelName: entry.modelName,
        gender: entry.gender,
        uploadedAt: entry.uploadedAt,
        url: entry.url,
        previewUrl: entry.previewUrl,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load model uploads" }, { status: 500 });
  }
}
