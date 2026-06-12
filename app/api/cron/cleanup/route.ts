import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteStorageObjects, listStorageFiles } from "@/lib/storageProvider";
import { getProtectedModelStoragePaths } from "@/lib/modelImageProtection";

const PREFIXES = ["models", "items", "final-results"];

function isAuthorized(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;

  const authHeader = req.headers.get("authorization") || "";
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

async function runCleanup() {
  // Resolve saved-model paths FIRST. If the DB lookup throws, we let it bubble up
  // so the whole cleanup aborts instead of deleting saved models' photos.
  const protectedPaths = await getProtectedModelStoragePaths();

  const groups = await Promise.all(PREFIXES.map((p) => listStorageFiles(p)));
  const allPaths = Array.from(new Set(groups.flat().map((f) => f.path)));

  const deletable = allPaths.filter((p) => !protectedPaths.has(p));
  const skippedProtected = allPaths.length - deletable.length;

  if (!deletable.length) {
    return {
      deleted: 0,
      skippedProtected,
      protectedModelImages: protectedPaths.size,
      prefixes: PREFIXES,
    };
  }

  const result = await deleteStorageObjects(deletable);
  return {
    deleted: result.deleted,
    skippedProtected,
    protectedModelImages: protectedPaths.size,
    prefixes: PREFIXES,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCleanup();
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Cleanup failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
