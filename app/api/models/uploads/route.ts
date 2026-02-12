import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveModelUserScope } from "@/lib/userScope";

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

function canonicalNameFromFileName(name: string) {
  return name.replace(/^\d{10,}-/, "").toLowerCase();
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

export async function GET(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userScope = resolveModelUserScope(req.cookies.get("carbon_gen_user_id")?.value);

    const supabase = getSupabaseAdmin();
    if (userScope.legacyUserId) {
      await supabase
        .from("models")
        .update({ user_id: userScope.stableUserId })
        .neq("user_id", userScope.stableUserId);
    }
    const { data, error } = await supabase
      .from("models")
      .select("name,gender,created_at,ref_image_urls")
      .in("user_id", userScope.userIds)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries: Array<{
      id: string;
      path: string;
      fileName: string;
      modelName: string;
      gender: string;
      uploadedAt: string | null;
      url: string | null;
    }> = [];
    const seen = new Set<string>();

    for (const row of data || []) {
      const urls = Array.isArray((row as any).ref_image_urls) ? (row as any).ref_image_urls : [];
      for (const rawUrl of urls) {
        const parsed = extractPathFromStorageUrl(String(rawUrl || ""));
        if (!parsed) continue;
        const key = `${parsed.bucket}/${parsed.objectPath}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const fileName = fileNameFromPath(parsed.objectPath);
        const signed = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.objectPath, 60 * 60);
        entries.push({
          id: key,
          path: parsed.objectPath,
          fileName,
          modelName: String((row as any).name || ""),
          gender: normalizeGender((row as any).gender),
          uploadedAt: timestampFromFileName(fileName) || String((row as any).created_at || ""),
          url: signed.data?.signedUrl || String(rawUrl || null),
        });
      }
    }

    // Deduplicate repeated uploads of the same source image name.
    // Keep only the latest uploaded copy.
    const byCanonical = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) {
      const key = `${entry.gender || "unknown"}::${canonicalNameFromFileName(entry.fileName)}`;
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
