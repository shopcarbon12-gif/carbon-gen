"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isSuperAdminRole } from "@/lib/authRoleConstants";
import { WORKSPACE_MENU_ACCESS_GROUPS, menuAccessState } from "@/lib/workspaceMenuPermissionGroups";

type SessionUser = {
  id: string | null;
  username: string | null;
  role: string;
};

type Capabilities = {
  manageUsers: boolean;
  manageRoles: boolean;
};

type PermissionOption = {
  key: string;
  label: string;
};

type RoleRow = {
  name: string;
  isSystem: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  permissions: Record<string, boolean>;
};

export default function RolesPage() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [roleMatrixAllowed, setRoleMatrixAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roleNames = useMemo(() => roles.map((r) => r.name), [roles]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const resp = await fetch("/api/admin/me", { cache: "no-store" });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.user) {
      setSessionUser(null);
      setRoleMatrixAllowed(false);
      return false;
    }
    setSessionUser({
      id: json.user.id || null,
      username: json.user.username || null,
      role: String(json.user.role || "user"),
    });
    const cap = json.capabilities as Capabilities | undefined;
    const allowed = Boolean(cap?.manageRoles);
    setRoleMatrixAllowed(allowed);
    return allowed;
  }, []);

  const refreshRoles = useCallback(async () => {
    const resp = await fetch("/api/admin/roles", { cache: "no-store" });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.error || "Failed to load roles.");
    }
    setPermissions(Array.isArray(json?.permissions) ? json.permissions : []);
    setRoles(Array.isArray(json?.roles) ? json.roles : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const allowed = await refreshSession();
        if (!cancelled && allowed) {
          await refreshRoles();
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load role data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRoles, refreshSession]);

  async function createRole() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName,
          cloneFrom: cloneFrom || undefined,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to create role.");
      setStatus(`Role "${String(json?.role || newRoleName).trim()}" created.`);
      setNewRoleName("");
      setCloneFrom("");
      await refreshRoles();
    } catch (e: any) {
      setError(e?.message || "Failed to create role.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRolePermission(roleName: string, permissionKey: string, nextValue: boolean) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch(`/api/admin/roles/${encodeURIComponent(roleName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: { [permissionKey]: nextValue },
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to update role permission.");
      setRoles((prev) =>
        prev.map((r) =>
          r.name === roleName
            ? { ...r, permissions: { ...r.permissions, [permissionKey]: nextValue } }
            : r
        )
      );
    } catch (e: any) {
      setError(e?.message || "Failed to update role permission.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRolePermissionsBatch(roleName: string, next: Record<string, boolean>) {
    const keys = Object.keys(next);
    if (!keys.length) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch(`/api/admin/roles/${encodeURIComponent(roleName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: next }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to update role permissions.");
      setRoles((prev) =>
        prev.map((r) =>
          r.name === roleName ? { ...r, permissions: { ...r.permissions, ...next } } : r
        )
      );
    } catch (e: any) {
      setError(e?.message || "Failed to update role permissions.");
    } finally {
      setBusy(false);
    }
  }

  function setMenuPageAccess(roleName: string, keys: readonly string[], allowed: boolean) {
    const next = Object.fromEntries(keys.map((k) => [k, allowed]));
    return void updateRolePermissionsBatch(roleName, next);
  }

  async function deleteRole(roleName: string) {
    const ok = window.confirm(`Delete role "${roleName}"?`);
    if (!ok) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch(`/api/admin/roles/${encodeURIComponent(roleName)}`, {
        method: "DELETE",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to delete role.");
      setStatus(`Role "${roleName}" deleted.`);
      await refreshRoles();
    } catch (e: any) {
      setError(e?.message || "Failed to delete role.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="nav">
        <Link href="/settings">Back To Settings</Link>
        <Link href="/studio/images">Image Studio</Link>
        <Link href="/studio/seo">Content & SEO</Link>
      </section>

      {loading ? (
        <section className="card">
          <p className="muted">Loading role manager...</p>
        </section>
      ) : !sessionUser ? (
        <section className="card">
          <p className="error">Sign in required.</p>
          <p className="muted">
            <Link href="/login">Go to login</Link>
          </p>
        </section>
      ) : !roleMatrixAllowed ? (
        <section className="card">
          <p className="error">Only superadmin can manage roles and permissions.</p>
          <p className="muted">
            Role policies are locked so only <code>superadmin</code> can change permission rules for all roles,
            including <code>admin</code>.
          </p>
          <p className="muted">
            <Link href="/settings">Back to settings</Link>
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-title">Create Role</div>
            <div className="create-grid">
              <input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="role name (example: content_editor)"
              />
              <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
                <option value="">Clone permissions from (optional)</option>
                {roleNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={createRole} disabled={busy || !newRoleName.trim()}>
                Create Role
              </button>
            </div>
            <p className="muted small-hint">
              New roles start with clone defaults or all denied. Use the table below to allow or deny each workspace menu
              area; expand Advanced to tune individual capability keys.
            </p>
          </section>

          <section className="card">
            <div className="card-title">Access by workspace menu</div>
            <p className="muted">
              Each row matches a Carbon menu destination. Allow turns on every capability listed for that page; Deny
              turns them off. Overlapping pages may share keys (for example Shopify-related tools).
            </p>
            <div className="matrix-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Menu page</th>
                    {roles.map((role) => (
                      <th key={role.name}>
                        <div className="role-head">
                          <span>{role.name}</span>
                          {!role.isSystem ? (
                            <button
                              className="btn danger mini"
                              type="button"
                              onClick={() => void deleteRole(role.name)}
                              disabled={busy}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WORKSPACE_MENU_ACCESS_GROUPS.map((group) => (
                    <tr key={group.id}>
                      <td>
                        <div className="perm-label">
                          <strong>{group.menuLabel}</strong>
                          <span className="path-hint">{group.pathHint}</span>
                          {!group.permissionKeys.length && group.ungatedNote ? (
                            <span className="ungated">{group.ungatedNote}</span>
                          ) : null}
                          {group.permissionKeys.length ? (
                            <span className="key-list">
                              Keys: {group.permissionKeys.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {roles.map((role) => {
                        const lockedSuperAdmin = isSuperAdminRole(role.name);
                        const state = lockedSuperAdmin ? "allowed" : menuAccessState(role.permissions, group.permissionKeys);
                        return (
                          <td key={`${role.name}-${group.id}`}>
                            {state === "na" ? (
                              <span className="access-na">—</span>
                            ) : (
                              <div className="access-cell">
                                <span
                                  className={`access-pill access-${state}`}
                                  title={
                                    lockedSuperAdmin
                                      ? "superadmin is hard-locked to full access."
                                      : state === "mixed"
                                      ? "Some capabilities on, some off — use Allow all or Deny all"
                                      : undefined
                                  }
                                >
                                  {lockedSuperAdmin
                                    ? "Locked"
                                    : state === "allowed"
                                    ? "Allowed"
                                    : state === "denied"
                                      ? "Denied"
                                      : "Mixed"}
                                </span>
                                <div className="access-actions">
                                  <button
                                    type="button"
                                    className="btn mini ghost-light"
                                    disabled={busy || lockedSuperAdmin}
                                    onClick={() => setMenuPageAccess(role.name, group.permissionKeys, true)}
                                  >
                                    Allow
                                  </button>
                                  <button
                                    type="button"
                                    className="btn mini ghost-light"
                                    disabled={busy || lockedSuperAdmin}
                                    onClick={() => setMenuPageAccess(role.name, group.permissionKeys, false)}
                                  >
                                    Deny
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="advanced-details">
              <summary>Advanced: all capability keys</summary>
              <div className="matrix-wrap advanced-matrix">
                <table>
                  <thead>
                    <tr>
                      <th>Permission</th>
                      {roles.map((role) => (
                        <th key={`adv-${role.name}`}>
                          <div className="role-head">
                            <span>{role.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((perm) => (
                      <tr key={perm.key}>
                        <td>
                          <div className="perm-label">
                            <strong>{perm.label}</strong>
                            <span>{perm.key}</span>
                          </div>
                        </td>
                        {roles.map((role) => (
                          <td key={`${role.name}-${perm.key}`}>
                            <input
                              type="checkbox"
                              checked={isSuperAdminRole(role.name) ? true : Boolean(role.permissions?.[perm.key])}
                              onChange={(e) =>
                                void updateRolePermission(role.name, perm.key, e.target.checked)
                              }
                              disabled={busy || isSuperAdminRole(role.name)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}

      {(error || status) && (
        <div className="banner">
          {error ? <span className="error">Error: {error}</span> : null}
          {status ? <span>{status}</span> : null}
        </div>
      )}

      <style jsx>{`
        .page {
          max-width: 1180px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          color: #f8fafc;
          display: grid;
          gap: 14px;
        }
        .nav {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          padding: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
        }
        .nav :global(a) {
          text-decoration: none;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          padding: 7px 12px;
          font-size: 0.82rem;
          font-weight: 700;
        }
        .card {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.035);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: grid;
          gap: 10px;
        }
        .card-title {
          font-weight: 700;
        }
        .muted {
          color: rgba(226, 232, 240, 0.82);
        }
        .small-hint {
          font-size: 0.85rem;
          margin: 0;
        }
        .path-hint {
          color: rgba(148, 163, 184, 0.95);
          font-size: 0.78rem;
        }
        .key-list {
          color: rgba(148, 163, 184, 0.88);
          font-size: 0.72rem;
          line-height: 1.35;
        }
        .ungated {
          color: rgba(251, 191, 36, 0.92);
          font-size: 0.78rem;
          line-height: 1.35;
        }
        .access-cell {
          display: grid;
          gap: 6px;
          justify-items: center;
        }
        .access-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
        }
        .access-pill {
          font-size: 0.72rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .access-pill.access-allowed {
          background: rgba(34, 197, 94, 0.18);
          border-color: rgba(74, 222, 128, 0.45);
          color: #bbf7d0;
        }
        .access-pill.access-denied {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(248, 113, 113, 0.35);
          color: #fecaca;
        }
        .access-pill.access-mixed {
          background: rgba(234, 179, 8, 0.14);
          border-color: rgba(250, 204, 21, 0.4);
          color: #fef08a;
        }
        .access-na {
          color: rgba(148, 163, 184, 0.75);
          font-size: 0.85rem;
        }
        .btn.ghost-light {
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.22);
        }
        .advanced-details {
          margin-top: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.12);
        }
        .advanced-details summary {
          cursor: pointer;
          font-weight: 700;
          color: #e2e8f0;
        }
        .advanced-matrix {
          margin-top: 10px;
        }
        .error {
          color: #fca5a5;
          font-weight: 700;
        }
        .create-grid {
          display: grid;
          gap: 8px;
          grid-template-columns: 1.6fr 1.2fr auto;
        }
        .btn {
          border: 1px solid #f3f4f6;
          background: #f3f4f6;
          color: #050505;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn.danger {
          background: rgba(239, 68, 68, 0.14);
          color: #fecaca;
          border-color: rgba(248, 113, 113, 0.4);
        }
        .btn.mini {
          padding: 2px 8px;
          font-size: 0.75rem;
          min-height: 28px;
        }
        .btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .matrix-wrap {
          overflow: auto;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 820px;
        }
        th,
        td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          border-right: 1px solid rgba(255, 255, 255, 0.14);
          padding: 8px;
          vertical-align: middle;
          text-align: center;
          background: rgba(255, 255, 255, 0.03);
          color: #f8fafc;
        }
        th:first-child,
        td:first-child {
          text-align: left;
          min-width: 260px;
        }
        th {
          background: rgba(255, 255, 255, 0.08);
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .role-head {
          display: grid;
          gap: 6px;
          justify-items: center;
        }
        .perm-label {
          display: grid;
          gap: 2px;
        }
        .perm-label span {
          color: rgba(203, 213, 225, 0.78);
          font-size: 0.8rem;
        }
        .banner {
          margin-top: 4px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          display: grid;
          gap: 4px;
        }
        @media (max-width: 940px) {
          .create-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

