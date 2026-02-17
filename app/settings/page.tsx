"use client";

import Link from "next/link";
import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";

type ShopifyStatusResponse = {
  connected?: boolean;
  shop?: string | null;
  installedAt?: string | null;
  source?: string;
  reason?: string;
  error?: string;
};

type DropboxStatusResponse = {
  connected?: boolean;
  email?: string | null;
  accountId?: string | null;
  connectedAt?: string | null;
  updatedAt?: string | null;
  error?: string;
};

type LightspeedStatusResponse = {
  ok?: boolean;
  connected?: boolean;
  label?: string;
  clientIdSet?: boolean;
  clientSecretSet?: boolean;
  refreshTokenSet?: boolean;
  domainPrefix?: string;
  accountId?: string;
  redirectUri?: string;
  apiBase?: string;
  credentialsReady?: boolean;
  probe?: {
    attempted?: boolean;
    success?: boolean;
    endpoint?: string | null;
    message?: string;
  };
  checkedAt?: string;
  error?: string;
};

type SessionUser = {
  id: string | null;
  username: string | null;
  role: "admin" | "manager" | "user";
};

type AdminUser = {
  id: string;
  username: string;
  role: "admin" | "manager" | "user";
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type UserDraft = {
  username: string;
  role: "admin" | "manager" | "user";
  isActive: boolean;
  password: string;
};

function normalizeShop(value: string) {
  return value.trim().toLowerCase();
}

function isValidShop(value: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(value);
}

function roleLabel(role: SessionUser["role"]) {
  return role === "admin" ? "Admin" : role === "manager" ? "Manager" : "User";
}

export default function SettingsPage() {
  const [shop, setShop] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [installedAt, setInstalledAt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropboxConnected, setDropboxConnected] = useState<boolean | null>(null);
  const [dropboxEmail, setDropboxEmail] = useState<string | null>(null);
  const [dropboxConnectedAt, setDropboxConnectedAt] = useState<string | null>(null);
  const [dropboxLoading, setDropboxLoading] = useState(true);
  const [dropboxBusy, setDropboxBusy] = useState(false);
  const [lightspeedConnected, setLightspeedConnected] = useState<boolean | null>(null);
  const [lightspeedLoading, setLightspeedLoading] = useState(true);
  const [lightspeedBusy, setLightspeedBusy] = useState(false);
  const [lightspeedStatusData, setLightspeedStatusData] = useState<LightspeedStatusResponse | null>(null);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminStatus, setAdminStatus] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "manager" | "user">("user");

  const normalizedShop = useMemo(() => normalizeShop(shop), [shop]);
  const canConnect = useMemo(() => isValidShop(normalizedShop), [normalizedShop]);
  const isAdmin = sessionUser?.role === "admin";
  const connectHref = useMemo(() => {
    if (!canConnect) return "#";
    return `/api/shopify/auth?shop=${encodeURIComponent(normalizedShop)}`;
  }, [canConnect, normalizedShop]);
  const dropboxConnectHref = useMemo(
    () => `/api/dropbox/auth?returnTo=${encodeURIComponent("/settings")}`,
    []
  );

  const refreshStatus = useCallback(async (shopOverride?: string) => {
    const queryShop = normalizeShop(shopOverride ?? "");
    if (typeof shopOverride === "string" && shopOverride.trim() && !isValidShop(queryShop)) {
      setConnected(false);
      setInstalledAt(null);
      setSource(null);
      setReason("invalid_shop");
      setLoadingStatus(false);
      return;
    }
    const endpoint = queryShop
      ? `/api/shopify/status?shop=${encodeURIComponent(queryShop)}`
      : "/api/shopify/status";

    setLoadingStatus(true);
    try {
      const resp = await fetch(endpoint, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as ShopifyStatusResponse;
      const inferredShop = normalizeShop(String(json?.shop || ""));
      if (inferredShop) {
        setShop(inferredShop);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("shopify_shop", inferredShop);
        }
      }
      if (typeof json?.connected === "boolean") {
        setConnected(Boolean(json.connected));
        setInstalledAt(json?.connected ? json?.installedAt || null : null);
      } else {
        setConnected(false);
        setInstalledAt(null);
      }
      setSource(json?.source || null);
      setReason(json?.reason || null);
    } catch {
      setConnected(false);
      setInstalledAt(null);
      setSource(null);
      setReason(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const refreshDropboxStatus = useCallback(async () => {
    setDropboxLoading(true);
    try {
      const resp = await fetch("/api/dropbox/status", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as DropboxStatusResponse;
      if (typeof json?.connected === "boolean") {
        setDropboxConnected(Boolean(json.connected));
        setDropboxEmail(json?.connected ? json?.email || null : null);
        setDropboxConnectedAt(json?.connected ? json?.connectedAt || null : null);
      } else {
        setDropboxConnected(false);
        setDropboxEmail(null);
        setDropboxConnectedAt(null);
      }
    } catch {
      setDropboxConnected(false);
      setDropboxEmail(null);
      setDropboxConnectedAt(null);
    } finally {
      setDropboxLoading(false);
    }
  }, []);

  const refreshLightspeedStatus = useCallback(async (manual = false) => {
    if (manual) setLightspeedBusy(true);
    setLightspeedLoading(true);
    try {
      const resp = await fetch("/api/lightspeed/status", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as LightspeedStatusResponse;
      const connectedFlag = Boolean(json?.connected);
      setLightspeedConnected(connectedFlag);
      setLightspeedStatusData(json || null);
    } catch {
      setLightspeedConnected(false);
      setLightspeedStatusData(null);
    } finally {
      setLightspeedLoading(false);
      if (manual) setLightspeedBusy(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const resp = await fetch("/api/admin/me", { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.user) {
        setSessionUser(null);
      } else {
        setSessionUser({
          id: json.user.id || null,
          username: json.user.username || null,
          role: json.user.role || "user",
        });
      }
    } catch {
      setSessionUser(null);
    } finally {
      setAdminLoading(false);
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    if (!isAdmin) return;
    setAdminBusy(true);
    setAdminError(null);
    try {
      const resp = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to load users.");
      const list = Array.isArray(json?.users) ? (json.users as AdminUser[]) : [];
      setUsers(list);

      const nextDrafts: Record<string, UserDraft> = {};
      for (const row of list) {
        nextDrafts[row.id] = {
          username: row.username,
          role: row.role,
          isActive: row.isActive,
          password: "",
        };
      }
      setDrafts(nextDrafts);
    } catch (e: any) {
      setAdminError(e?.message || "Failed to load users.");
      setUsers([]);
    } finally {
      setAdminBusy(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qpShop = normalizeShop(params.get("shop") || "");
    const stored = normalizeShop(window.localStorage.getItem("shopify_shop") || "");
    const initialShop = qpShop || stored;

    if (initialShop) {
      setShop(initialShop);
      window.localStorage.setItem("shopify_shop", initialShop);
      void refreshStatus(initialShop);
    } else {
      void refreshStatus();
    }
    const dropboxConnectedFlag = params.get("dropbox_connected");
    const dropboxError = params.get("dropbox_error");
    if (dropboxConnectedFlag === "1") {
      setStatus("Dropbox connected.");
    } else if (dropboxError) {
      setError(`Dropbox: ${dropboxError}`);
    }
    void refreshDropboxStatus();
    void refreshLightspeedStatus();
    void refreshSession();
  }, [refreshDropboxStatus, refreshLightspeedStatus, refreshSession, refreshStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!normalizedShop) return;
    window.localStorage.setItem("shopify_shop", normalizedShop);
  }, [normalizedShop]);

  useEffect(() => {
    if (!normalizedShop) {
      setConnected(null);
      setInstalledAt(null);
      setSource(null);
      setReason(null);
      setLoadingStatus(false);
      return;
    }
    if (!canConnect) {
      setConnected(false);
      setInstalledAt(null);
      setSource(null);
      setReason("invalid_shop");
      setLoadingStatus(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshStatus(normalizedShop);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [normalizedShop, canConnect, refreshStatus]);

  useEffect(() => {
    if (!isAdmin) return;
    void refreshUsers();
  }, [isAdmin, refreshUsers]);

  async function handleDisconnect() {
    if (!canConnect) {
      setError("Enter a valid shop domain first (example: yourstore.myshopify.com).");
      setStatus(null);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Disconnecting Shopify token...");
    try {
      const resp = await fetch("/api/shopify/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: normalizedShop }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        error?: string;
        stillConnectedViaEnvToken?: boolean;
      };
      if (!resp.ok) throw new Error(json?.error || "Failed to disconnect Shopify token.");

      if (json?.stillConnectedViaEnvToken) {
        setStatus("Disconnected saved token, but SHOPIFY_ADMIN_ACCESS_TOKEN is still configured in env.");
      } else {
        setStatus("Shopify disconnected.");
      }
      await refreshStatus(normalizedShop);
    } catch (e: any) {
      setError(e?.message || "Disconnect failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDropboxDisconnect() {
    setDropboxBusy(true);
    setError(null);
    setStatus("Disconnecting Dropbox...");
    try {
      const resp = await fetch("/api/dropbox/disconnect", { method: "POST" });
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(json?.error || "Failed to disconnect Dropbox.");
      setStatus("Dropbox disconnected.");
      await refreshDropboxStatus();
    } catch (e: any) {
      setError(e?.message || "Dropbox disconnect failed.");
      setStatus(null);
    } finally {
      setDropboxBusy(false);
    }
  }

  async function handleCreateUser() {
    if (!isAdmin) return;
    setAdminBusy(true);
    setAdminStatus(null);
    setAdminError(null);
    try {
      const resp = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to create user.");
      setAdminStatus(`User "${newUsername.trim().toLowerCase()}" created.`);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      await refreshUsers();
    } catch (e: any) {
      setAdminError(e?.message || "Failed to create user.");
    } finally {
      setAdminBusy(false);
    }
  }

  function updateDraft(id: string, patch: Partial<UserDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { username: "", role: "user", isActive: true, password: "" }),
        ...patch,
      },
    }));
  }

  async function handleSaveUser(user: AdminUser) {
    if (!isAdmin) return;
    const draft = drafts[user.id];
    if (!draft) return;

    const payload: Record<string, unknown> = {};
    if (draft.username.trim().toLowerCase() !== user.username) payload.username = draft.username;
    if (draft.role !== user.role) payload.role = draft.role;
    if (draft.isActive !== user.isActive) payload.isActive = draft.isActive;
    if (draft.password.trim()) payload.password = draft.password;

    if (Object.keys(payload).length === 0) {
      setAdminStatus(`No changes for ${user.username}.`);
      setAdminError(null);
      return;
    }

    setAdminBusy(true);
    setAdminStatus(null);
    setAdminError(null);
    try {
      const resp = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to update user.");
      setAdminStatus(`Updated ${user.username}.`);
      await refreshUsers();
    } catch (e: any) {
      setAdminError(e?.message || "Failed to update user.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    if (!isAdmin) return;
    const ok = window.confirm(`Delete user "${user.username}"? This cannot be undone.`);
    if (!ok) return;

    setAdminBusy(true);
    setAdminStatus(null);
    setAdminError(null);
    try {
      const resp = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || "Failed to delete user.");
      setAdminStatus(`Deleted ${user.username}.`);
      await refreshUsers();
    } catch (e: any) {
      setAdminError(e?.message || "Failed to delete user.");
    } finally {
      setAdminBusy(false);
    }
  }

  function handleConnectClick(e: MouseEvent<HTMLAnchorElement>) {
    if (canConnect) return;
    e.preventDefault();
    setError("Enter a valid shop domain before connecting.");
    setStatus(null);
  }

  return (
    <main className="page">
      <section className="nav">
        <Link href="/studio/images">Image Studio</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/studio/seo">Content & SEO</Link>
        <Link href="/ops/inventory">Collection Mapper</Link>
      </section>

      <section className="card">
        <div className="card-title">Session</div>
        {adminLoading ? (
          <p className="muted">Loading current user...</p>
        ) : sessionUser ? (
          <p className="muted">
            Signed in as <strong>{sessionUser.username || "unknown"}</strong> ({roleLabel(sessionUser.role)})
          </p>
        ) : (
          <p className="muted">Unable to read session user.</p>
        )}
      </section>

      <section id="integration-shopify" className="card">
        <div className="card-title">Shopify Connection</div>
        <p className="muted">Add your store domain once, then connect/reconnect or disconnect from here.</p>

        <input
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          placeholder="yourstore.myshopify.com"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="status-row">
          <span className={`status-dot ${connected ? "on" : "off"}`} />
          <span>
            {loadingStatus ? "Checking connection..." : connected ? "Connected" : "Not connected"}
            {normalizedShop ? <em> - {normalizedShop}</em> : null}
            {connected && installedAt ? <em> - Installed {new Date(installedAt).toLocaleString()}</em> : null}
          </span>
        </div>

        {source === "env_token" ? (
          <p className="muted">
            Connection source: env token. To fully disconnect, remove `SHOPIFY_ADMIN_ACCESS_TOKEN`.
          </p>
        ) : null}
        {!loadingStatus && reason === "token_invalid" ? (
          <p className="muted">Stored Shopify token is invalid or expired. Reconnect to restore access.</p>
        ) : null}
        {!loadingStatus && reason === "invalid_shop" ? (
          <p className="muted">Enter a valid shop domain (example: yourstore.myshopify.com).</p>
        ) : null}

        <div className="actions">
          <a className="btn primary" href={connectHref} onClick={handleConnectClick}>
            Connect / Reconnect
          </a>
          <button className="btn danger" onClick={handleDisconnect} disabled={busy || !canConnect}>
            {busy ? "Disconnecting..." : "Disconnect"}
          </button>
          <button className="btn ghost" onClick={() => void refreshStatus(normalizedShop)} disabled={busy}>
            Refresh Status
          </button>
        </div>
      </section>

      <section id="integration-dropbox" className="card">
        <div className="card-title">Dropbox Connection</div>
        <p className="muted">
          Connect Dropbox once, then Studio can search by barcode and load image files directly.
        </p>
        <div className="status-row">
          <span className={`status-dot ${dropboxConnected ? "on" : "off"}`} />
          <span>
            {dropboxLoading
              ? "Checking connection..."
              : dropboxConnected
                ? "Connected"
                : "Not connected"}
            {dropboxEmail ? <em> - {dropboxEmail}</em> : null}
            {dropboxConnected && dropboxConnectedAt ? (
              <em> - Connected {new Date(dropboxConnectedAt).toLocaleString()}</em>
            ) : null}
          </span>
        </div>
        <div className="actions">
          <a className="btn primary" href={dropboxConnectHref}>
            Connect / Reconnect
          </a>
          <button
            className="btn danger"
            onClick={handleDropboxDisconnect}
            disabled={dropboxBusy || !dropboxConnected}
          >
            {dropboxBusy ? "Disconnecting..." : "Disconnect"}
          </button>
          <button
            className="btn ghost"
            onClick={() => void refreshDropboxStatus()}
            disabled={dropboxBusy}
          >
            Refresh Status
          </button>
        </div>
      </section>

      <section id="integration-lightspeed" className="card">
        <div className="card-title">Lightspeed API</div>
        <p className="muted">
          RFID Price Tag catalog search and EPC mapping use these Lightspeed credentials.
        </p>
        <div className="status-row">
          <span className={`status-dot ${lightspeedConnected ? "on" : "off"}`} />
          <span>
            {lightspeedLoading
              ? "Checking connection..."
              : lightspeedConnected
                ? "Connected"
                : "Not connected"}
            {lightspeedStatusData?.checkedAt ? (
              <em> - Checked {new Date(lightspeedStatusData.checkedAt).toLocaleString()}</em>
            ) : null}
          </span>
        </div>
        {lightspeedStatusData?.probe?.message ? (
          <p className={`muted ${lightspeedConnected ? "" : "warn"}`}>
            Probe: {lightspeedStatusData.probe.message}
          </p>
        ) : null}
        <div className="actions">
          <button className="btn ghost" onClick={() => void refreshLightspeedStatus(true)} disabled={lightspeedBusy}>
            {lightspeedBusy ? "Refreshing..." : "Refresh Status"}
          </button>
          <a className="btn ghost" href="/api/lightspeed/status" target="_blank" rel="noreferrer">
            Open Status Endpoint
          </a>
          <Link className="btn primary" href="/studio/rfid-price-tag">
            Open RFID Price Tag
          </Link>
        </div>
      </section>

      {isAdmin ? (
        <section className="card">
          <div className="card-title">User Management (Admin)</div>
          <p className="muted">Create users, assign roles, change passwords, disable or delete accounts.</p>
          <div className="actions">
            <Link className="btn ghost" href="/settings/roles">
              Create New Role
            </Link>
          </div>

          <div className="create-grid">
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="new username"
              autoComplete="off"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="temporary password"
              autoComplete="new-password"
            />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserDraft["role"])}>
              <option value="user">user</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
            <button className="btn" onClick={handleCreateUser} disabled={adminBusy}>
              Create User
            </button>
          </div>

          <div className="users-wrap">
            {users.length === 0 ? (
              <div className="muted">No users found.</div>
            ) : (
              users.map((user) => {
                const draft = drafts[user.id];
                return (
                  <div className="user-row" key={user.id}>
                    <input
                      value={draft?.username || ""}
                      onChange={(e) => updateDraft(user.id, { username: e.target.value })}
                      placeholder="username"
                      autoComplete="off"
                    />
                    <select
                      value={draft?.role || "user"}
                      onChange={(e) => updateDraft(user.id, { role: e.target.value as UserDraft["role"] })}
                    >
                      <option value="user">user</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </select>
                    <label className="active-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(draft?.isActive)}
                        onChange={(e) => updateDraft(user.id, { isActive: e.target.checked })}
                      />
                      active
                    </label>
                    <input
                      type="password"
                      value={draft?.password || ""}
                      onChange={(e) => updateDraft(user.id, { password: e.target.value })}
                      placeholder="new password (optional)"
                      autoComplete="new-password"
                    />
                    <button className="btn ghost" onClick={() => void handleSaveUser(user)} disabled={adminBusy}>
                      Save
                    </button>
                    <button className="btn danger" onClick={() => void handleDeleteUser(user)} disabled={adminBusy}>
                      Delete
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-title">User & Role Management</div>
          <p className="muted">Only admin users can manage accounts, roles, and passwords.</p>
        </section>
      )}

      <section id="integration-core-api" className="card">
        <div className="card-title">Core API</div>
        <p className="muted">Workspace health endpoint used by integration monitoring.</p>
        <div className="actions">
          <a className="btn ghost" href="/api/health" target="_blank" rel="noreferrer">
            Open Health Endpoint
          </a>
        </div>
      </section>

      {(error || status || adminError || adminStatus) && (
        <div className="banner">
          {error ? <span className="error">Error: {error}</span> : null}
          {status ? <span>{status}</span> : null}
          {adminError ? <span className="error">Admin Error: {adminError}</span> : null}
          {adminStatus ? <span>{adminStatus}</span> : null}
        </div>
      )}

      <style jsx>{`
        .page {
          max-width: 1080px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          color: #f8fafc;
          display: grid;
          gap: 14px;
          max-height: calc(100vh - 92px);
          overflow-y: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .page::-webkit-scrollbar {
          width: 0;
          height: 0;
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
        .card[id] {
          scroll-margin-top: 92px;
        }
        .card-title {
          font-weight: 700;
        }
        .muted {
          color: rgba(226, 232, 240, 0.82);
        }
        .muted.warn {
          color: #fca5a5;
        }
        .status-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.86);
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          background: #ef4444;
        }
        .status-dot.on {
          background: #10b981;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
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
          min-height: 46px;
        }
        .btn.ghost {
          background: transparent;
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.28);
        }
        .btn.danger {
          background: rgba(239, 68, 68, 0.14);
          color: #fecaca;
          border-color: rgba(248, 113, 113, 0.4);
        }
        .btn:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }
        .create-grid {
          display: grid;
          grid-template-columns: 1.4fr 1.4fr 0.8fr auto;
          gap: 8px;
        }
        .users-wrap {
          display: grid;
          gap: 8px;
        }
        .user-row {
          display: grid;
          grid-template-columns: 1.2fr 0.9fr 0.8fr 1.4fr auto auto;
          gap: 8px;
          align-items: center;
          padding: 8px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.02);
        }
        .active-toggle {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          color: rgba(226, 232, 240, 0.9);
          font-size: 0.9rem;
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
        .error {
          color: #fca5a5;
          font-weight: 700;
        }
        @media (max-width: 940px) {
          .create-grid {
            grid-template-columns: 1fr;
          }
          .user-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

