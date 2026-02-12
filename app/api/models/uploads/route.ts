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

async function listModelFilesRecursive(bucket: string) {
  const supabase = getSupabaseAdmin();
  const files: Array<{ path: string; created_at?: string | null }> = [];
  const queue: string[] = ["models"];

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
        });
      }
    }
  }

  return files;
}

export async function GET(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
    if (!bucket) {
      return NextResponse.json({ error: "Missing SUPABASE_STORAGE_BUCKET_ITEMS" }, { status: 500 });
    }

    // Metadata map from saved models table (name + gender), unscoped by cookie user id.
    const { data: modelRows, error } = await supabase
      .from("models")
      .select("name,gender,created_at,ref_image_urls")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const metadataByPath = new Map<
      string,
      { modelName: string; gender: string; createdAt: string | null }
    >();
    for (const row of modelRows || []) {
      const urls = Array.isArray((row as any).ref_image_urls) ? (row as any).ref_image_urls : [];
      for (const rawUrl of urls) {
        const parsed = extractPathFromStorageUrl(String(rawUrl || ""));
        if (!parsed) continue;
        metadataByPath.set(parsed.objectPath, {
          modelName: String((row as any).name || ""),
          gender: normalizeGender((row as any).gender),
          createdAt: String((row as any).created_at || "") || null,
        });
      }
    }

    const storageFiles = await listModelFilesRecursive(bucket);

    const entries: Array<{
      id: string;
      path: string;
      fileName: string;
      modelName: string;
      gender: string;
      uploadedAt: string | null;
      url: string | null;
    }> = [];
    for (const file of storageFiles) {
      const fileName = fileNameFromPath(file.path);
      const meta = metadataByPath.get(file.path);
      const signed = await supabase.storage.from(bucket).createSignedUrl(file.path, 60 * 60);
      entries.push({
        id: `${bucket}/${file.path}`,
        path: file.path,
        fileName,
        modelName: meta?.modelName || "",
        gender: meta?.gender || "",
        uploadedAt: timestampFromFileName(fileName) || meta?.createdAt || file.created_at || null,
        url: signed.data?.signedUrl || null,
      });
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
