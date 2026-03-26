import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let memo: string | null = null;

/**
 * Directory for JSON/file fallbacks when Postgres is not used.
 * Coolify/Docker often cannot create `process.cwd()/.tmp` — falls back to OS temp.
 */
export function getCarbonAppDataDir(): string {
  if (memo) return memo;
  const fromEnv = (process.env.CARBON_APP_DATA_DIR || process.env.ACCESSIBILITY_DATA_DIR || "").trim();
  if (fromEnv) {
    fs.mkdirSync(fromEnv, { recursive: true });
    memo = fromEnv;
    return memo;
  }
  const preferred = path.join(process.cwd(), ".tmp");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    memo = preferred;
    return memo;
  } catch {
    const fallback = path.join(os.tmpdir(), "carbon-gen-data");
    fs.mkdirSync(fallback, { recursive: true });
    memo = fallback;
    return memo;
  }
}
