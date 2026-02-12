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
  "components/studio-workspace.tsx",
  "app/api/generate/route.ts",
  "app/api/openai/dialog/route.ts",
  "app/api/shopify/catalog/route.ts",
];

const DASHBOARD_FILE = "app/dashboard/page.tsx";
const STUDIO_FILE = "app/studio/page.tsx";
const SHARED_WORKSPACE_FILE = "components/studio-workspace.tsx";

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

async function readFileText(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}

function usesSharedWorkspace(content: string | null) {
  if (!content) return false;
  const importsShared = /from\s+["']@\/components\/studio-workspace["']/.test(content);
  const rendersShared = /<StudioWorkspace\s*\/>/.test(content);
  return importsShared && rendersShared;
}

export async function GET() {
  const [fingerprints, dashboardText, studioText] = await Promise.all([
    Promise.all(TARGET_FILES.map((file) => hashFile(file))),
    readFileText(DASHBOARD_FILE),
    readFileText(STUDIO_FILE),
  ]);

  const combinedInput = fingerprints
    .map((entry) => `${entry.path}:${entry.exists ? entry.hash : "missing"}`)
    .join("|");
  const fingerprint = createHash("sha256").update(combinedInput).digest("hex");

  const dashboardHash = fingerprints.find((f) => f.path === DASHBOARD_FILE)?.hash ?? null;
  const studioHash = fingerprints.find((f) => f.path === STUDIO_FILE)?.hash ?? null;
  const sharedWorkspaceHash =
    fingerprints.find((f) => f.path === SHARED_WORKSPACE_FILE)?.hash ?? null;

  const mirroredPagesSynced = Boolean(
    dashboardHash && studioHash && dashboardHash === studioHash
  );
  const sharedComponentSynced = Boolean(
    sharedWorkspaceHash && usesSharedWorkspace(dashboardText) && usesSharedWorkspace(studioText)
  );
  const dashboardStudioSynced = mirroredPagesSynced || sharedComponentSynced;
  const dashboardStudioSyncMode = mirroredPagesSynced
    ? "mirrored_pages"
    : sharedComponentSynced
    ? "shared_component"
    : "out_of_sync";

  return NextResponse.json({
    ok: true,
    fingerprint,
    dashboardStudioSynced,
    dashboardStudioSyncMode,
    files: fingerprints.map((f) => ({
      path: f.path,
      exists: f.exists,
      hash12: f.hash ? f.hash.slice(0, 12) : null,
    })),
    checkedAt: new Date().toISOString(),
  });
}
