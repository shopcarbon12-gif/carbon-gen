import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/userAuth";
import { getDropboxAccessTokenForSession } from "@/lib/dropbox";

type DropboxFile = {
  id: string;
  name: string;
  path_lower: string;
};

const DEFAULT_DROPBOX_SEARCH_ROOT = "/carbon";
const DROPBOX_SEARCH_ROOT = process.env.DROPBOX_SEARCH_ROOT || DEFAULT_DROPBOX_SEARCH_ROOT;
const MAX_FALLBACK_SCAN_ENTRIES = 4000;
const DROPBOX_LINK_CONCURRENCY = 8;
const DROPBOX_FOLDER_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const out: R[] = new Array(items.length);
  let index = 0;
  const run = async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await worker(items[current], current);
    }
  };
  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () => run());
  await Promise.all(workers);
  return out;
}

function normalizePath(path: string) {
  let v = String(path || "").trim().toLowerCase();
  if (!v.startsWith("/")) v = `/${v}`;
  return v.replace(/\/+$/, "");
}

function isValidBarcode(value: string) {
  const v = String(value || "").trim();
  return /^(?:[cC]\d{6,8}|\d{7,9})$/.test(v);
}

function normalizeBarcode(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^c0-9]/g, "")
    .trim();
}

function buildBarcodeCandidates(barcode: string) {
  const v = normalizeBarcode(barcode);
  const set = new Set<string>();
  if (!v) return [];
  set.add(v);
  if (v.startsWith("c")) {
    const digits = v.slice(1);
    if (digits) set.add(digits);
  } else {
    set.add(`c${v}`);
  }
  return Array.from(set).filter(Boolean);
}

function pathHasBarcodeToken(pathLower: string, tokens: string[]) {
  const p = normalizePath(pathLower);
  return tokens.some((t) => p.includes(t));
}

function isImageName(name: string) {
  return /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|tif|tiff|webp)$/i.test(name);
}

function dirName(pathLower: string) {
  const clean = String(pathLower || "").trim();
  const idx = clean.lastIndexOf("/");
  if (idx <= 0) return "";
  return clean.slice(0, idx);
}

async function dropboxRpc(accessToken: string, endpoint: string, body: any) {
  const resp = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error_summary || json?.error || `Dropbox API failed: ${endpoint}`);
  }
  return json;
}

async function getTemporaryLink(accessToken: string, path: string) {
  const data = await dropboxRpc(accessToken, "files/get_temporary_link", { path });
  return String(data?.link || "");
}

function isDropboxPathNotFoundError(error: unknown) {
  const msg = String((error as any)?.message || "");
  return msg.includes("path/not_found");
}

async function validateDropboxFolderPath(accessToken: string, path: string) {
  await dropboxRpc(accessToken, "files/get_metadata", {
    path,
    include_deleted: false,
  });
}

async function resolveSearchRoot(accessToken: string, configuredRoot: string) {
  const candidates = Array.from(
    new Set(
      [configuredRoot, DEFAULT_DROPBOX_SEARCH_ROOT]
        .map((p) => normalizePath(p))
        .filter((p) => p && p !== "/")
    )
  );
  for (const candidate of candidates) {
    try {
      await validateDropboxFolderPath(accessToken, candidate);
      return candidate;
    } catch (error) {
      if (!isDropboxPathNotFoundError(error)) throw error;
    }
  }
  throw new Error(
    `Dropbox search root not found. Checked: ${candidates.join(", ")}. Set DROPBOX_SEARCH_ROOT to a valid folder.`
  );
}

