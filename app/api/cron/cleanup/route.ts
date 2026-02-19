import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteStorageObjects, listStorageFiles } from "@/lib/storageProvider";

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
  const groups = await Promise.all(PREFIXES.map((p) => listStorageFiles(p)));
  const allPaths = Array.from(new Set(groups.flat().map((f) => f.path)));

  if (!allPaths.length) {
    return { deleted: 0, prefixes: PREFIXES };
  }

  const result = await deleteStorageObjects(allPaths);
  return { deleted: result.deleted, prefixes: PREFIXES };
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
