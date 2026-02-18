import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveStorageProvider, getStoragePublicUrl, listStorageFiles } from "@/lib/storageProvider";

function parseTimestampFromPath(path: string) {
  const fileName = path.split("/").pop() || "";
  const m = fileName.match(/^(\d{10,})-/);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function shouldSignUrls() {
  const provider = getActiveStorageProvider();
  return provider.type === "supabase";
}

export async function GET(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefix = String(req.nextUrl.searchParams.get("prefix") || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    const targetPrefixes = prefix ? [prefix] : ["models", "items"];
    const listedGroups = await Promise.all(
      targetPrefixes.map((p) => listStorageFiles(p))
    );
    const allFiles = listedGroups.flat();

    const useSigned = shouldSignUrls();
    const supabase = useSigned ? getSupabaseAdmin() : null;
    const bucket = useSigned ? (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim() : "";

    const withUrls = await Promise.all(
      allFiles.map(async (f) => {
        let url: string | null = null;
        if (useSigned && supabase && bucket) {
          const signed = await supabase.storage.from(bucket).createSignedUrl(f.path, 60 * 60);
          url = signed.data?.signedUrl || null;
        } else {
          url = getStoragePublicUrl(f.path);
        }
        const uploadedAt =
          parseTimestampFromPath(f.path) || f.createdAt || f.updatedAt || null;
        return {
          path: f.path,
          type: f.path.startsWith("models/") ? "model" : "item",
          size: f.size ?? null,
          uploadedAt,
          url,
        };
      })
    );

    withUrls.sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return ta - tb;
    });

    return NextResponse.json({ files: withUrls });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list uploads" }, { status: 500 });
  }
}

