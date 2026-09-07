import Link from "next/link";
import { readInstagramConnection } from "@/lib/instagramConnectionRepository";

export const dynamic = "force-dynamic";

/**
 * Sources — connect the Instagram account the storefront feed reads from.
 *
 * A server component on purpose: it reads the stored connection directly
 * rather than through an API, so the page cannot show a stale or
 * differently-authenticated view of what is actually connected.
 */

/*
  The app paints a light photo behind every page (body background-image in
  globals.css) while the shared tokens assume a dark backdrop — a translucent
  panel over that photo leaves near-white text on a pale image, which is
  unreadable. So this page carries its own solid surface rather than relying on
  --panel-bg, and every colour here is chosen against that surface.
*/
const surface = "rgba(14, 12, 22, 0.94)";
const fg = "#f8fafc";
const muted = "rgba(226, 232, 240, 0.82)";

const card: React.CSSProperties = {
  background: surface,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
};

const panel: React.CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.14)",
  borderRadius: 10,
  padding: 16,
  marginTop: 16,
  background: "rgba(255, 255, 255, 0.04)",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 14 }}>
      <span style={{ color: muted, minWidth: 150 }}>{label}</span>
      <span style={{ color: fg }}>{value}</span>
    </div>
  );
}

export default async function InstagramWidgetSourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const connectedFlag = one(params.meta_instagram_connected);
  const errorFlag = one(params.meta_instagram_error);

  const connection = await readInstagramConnection();
  const hasAppId = Boolean(String(process.env.META_APP_ID || "").trim());
  const hasAppSecret = Boolean(String(process.env.META_APP_SECRET || "").trim());
  const envPinned =
    Boolean(String(process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID || "").trim()) &&
    Boolean(String(process.env.META_PAGE_ACCESS_TOKEN || "").trim());
  const canConnect = hasAppId && hasAppSecret;

  return (
    <main style={{ padding: "22px 16px", maxWidth: 760 }}>
      <div style={{ ...card, color: fg }}>
      <p style={{ marginBottom: 12 }}>
        <Link href="/studio/instagram-widget/layout" style={{ color: "rgba(165, 180, 252, 0.95)" }}>
          ← Layout (hero &amp; preview)
        </Link>
      </p>
      <h1 style={{ fontSize: "1.35rem", marginBottom: 8, color: fg }}>Sources</h1>
      <p style={{ color: muted, lineHeight: 1.5 }}>
        The account the storefront Instagram feed reads from. Carbon calls Meta at most once every
        15 minutes and serves every shopper from cache, so traffic can never exhaust a quota.
      </p>

      {connectedFlag ? (
        <div style={{ ...panel, borderColor: "rgba(34, 197, 94, 0.5)" }}>
          Connected{connectedFlag !== "1" ? ` as @${connectedFlag}` : ""}.
        </div>
      ) : null}

      {errorFlag ? (
        <div style={{ ...panel, borderColor: "rgba(248, 113, 113, 0.55)" }}>
          <strong style={{ display: "block", marginBottom: 6 }}>Could not connect</strong>
          <span style={{ color: muted }}>{errorFlag}</span>
        </div>
      ) : null}

      <section style={panel}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 10px", color: fg }}>Connection</h2>

        {envPinned ? (
          <p style={{ color: muted, lineHeight: 1.5, margin: 0 }}>
            Credentials are pinned by environment variables (
            <code>META_INSTAGRAM_BUSINESS_ACCOUNT_ID</code> and <code>META_PAGE_ACCESS_TOKEN</code>
            ), which take precedence over anything connected here. Remove them to manage the
            connection from this page instead.
          </p>
        ) : connection ? (
          <>
            <Row
              label="Instagram"
              value={connection.username ? `@${connection.username}` : connection.igUserId}
            />
            <Row label="Facebook Page" value={connection.pageName || connection.pageId} />
            <Row
              label="Token expires"
              value={
                connection.expiresAt ? new Date(connection.expiresAt).toLocaleString() : "Never"
              }
            />
            <Row label="Connected" value={new Date(connection.connectedAt).toLocaleString()} />
          </>
        ) : (
          <p style={{ color: muted, lineHeight: 1.5, margin: 0 }}>
            No account connected yet — the storefront feed stays hidden until one is.
          </p>
        )}
      </section>

      {!envPinned ? (
        <section style={panel}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 10px", color: fg }}>
            {connection ? "Reconnect" : "Connect"}
          </h2>

          {canConnect ? (
            <>
              <p style={{ color: muted, lineHeight: 1.5, marginTop: 0 }}>
                Sign in with the Facebook account that administers the Page linked to @shopcarbon.
                Carbon exchanges the login for a long-lived Page token, so it does not expire and
                the feed cannot go dark on its own.
              </p>
              <a
                href="/api/instagram/meta/connect"
                style={{
                  display: "inline-block",
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "#1877f2",
                  color: "#fff",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {connection ? "Reconnect Instagram" : "Connect Instagram"}
              </a>
            </>
          ) : (
            <p style={{ color: muted, lineHeight: 1.5, margin: 0 }}>
              Set <code>META_APP_ID</code>
              {!hasAppId ? " (missing)" : ""} and <code>META_APP_SECRET</code>
              {!hasAppSecret ? " (missing)" : ""} on the server, then reload this page to connect.
              Both come from Meta → App → Settings → Basic.
            </p>
          )}
        </section>
      ) : null}
      </div>
    </main>
  );
}
