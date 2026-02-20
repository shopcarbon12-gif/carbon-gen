import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";

const LS_CRED_KEYS = ["LS_CLIENT_ID", "LS_CLIENT_SECRET", "LS_REFRESH_TOKEN"] as const;

function getEnvLocalPaths(): string[] {
  const cwd = process.cwd();
  return [join(cwd, ".env.local"), resolve(cwd, ".env.local")];
}

/**
 * If LS credentials are missing from process.env, try loading them from .env.local.
 * Uses dotenv for robust parsing. Tries multiple paths in case cwd differs at runtime.
 */
export function ensureLightspeedEnvLoaded(): void {
  const credsMissing = LS_CRED_KEYS.some(
    (k) => !process.env[k] || String(process.env[k]).trim() === ""
  );
  if (!credsMissing) return;

  for (const envPath of getEnvLocalPaths()) {
    if (!existsSync(envPath)) continue;
    try {
      const result = config({ path: envPath, override: false });
      if (result.parsed) {
        for (const k of LS_CRED_KEYS) {
          const v = result.parsed[k];
          if (v && String(v).trim() && !process.env[k]?.trim()) {
            process.env[k] = String(v).trim();
          }
        }
      }
      if (!LS_CRED_KEYS.some((k) => !process.env[k]?.trim())) break;
    } catch {
      continue;
    }
  }

  if (LS_CRED_KEYS.some((k) => !process.env[k]?.trim())) {
    try {
      const envPath = getEnvLocalPaths()[0];
      if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.startsWith("#") || !trimmed) continue;
          const eq = trimmed.indexOf("=");
          if (eq <= 0) continue;
          const key = trimmed.slice(0, eq).trim();
          if (!LS_CRED_KEYS.includes(key as (typeof LS_CRED_KEYS)[number])) continue;
          if (process.env[key]?.trim()) continue;
          let val = trimmed.slice(eq + 1).trim();
          const commentIdx = val.search(/\s+#/);
          if (commentIdx >= 0) val = val.slice(0, commentIdx).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) process.env[key] = val;
        }
      }
    } catch {
      // ignore
    }
  }
}
