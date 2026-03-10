import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getStoragePublicUrl, listStorageFiles } from "@/lib/storageProvider";

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

    const prefix = String(req.nextUrl.searchParams.get("prefix") || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    const barcode = String(req.nextUrl.searchParams.get("barcode") || "").trim().toLowerCase();
    const sort = String(req.nextUrl.searchParams.get("sort") || "asc").trim().toLowerCase();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 300;

    const targetPrefixes = prefix ? [prefix] : ["models", "items"];
    const listedGroups = await Promise.all(
      targetPrefixes.map((p) => listStorageFiles(p))
    );
    const allFiles = listedGroups.flat();

    const withUrls = await Promise.all(
      allFiles.map(async (f) => {
        const url = getStoragePublicUrl(f.path);
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

    const filtered = barcode
      ? withUrls.filter((row) => {
          const hay = `${row.path} ${row.url}`.toLowerCase();
          return hay.includes(barcode);
        })
      : withUrls;

    filtered.sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return sort === "desc" ? tb - ta : ta - tb;
    });

    return NextResponse.json({ files: filtered.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list uploads" }, { status: 500 });
  }
}

