import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteStorageObjects, isR2StorageConfigured, listStorageFiles } from "@/lib/storageProvider";
import { getProtectedModelStoragePaths } from "@/lib/modelImageProtection";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId =
      req.cookies.get("carbon_gen_user_id")?.value?.trim() ||
      req.cookies.get("carbon_gen_username")?.value?.trim() ||
      DEFAULT_SESSION_USER_ID;
    const uploadPrefix = `models/uploads/${userId}`;
    if (!isR2StorageConfigured()) {
      return NextResponse.json({ ok: true, deleted: 0, prefix: uploadPrefix, skipped: true });
    }
    // Saved models reference their photos under models/uploads/<user>/..., so skip
    // any upload that belongs to a saved model — clearing the staging tray must not
    // delete saved models' reference images.
    const protectedPaths = await getProtectedModelStoragePaths();
    const files = await listStorageFiles(uploadPrefix);
    const paths = Array.from(new Set(files.map((file) => file.path).filter(Boolean))).filter(
      (p) => !protectedPaths.has(p)
    );
    if (!paths.length) {
      return NextResponse.json({
        ok: true,
        deleted: 0,
        prefix: uploadPrefix,
        skippedProtected: protectedPaths.size,
      });
    }

    const result = await deleteStorageObjects(paths);
    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      prefix: uploadPrefix,
      skippedProtected: protectedPaths.size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to clean model uploads." }, { status: 500 });
  }
}
