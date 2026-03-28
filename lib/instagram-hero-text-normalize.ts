/**
 * Normalize URLs for storage/display: lowercase scheme and host; lowercase path only on Instagram
 * (paths are case-insensitive there). Other hosts keep path casing (e.g. Shopify CDN filenames).
 */
export function normalizeWebUrlForStorage(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t);
    const u = new URL(hasScheme ? t : `https://${t}`);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    const host = u.hostname;
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      u.pathname = u.pathname
        .split("/")
        .map((seg) => seg.toLowerCase())
        .join("/");
    }
    return u.toString();
  } catch {
    return t;
  }
}

/** Lowercase the handle part of @labels (Instagram handles are case-insensitive). */
export function normalizeInstagramAtLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (t.startsWith("@")) {
    return `@${t.slice(1).replace(/\s+/g, "").toLowerCase()}`;
  }
  return t;
}
