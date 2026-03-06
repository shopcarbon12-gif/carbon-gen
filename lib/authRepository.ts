import { readFileSync } from "node:fs";
import { Pool } from "pg";

export type AuthDbMode = "postgres";

export type AuthUserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AuthRoleRow = {
  name: string;
  is_system: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type RolePermissionRow = {
  role_name: string;
  permission_key: string;
  allowed: boolean;
};

let cachedMode: AuthDbMode | null = null;
let pgPool: Pool | null = null;
let pgReady = false;
let fileConnectionChecked = false;
let fileConnectionString = "";

function resolvePgConnectionFromFile() {
  if (fileConnectionChecked) return fileConnectionString;
  fileConnectionChecked = true;

  const candidates = [
    (process.env.COOLIFY_DATABASE_URL_FILE || "").trim(),
    "/app/.coolify-database-url",
  ].filter(Boolean);

  for (const path of candidates) {
    try {
      const value = readFileSync(path, "utf8").trim();
      if (value) {
        fileConnectionString = value;
        return fileConnectionString;
      }
    } catch {
      // Ignore unreadable file and continue fallback chain.
    }
  }
  return "";
}

function normalizeMode(value: unknown) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "postgres") return "postgres";
  return "postgres";
}

function hasCoolifySqlHint() {
  return Boolean(
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
      (process.env.COOLIFY_DATABASE_URL_FILE || "").trim() ||
      (process.env.DATABASE_URL_FILE || "").trim() ||
      process.env.COOLIFY_FQDN
  );
}

function resolveMode(): AuthDbMode {
  if (cachedMode) return cachedMode;
  const explicit = normalizeMode(process.env.RUNTIME_DB_PROVIDER);
  cachedMode = explicit === "postgres" || hasCoolifySqlHint() ? "postgres" : "postgres";
  return cachedMode;
}

function getPgPool() {
  if (pgPool) return pgPool;
  const url =
    resolvePgConnectionFromFile() ||
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
    (process.env.POSTGRES_URL || "").trim() ||
    (process.env.DATABASE_URL || "").trim();
  if (!url) {
    throw new Error("Postgres mode enabled but COOLIFY_DATABASE_URL/POSTGRES_URL/DATABASE_URL is missing.");
  }
  pgPool = new Pool({ connectionString: url });
  return pgPool;
}

