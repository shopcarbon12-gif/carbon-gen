"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SessionUser = {
  id: string | null;
  username: string | null;
  role: string;
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = sessionUser?.role === "admin";

  const roleNames = useMemo(() => roles.map((r) => r.name), [roles]);

  const refreshSession = useCallback(async () => {
    const resp = await fetch("/api/admin/me", { cache: "no-store" });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.user) {
      setSessionUser(null);
      return;
    }
    setSessionUser({
      id: json.user.id || null,
      username: json.user.username || null,
      role: String(json.user.role || "user"),
    });
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
        await refreshSession();
        if (!cancelled) {
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
        <Link href="/ops/seo">Content & SEO</Link>
      </section>

      {loading ? (
        <section className="card">
          <p className="muted">Loading role manager...</p>
        </section>
      ) : !isAdmin ? (
        <section className="card">
          <p className="error">Admin access required.</p>
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
          </section>

          <section className="card">
            <div className="card-title">Role Permission Matrix</div>
            <div className="matrix-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Permission</th>
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
                            checked={Boolean(role.permissions?.[perm.key])}
                            onChange={(e) =>
                              void updateRolePermission(role.name, perm.key, e.target.checked)
                            }
                            disabled={busy}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          border-radius: 999px;
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
