/**
 * Ensures role meta_review and user meta-review@shopcarbon.com exist (for Meta App Review).
 *
 * Usage:
 *   node scripts/seed-meta-review-user.mjs <password>
 *   META_REVIEW_SEED_PASSWORD=... node scripts/seed-meta-review-user.mjs
 *
 * Loads `.env.local` then `.env` from the project root when present.
 * Requires DATABASE_URL, COOLIFY_DATABASE_URL, or POSTGRES_URL (or .coolify-database-url file).
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const root = process.cwd();
for (const name of [".env.local", ".env"]) {
  const p = resolve(root, name);
  if (existsSync(p)) loadEnv({ path: p });
}
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const USERNAME = "meta-review@shopcarbon.com";
const ROLE = "meta_review";

function getDatabaseUrl() {
  const fileCandidates = [
    (process.env.COOLIFY_DATABASE_URL_FILE || "").trim(),
    "/app/.coolify-database-url",
  ].filter(Boolean);
  for (const path of fileCandidates) {
    try {
      const value = readFileSync(path, "utf8").trim();
      if (value) return value;
    } catch {
      /* continue */
    }
  }
  return (
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
    (process.env.POSTGRES_URL || "").trim() ||
    (process.env.DATABASE_URL || "").trim()
  );
}

const password = process.argv[2] || (process.env.META_REVIEW_SEED_PASSWORD || "").trim();
if (!password || password.length < 8) {
  console.error(
    "Provide password (min 8 chars): node scripts/seed-meta-review-user.mjs <password> or META_REVIEW_SEED_PASSWORD"
  );
  process.exit(1);
}

const connectionString = getDatabaseUrl();
if (!connectionString) {
  console.error("Missing database URL (DATABASE_URL / COOLIFY_DATABASE_URL / POSTGRES_URL).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  await pool.query(
    `INSERT INTO app_roles (name, is_system) VALUES ($1, true) ON CONFLICT (name) DO NOTHING`,
    [ROLE]
  );

  const hash = await bcrypt.hash(password, 12);
  const uname = USERNAME.trim().toLowerCase();

  const existing = await pool.query(
    `SELECT id FROM app_users WHERE username = $1 LIMIT 1`,
    [uname]
  );

  if (existing.rows[0]?.id) {
    await pool.query(
      `UPDATE app_users SET password_hash = $1, role = $2, is_active = true, updated_at = now() WHERE username = $3`,
      [hash, ROLE, uname]
    );
    console.log("Updated existing user:", USERNAME, "role:", ROLE);
  } else {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO app_users (id, username, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [id, uname, hash, ROLE]
    );
    console.log("Created user:", USERNAME, "role:", ROLE);
  }
} finally {
  await pool.end();
}
