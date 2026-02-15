import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type StorageEntry = {
  name: string;
  id: string | null;
  metadata?: { size?: number } | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function listFilesRecursive(bucket: string, prefix: string) {
  const supabase = getSupabaseAdmin();
  const files: Array<{ path: string; created_at?: string | null; size?: number | null }> = [];
  const queue: string[] = [prefix];

  while (queue.length) {
    const current = queue.shift() as string;
    const { data, error } = await supabase.storage.from(bucket).list(current, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(error.message);
    }

    for (const entry of (data || []) as StorageEntry[]) {
      const childPath = `${current}/${entry.name}`.replace(/^\/+/, "");
      const isFolder = !entry.id;
      if (isFolder) {
        queue.push(childPath);
      } else {
        files.push({
          path: childPath,
          created_at: entry.created_at || entry.updated_at || null,
          size: entry.metadata?.size ?? null,
        });
      }
    }
  }

  return files;
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

export async function GET(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
    if (!bucket) {
      return NextResponse.json(
        { error: "Missing SUPABASE_STORAGE_BUCKET_ITEMS" },
        { status: 500 }
      );
    }

    const prefix = String(req.nextUrl.searchParams.get("prefix") || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    const targetPrefixes = prefix
      ? [prefix]
      : ["models", "items"];
    const listedGroups = await Promise.all(
      targetPrefixes.map((p) => listFilesRecursive(bucket, p))
    );
    const allFiles = listedGroups.flat();

    const supabase = getSupabaseAdmin();
    const withUrls = await Promise.all(
      allFiles.map(async (f) => {
        const signed = await supabase.storage.from(bucket).createSignedUrl(f.path, 60 * 60);
        const uploadedAt = parseTimestampFromPath(f.path) || f.created_at || null;
        return {
          path: f.path,
          type: f.path.startsWith("models/") ? "model" : "item",
          size: f.size ?? null,
          uploadedAt,
          url: signed.data?.signedUrl || null,
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

