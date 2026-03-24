import type { NextRequest } from "next/server";

const PRODUCTION_DEFAULT_ORIGIN = "https://app.shopcarbon.com";

function trimOrigin(origin: string) {
  return origin.replace(/\/+$/, "");
}

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const name = h.includes(":") ? (h.split("%")[0] || h) : h;
  return (
    name === "localhost" ||
    name === "127.0.0.1" ||
    name === "::1" ||
    name === "0.0.0.0"
  );
}

function hostnameFromHostHeader(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return "";
  try {
    return new URL(`http://${trimmed}`).hostname;
  } catch {
    return trimmed;
  }
}

function safeOriginFromUrl(url: string): string {
  try {
    return trimOrigin(new URL(url).origin);
  } catch {
    return "";
  }
}

/** Canonical public app URL from env (no trailing slash). */
export function getConfiguredPublicAppOrigin(): string {
  const raw =
    (process.env.APP_PUBLIC_URL || "").trim() ||
    (process.env.NEXT_PUBLIC_APP_URL || "").trim() ||
    (process.env.NEXT_PUBLIC_BASE_URL || "").trim() ||
    (process.env.PUBLIC_APP_URL || "").trim() ||
    (process.env.SITE_URL || "").trim();
  return trimOrigin(raw);
}

/**
 * Browser-facing origin for redirects, emails, and absolute self-URLs.
 * Prefers non-loopback env, then reverse-proxy headers, then the request URL.
 * In production, avoids loopback from mis-set env or internal req.nextUrl.
 */
export function resolvePublicAppOrigin(req: NextRequest): string {
  const isProd = process.env.NODE_ENV === "production";

  const configured = getConfiguredPublicAppOrigin();
  if (configured) {
    try {
      const host = new URL(configured).hostname;
      if (!isProd || !isLoopbackHostname(host)) {
        return trimOrigin(configured);
      }
    } catch {
      /* ignore invalid configured URL */
    }
  }

  const forwardedHostRaw = (req.headers.get("x-forwarded-host") || "").split(",")[0]?.trim() || "";
  const forwardedProtoRaw = (req.headers.get("x-forwarded-proto") || "").split(",")[0]?.trim() || "";
  if (forwardedHostRaw) {
    const hn = hostnameFromHostHeader(forwardedHostRaw);
    if (!isProd || !isLoopbackHostname(hn)) {
      const proto =
        forwardedProtoRaw === "http" || forwardedProtoRaw === "https"
          ? forwardedProtoRaw
          : isProd
            ? "https"
            : "http";
      return trimOrigin(`${proto}://${forwardedHostRaw}`);
    }
  }

  for (const candidate of [safeOriginFromUrl(req.url), trimOrigin(req.nextUrl.origin)]) {
    if (!candidate) continue;
    try {
      const host = new URL(candidate).hostname;
      if (!isProd || !isLoopbackHostname(host)) {
        return trimOrigin(candidate);
      }
    } catch {
      continue;
    }
  }

  if (isProd) {
    return PRODUCTION_DEFAULT_ORIGIN;
  }

  return "http://localhost:3000";
}

/**
 * Base URL for server-side fetch() to this app's own API (same container).
 * Prefer INTERNAL_API_ORIGIN in production; avoids relying on hairpin NAT to the public hostname.
 */
export function resolveInternalApiSelfOrigin(): string {
  const internal = (process.env.INTERNAL_API_ORIGIN || "").trim().replace(/\/+$/, "");
  if (internal) return internal;
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}
