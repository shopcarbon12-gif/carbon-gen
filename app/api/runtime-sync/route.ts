import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

type FileFingerprint = {
  path: string;
  exists: boolean;
  hash: string | null;
};

const TARGET_FILES = [
  "app/dashboard/page.tsx",
  "app/studio/page.tsx",
  "app/api/generate/route.ts",
  "app/api/openai/dialog/route.ts",
  "app/api/shopify/catalog/route.ts",
];

async function hashFile(relativePath: string): Promise<FileFingerprint> {
  const absolutePath = path.join(process.cwd(), relativePath);
  try {
    const content = await fs.readFile(absolutePath);
    const hash = createHash("sha256").update(content).digest("hex");
    return { path: relativePath, exists: true, hash };
  } catch {
    return { path: relativePath, exists: false, hash: null };
  }
}

export async function GET() {
  const fingerprints = await Promise.all(TARGET_FILES.map((file) => hashFile(file)));
  const combinedInput = fingerprints
    .map((entry) => `${entry.path}:${entry.exists ? entry.hash : "missing"}`)
    .join("|");
  const fingerprint = createHash("sha256").update(combinedInput).digest("hex");

  const dashboardHash = fingerprints.find((f) => f.path === "app/dashboard/page.tsx")?.hash ?? null;
  const studioHash = fingerprints.find((f) => f.path === "app/studio/page.tsx")?.hash ?? null;

  return NextResponse.json({
    ok: true,
    fingerprint,
    dashboardStudioSynced: Boolean(dashboardHash && studioHash && dashboardHash === studioHash),
    files: fingerprints.map((f) => ({
      path: f.path,
      exists: f.exists,
      hash12: f.hash ? f.hash.slice(0, 12) : null,
    })),
    checkedAt: new Date().toISOString(),
  });
}

