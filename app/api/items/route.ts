import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { uploadBytesToStorage } from "@/lib/storageProvider";

const MAX_ITEM_UPLOAD_FILES = Number.parseInt(process.env.ITEM_UPLOAD_MAX_FILES || "", 10) || 60;
const MAX_ITEM_UPLOAD_FILE_BYTES = Number.parseInt(
  process.env.ITEM_UPLOAD_MAX_FILE_BYTES || "",
  10
) || 12 * 1024 * 1024;
const MAX_ITEM_IMPORT_URLS = Number.parseInt(process.env.ITEM_IMPORT_MAX_URLS || "", 10) || 150;
const ITEM_IMPORT_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.ITEM_IMPORT_FETCH_TIMEOUT_MS || "",
  10
) || 15000;

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

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const isMultipart = contentType.includes("multipart/form-data");
    if (isJson || !isMultipart) {
      const body = await req.json().catch(() => null);
      if (isJson && !body) {
        return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
      }
      const inputUrls = Array.isArray(body?.urls)
        ? body.urls.filter((u: unknown): u is string => typeof u === "string" && !!u.trim())
        : [];
      if (!inputUrls.length && isJson) {
        return NextResponse.json(
          { error: "No Shopify image URLs selected." },
          { status: 400 }
        );
      }
      if (inputUrls.length) {
        if (inputUrls.length > MAX_ITEM_IMPORT_URLS) {
          return NextResponse.json(
            { error: `Too many source URLs. Maximum allowed is ${MAX_ITEM_IMPORT_URLS}.` },
            { status: 413 }
          );
        }
        const folderPrefix = sanitizeFolderPrefix(body?.folderPrefix);

        const batchId = crypto.randomUUID();
        const importConcurrency = Number.parseInt(process.env.ITEM_IMPORT_CONCURRENCY || "4", 10) || 4;
        const urls = await mapWithConcurrency<string, string>(
          inputUrls,
          importConcurrency,
          async (sourceUrl, i) => {
          const remote = await fetchWithTimeout(sourceUrl, ITEM_IMPORT_FETCH_TIMEOUT_MS);
          if (!remote.ok) {
            throw new Error(`Failed to fetch catalog image (${remote.status})`);
          }

          const remoteContentType = remote.headers.get("content-type") || "application/octet-stream";
          if (!String(remoteContentType).toLowerCase().startsWith("image/")) {
            throw new Error("Source URL is not an image.");
          }
          const remoteLengthRaw = remote.headers.get("content-length");
          const remoteLength = remoteLengthRaw ? Number.parseInt(remoteLengthRaw, 10) : 0;
          if (remoteLength > MAX_ITEM_UPLOAD_FILE_BYTES) {
            throw new Error(
              `Source image is too large. Max size is ${Math.floor(
                MAX_ITEM_UPLOAD_FILE_BYTES / (1024 * 1024)
              )}MB.`
            );
          }
          const arrayBuffer = await remote.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          if (bytes.byteLength > MAX_ITEM_UPLOAD_FILE_BYTES) {
            throw new Error(
              `Source image is too large. Max size is ${Math.floor(
                MAX_ITEM_UPLOAD_FILE_BYTES / (1024 * 1024)
              )}MB.`
            );
          }
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

      if (!isMultipart) {
        return NextResponse.json(
          { error: "Unsupported request body. Use JSON or multipart form-data." },
          { status: 415 }
        );
      }
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form-data body. Please retry the upload." },
        { status: 400 }
      );
    }
    const files = form.getAll("files").filter(Boolean) as File[];
    const folderPrefix = sanitizeFolderPrefix(form.get("folderPrefix"));

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }
    if (files.length > MAX_ITEM_UPLOAD_FILES) {
      return NextResponse.json(
        { error: `Too many files. Maximum allowed is ${MAX_ITEM_UPLOAD_FILES}.` },
        { status: 413 }
      );
    }
    const invalidType = files.find(
      (file) => !String(file.type || "").toLowerCase().startsWith("image/")
    );
    if (invalidType) {
      return NextResponse.json(
        { error: `Unsupported file type for "${invalidType.name}". Only images are allowed.` },
        { status: 415 }
      );
    }
    const tooLarge = files.find((file) => file.size > MAX_ITEM_UPLOAD_FILE_BYTES);
    if (tooLarge) {
      return NextResponse.json(
        {
          error: `File "${tooLarge.name}" is too large. Max size is ${Math.floor(
            MAX_ITEM_UPLOAD_FILE_BYTES / (1024 * 1024)
          )}MB.`,
        },
        { status: 413 }
      );
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
