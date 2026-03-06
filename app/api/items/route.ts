import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { uploadBytesToStorage } from "@/lib/storageProvider";

function sanitizeFileName(input: string) {
  const base = input.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return base || "catalog-image.jpg";
}

function guessFileNameFromUrl(rawUrl: string, index: number) {
  try {
    const parsed = new URL(rawUrl);
    const segment = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    if (segment) return sanitizeFileName(segment);
  } catch {
    // Fall back to index-based name below.
  }
  return `catalog-image-${index + 1}.jpg`;
}

function sanitizeFolderPrefix(input: unknown) {
  const raw = String(input || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!raw) return "items";
  if (!/^(?:items|final-results)(?:\/[a-zA-Z0-9._-]+)*$/.test(raw)) return "items";
  return raw;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  };

  const concurrency = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const inputUrls = Array.isArray(body?.urls)
        ? body.urls.filter((u: unknown): u is string => typeof u === "string" && !!u.trim())
        : [];
      if (!inputUrls.length) {
        return NextResponse.json(
          { error: "No Shopify image URLs selected." },
          { status: 400 }
        );
      }
      const folderPrefix = sanitizeFolderPrefix(body?.folderPrefix);

      const batchId = crypto.randomUUID();
      const importConcurrency = Number.parseInt(process.env.ITEM_IMPORT_CONCURRENCY || "4", 10) || 4;
      const urls = await mapWithConcurrency<string, string>(
        inputUrls,
        importConcurrency,
        async (sourceUrl, i) => {
        const remote = await fetch(sourceUrl);
        if (!remote.ok) {
          throw new Error(`Failed to fetch catalog image (${remote.status})`);
        }

        const arrayBuffer = await remote.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const remoteContentType = remote.headers.get("content-type") || "application/octet-stream";
        const safeName = guessFileNameFromUrl(sourceUrl, i);
        const path = `${folderPrefix}/${batchId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

        const uploaded = await uploadBytesToStorage({
          path,
          bytes,
          contentType: remoteContentType,
        });
        return uploaded.url;
        }
      );

      return NextResponse.json({ urls });
    }

    const form = await req.formData();
    const files = form.getAll("files").filter(Boolean) as File[];
    const folderPrefix = sanitizeFolderPrefix(form.get("folderPrefix"));

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const batchId = crypto.randomUUID();
    const uploadConcurrency = Number.parseInt(process.env.ITEM_UPLOAD_CONCURRENCY || "4", 10) || 4;
    const urls = await mapWithConcurrency<File, string>(files, uploadConcurrency, async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${folderPrefix}/${batchId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

      const uploaded = await uploadBytesToStorage({
        path,
        bytes,
        contentType: file.type || "application/octet-stream",
      });
      return uploaded.url;
    });

    return NextResponse.json({ urls });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Item upload failed" }, { status: 500 });
  }
}
