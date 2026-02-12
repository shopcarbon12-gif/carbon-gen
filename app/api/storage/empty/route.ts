import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type StorageEntry = {
  name: string;
  id: string | null;
};

async function listFilesRecursive(bucket: string, prefix: string) {
  const supabase = getSupabaseAdmin();
  const queue: string[] = [prefix];
  const files: string[] = [];

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
      if (!entry.id) {
        queue.push(childPath);
      } else {
        files.push(childPath);
      }
    }
  }

  return files;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function POST(req: NextRequest) {
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

    const [modelFiles, itemFiles] = await Promise.all([
      listFilesRecursive(bucket, "models"),
      listFilesRecursive(bucket, "items"),
    ]);
    const all = Array.from(new Set([...modelFiles, ...itemFiles]));

    if (!all.length) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const supabase = getSupabaseAdmin();
    let deleted = 0;
    for (const group of chunk(all, 100)) {
      const { error } = await supabase.storage.from(bucket).remove(group);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      deleted += group.length;
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to empty bucket" }, { status: 500 });
  }
}