async function listFolderRecursive(accessToken: string, rootPath: string) {
  const collected: any[] = [];
  let page = await dropboxRpc(accessToken, "files/list_folder", {
    path: rootPath,
    recursive: true,
    include_media_info: false,
    include_deleted: false,
    limit: 2000,
  });

  const pushEntries = (entries: any[]) => {
    for (const entry of entries) {
      collected.push(entry);
      if (collected.length >= MAX_FALLBACK_SCAN_ENTRIES) break;
    }
  };

  pushEntries(Array.isArray(page?.entries) ? page.entries : []);
  while (page?.has_more && page?.cursor && collected.length < MAX_FALLBACK_SCAN_ENTRIES) {
    page = await dropboxRpc(accessToken, "files/list_folder/continue", { cursor: page.cursor });
    pushEntries(Array.isArray(page?.entries) ? page.entries : []);
  }
  return collected;
}

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.userId || session.username || "";
  const username = session.username || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing session user id." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const barcode = normalizeBarcode(String(body?.barcode || ""));
  if (!barcode) {
    return NextResponse.json({ error: "Barcode is required." }, { status: 400 });
  }
  if (!isValidBarcode(barcode)) {
    return NextResponse.json(
      { error: "Barcode must be 7-9 chars: digits only, or C + 6-8 digits." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getDropboxAccessTokenForSession({ userId, username });
    if (!accessToken) {
      return NextResponse.json({ error: "Dropbox is not connected for this user." }, { status: 400 });
    }

    const rootPath = await resolveSearchRoot(accessToken, DROPBOX_SEARCH_ROOT);
    const barcodeCandidates = buildBarcodeCandidates(barcode);
    const searchQueries = barcodeCandidates.slice(0, 2);
    const searchResults = await Promise.all(
      searchQueries.map((query) =>
        dropboxRpc(accessToken, "files/search_v2", {
          query,
          options: {
            path: rootPath,
            max_results: 50,
            filename_only: false,
          },
        })
      )
    );
    const matches = searchResults.flatMap((search) =>
      Array.isArray(search?.matches) ? search.matches : []
    );
    const matchedFiles: DropboxFile[] = [];
    const matchedFolders: string[] = [];
    for (const match of matches) {
      const m = match?.metadata?.metadata;
      const tag = String(m?.[".tag"] || "");
      const p = normalizePath(String(m?.path_lower || ""));
      if (!p || !p.startsWith(rootPath)) continue;
      if (!pathHasBarcodeToken(p, barcodeCandidates)) continue;
      if (tag === "file") {
        const name = String(m?.name || "");
        if (isImageName(name)) {
          matchedFiles.push({
            id: String(m?.id || ""),
            name,
            path_lower: p,
          });
        }
      } else if (tag === "folder") {
        matchedFolders.push(p);
      }
    }

    if (!matchedFiles.length && !matchedFolders.length) {
      const scanned = await listFolderRecursive(accessToken, rootPath);
      for (const entry of scanned) {
        const tag = String(entry?.[".tag"] || "");
        const p = normalizePath(String(entry?.path_lower || ""));
        if (!p || !p.startsWith(rootPath) || !pathHasBarcodeToken(p, barcodeCandidates)) continue;
        if (tag === "folder") {
          matchedFolders.push(p);
          continue;
        }
        if (tag === "file" && isImageName(String(entry?.name || ""))) {
          matchedFiles.push({
            id: String(entry?.id || ""),
            name: String(entry?.name || ""),
            path_lower: p,
          });
        }
      }
    }

    const folderPaths = Array.from(
      new Set([...matchedFolders, ...matchedFiles.map((f) => dirName(f.path_lower)).filter(Boolean)])
    ).slice(0, 20);

    const folderImages: Array<{
      folderPath: string;
      webUrl: string;
      images: Array<{ id: string; title: string; pathLower: string; temporaryLink: string }>;
    }> = [];
    const temporaryLinkCache = new Map<string, Promise<string>>();
    const getCachedTemporaryLink = (pathLower: string) => {
      const key = normalizePath(pathLower);
      const existing = temporaryLinkCache.get(key);
      if (existing) return existing;
      const created = getTemporaryLink(accessToken, key).catch(() => "");
      temporaryLinkCache.set(key, created);
      return created;
    };
    const imageByPath = new Map<
      string,
      { id: string; title: string; pathLower: string; temporaryLink: string }
    >();

    const matchedFileLinks = await mapWithConcurrency(
      matchedFiles,
      DROPBOX_LINK_CONCURRENCY,
      async (file) => {
        const link = await getCachedTemporaryLink(file.path_lower);
        if (!link) return null;
        return {
          id: file.id,
          title: file.name,
          pathLower: file.path_lower,
          temporaryLink: link,
        };
      }
    );
    for (const row of matchedFileLinks) {
      if (!row) continue;
      imageByPath.set(row.pathLower, row);
    }

    const folderResults = await mapWithConcurrency(
      folderPaths,
      DROPBOX_FOLDER_CONCURRENCY,
      async (folderPath) => {
        const list = await dropboxRpc(accessToken, "files/list_folder", {
          path: folderPath,
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          limit: 200,
        });
        const entries = Array.isArray(list?.entries) ? list.entries : [];
        const imageEntries: Array<{ id: string; title: string; pathLower: string }> = entries
          .filter((e: any) => {
            if (e?.[".tag"] !== "file") return false;
            const p = normalizePath(String(e?.path_lower || ""));
            return p.startsWith(rootPath) && isImageName(String(e?.name || ""));
          })
          .map((e: any) => ({
            id: String(e.id || ""),
            title: String(e.name || ""),
            pathLower: String(e.path_lower || ""),
          }))
          .slice(0, 80);

        const withLinksRaw = await mapWithConcurrency(
          imageEntries,
          DROPBOX_LINK_CONCURRENCY,
          async (entry: { id: string; title: string; pathLower: string }) => {
            const link = await getCachedTemporaryLink(entry.pathLower);
            if (!link) return null;
            return { ...entry, temporaryLink: link };
          }
        );
        const withLinks = withLinksRaw.filter(
          (row): row is { id: string; title: string; pathLower: string; temporaryLink: string } =>
            Boolean(row)
        );
        return { folderPath, withLinks };
      }
    );

    for (const { folderPath, withLinks } of folderResults) {
      for (const row of withLinks) {
        imageByPath.set(row.pathLower, row);
      }
      if (withLinks.length) {
        folderImages.push({
          folderPath,
          webUrl: `https://www.dropbox.com/home${folderPath}`,
          images: withLinks,
        });
      }
    }

    const images = Array.from(imageByPath.values());

    return NextResponse.json({
      barcode,
      folders: folderImages,
      images,
      rootPath,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Dropbox search failed." }, { status: 500 });
  }
}
