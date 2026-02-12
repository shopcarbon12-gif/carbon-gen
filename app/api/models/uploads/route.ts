import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function extractPathFromStorageUrl(url: string) {
  try {
    const u = new URL(url);
    const marker = "/storage/v1/object/public/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const rest = u.pathname.slice(idx + marker.length);
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const bucket = rest.slice(0, slash);
    const objectPath = decodeURIComponent(rest.slice(slash + 1));
    return { bucket, objectPath };
  } catch {
    return null;
  }
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
      .select("name,gender,created_at,ref_image_urls")
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
    .select("name,gender,created_at,ref_image_urls")
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
    }> = [];

    for (const row of modelRows || []) {
      const urls = Array.isArray((row as any).ref_image_urls) ? (row as any).ref_image_urls : [];
      const modelName = String((row as any).name || "");
      const gender = normalizeGender((row as any).gender);
      const createdAt = String((row as any).created_at || "") || null;

      for (const raw of urls) {
        const rawUrl = String(raw || "").trim();
        if (!rawUrl) continue;

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
        });
      }
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

    return NextResponse.json({ files: Array.from(byCanonical.values()) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load model uploads" }, { status: 500 });
  }
}