async function ensurePgReady() {
  if (pgReady) return;
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_roles (
      name TEXT PRIMARY KEY,
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT fk_app_users_role FOREIGN KEY (role) REFERENCES app_roles(name)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_role_permissions (
      role_name TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      allowed BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (role_name, permission_key),
      CONSTRAINT fk_permissions_role FOREIGN KEY (role_name) REFERENCES app_roles(name) ON DELETE CASCADE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_users_active_role ON app_users(is_active, role)`);
  pgReady = true;
}

function toUser(row: any): AuthUserRow {
  return {
    id: String(row?.id || ""),
    username: String(row?.username || ""),
    password_hash: String(row?.password_hash || ""),
    role: String(row?.role || "user"),
    is_active: Boolean(row?.is_active),
    created_at: row?.created_at ? String(row.created_at) : null,
    updated_at: row?.updated_at ? String(row.updated_at) : null,
  };
}

function toRole(row: any): AuthRoleRow {
  return {
    name: String(row?.name || ""),
    is_system: Boolean(row?.is_system),
    created_at: row?.created_at ? String(row.created_at) : null,
    updated_at: row?.updated_at ? String(row.updated_at) : null,
  };
}

export function getAuthDbMode(): AuthDbMode {
  return resolveMode();
}

export async function findUserByUsername(username: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, role, is_active, created_at, updated_at
     FROM app_users WHERE username = $1 LIMIT 1`,
    [username]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function findUserById(id: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, role, is_active, created_at, updated_at
     FROM app_users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function countActiveAdmins() {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM app_users WHERE role = 'admin' AND is_active = true`
  );
  return Number(rows[0]?.count || 0);
}

export async function listUsers() {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, role, is_active, created_at, updated_at
     FROM app_users
     ORDER BY created_at ASC`
  );
  return rows.map(toUser);
}

export async function createUser(params: {
  username: string;
  password_hash: string;
  role: string;
  is_active: boolean;
}) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(
    `INSERT INTO app_users (id, username, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, password_hash, role, is_active, created_at, updated_at`,
    [crypto.randomUUID(), params.username, params.password_hash, params.role, params.is_active]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function updateUserById(id: string, updates: Partial<AuthUserRow>) {
  resolveMode();
  const allowedKeys = ["username", "password_hash", "role", "is_active", "updated_at"] as const;
  const entries = Object.entries(updates).filter(([k]) => allowedKeys.includes(k as any));
  if (!entries.length) return findUserById(id);

  await ensurePgReady();
  const pool = getPgPool();
  const setParts: string[] = [];
  const values: any[] = [];
  entries.forEach(([k, v], idx) => {
    setParts.push(`${k} = $${idx + 1}`);
    values.push(v);
  });
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE app_users SET ${setParts.join(", ")} WHERE id = $${values.length}
     RETURNING id, username, password_hash, role, is_active, created_at, updated_at`,
    values
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteUserById(id: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  await pool.query(`DELETE FROM app_users WHERE id = $1`, [id]);
}

export async function roleExists(roleName: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT name FROM app_roles WHERE name = $1 LIMIT 1`, [roleName]);
  return Boolean(rows[0]?.name);
}

export async function upsertRoles(payload: Array<{ name: string; is_system: boolean }>) {
  resolveMode();
  if (!payload.length) return;

  await ensurePgReady();
  const pool = getPgPool();
  for (const row of payload) {
    await pool.query(
      `INSERT INTO app_roles (name, is_system)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET is_system = EXCLUDED.is_system, updated_at = now()`,
      [row.name, row.is_system]
    );
  }
}

export async function upsertRolePermissions(payload: RolePermissionRow[]) {
  resolveMode();
  if (!payload.length) return;

  await ensurePgReady();
  const pool = getPgPool();
  for (const row of payload) {
    await pool.query(
      `INSERT INTO app_role_permissions (role_name, permission_key, allowed)
       VALUES ($1, $2, $3)
       ON CONFLICT (role_name, permission_key) DO UPDATE SET allowed = EXCLUDED.allowed`,
      [row.role_name, row.permission_key, row.allowed]
    );
  }
}

export async function listRoles() {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT name, is_system, created_at, updated_at FROM app_roles ORDER BY name ASC`
  );
  return rows.map(toRole);
}

export async function listRolePermissions(roleName?: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = roleName
    ? await pool.query(
        `SELECT role_name, permission_key, allowed FROM app_role_permissions WHERE role_name = $1`,
        [roleName]
      )
    : await pool.query(`SELECT role_name, permission_key, allowed FROM app_role_permissions`);
  return rows.map((row: any) => ({
    role_name: String(row?.role_name || ""),
    permission_key: String(row?.permission_key || ""),
    allowed: Boolean(row?.allowed),
  }));
}

export async function insertRole(name: string, isSystem: boolean) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  await pool.query(`INSERT INTO app_roles (name, is_system) VALUES ($1, $2)`, [name, isSystem]);
}

export async function touchRoleUpdatedAt(name: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  await pool.query(`UPDATE app_roles SET updated_at = now() WHERE name = $1`, [name]);
}

export async function deleteRole(name: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  await pool.query(`DELETE FROM app_roles WHERE name = $1`, [name]);
}

export async function countUsersWithRole(role: string) {
  resolveMode();
  await ensurePgReady();
  const pool = getPgPool();
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM app_users WHERE role = $1`, [role]);
  return Number(rows[0]?.count || 0);
}
