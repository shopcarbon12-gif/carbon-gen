import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/userAuth";
import { getDropboxAccessTokenForUser } from "@/lib/dropbox";

type DropboxFile = {
  id: string;
  name: string;
  path_lower: string;
};

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

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.userId || session.username || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing session user id." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const barcode = String(body?.barcode || "").trim();
  if (!barcode) {
    return NextResponse.json({ error: "Barcode is required." }, { status: 400 });
  }

  try {
    const accessToken = await getDropboxAccessTokenForUser(userId);
    if (!accessToken) {
      return NextResponse.json({ error: "Dropbox is not connected for this user." }, { status: 400 });
    }

    const search = await dropboxRpc(accessToken, "files/search_v2", {
      query: barcode,
      options: {
        path: "",
        max_results: 50,
        filename_only: false,
      },
    });

    const matches = Array.isArray(search?.matches) ? search.matches : [];
    const files: DropboxFile[] = matches
      .map((m: any) => m?.metadata?.metadata)
      .filter((m: any) => m?.[".tag"] === "file")
      .map((m: any) => ({
        id: String(m.id || ""),
        name: String(m.name || ""),
        path_lower: String(m.path_lower || ""),
      }))
      .filter((f: DropboxFile) => f.path_lower && isImageName(f.name));

    const folderPaths = Array.from(new Set(files.map((f) => dirName(f.path_lower)).filter(Boolean))).slice(0, 8);

    const folderImages: Array<{ folderPath: string; images: Array<{ id: string; title: string; pathLower: string; temporaryLink: string }> }> = [];
    for (const folderPath of folderPaths) {
      const list = await dropboxRpc(accessToken, "files/list_folder", {
        path: folderPath,
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        limit: 200,
      });
      const entries = Array.isArray(list?.entries) ? list.entries : [];
      const imageEntries = entries
        .filter((e: any) => e?.[".tag"] === "file" && isImageName(String(e?.name || "")))
        .map((e: any) => ({
          id: String(e.id || ""),
          title: String(e.name || ""),
          pathLower: String(e.path_lower || ""),
        }))
        .slice(0, 80);

      const withLinks = [];
      for (const entry of imageEntries) {
        const link = await getTemporaryLink(accessToken, entry.pathLower);
        if (!link) continue;
        withLinks.push({ ...entry, temporaryLink: link });
      }
      if (withLinks.length) {
        folderImages.push({ folderPath, images: withLinks });
      }
    }

    return NextResponse.json({
      barcode,
      folders: folderImages,
      images: folderImages.flatMap((f) => f.images),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Dropbox search failed." }, { status: 500 });
  }
}

