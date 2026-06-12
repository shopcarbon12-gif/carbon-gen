import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteStorageObjects, listStorageFiles } from "@/lib/storageProvider";
import { getProtectedModelStoragePaths } from "@/lib/modelImageProtection";

export async function POST(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const prefix = String(body?.prefix || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    const targetPrefixes = prefix
      ? [prefix]
      : ["models", "items"];

    // Never delete reference photos of SAVED models, even on a manual bulk empty.
    // Resolved before listing; if the DB lookup throws, abort (fail safe).
    const protectedPaths = await getProtectedModelStoragePaths();

    const listedGroups = await Promise.all(
      targetPrefixes.map((p) => listStorageFiles(p))
    );
    const all = Array.from(new Set(listedGroups.flat().map((file) => file.path))).filter(
      (p) => !protectedPaths.has(p)
    );

    if (!all.length) {
      return NextResponse.json({ ok: true, deleted: 0, skippedProtected: protectedPaths.size });
    }

    const result = await deleteStorageObjects(all);

    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      skippedProtected: protectedPaths.size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to empty bucket" }, { status: 500 });
  }
}
