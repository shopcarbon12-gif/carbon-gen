/** Normalizes logo URL for the accessibility widget (saved config + proxy). */

const MAX_DATA_URL_CHARS = 500_000;

export function normalizeAccessibilityLogoUrl(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^data:image\//i.test(trimmed)) {
    if (trimmed.length > MAX_DATA_URL_CHARS) return fallback;
    return trimmed;
  }
  if (!/^https:\/\//i.test(trimmed)) return fallback;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return fallback;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost")) return fallback;
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return fallback;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return fallback;
    return trimmed;
  } catch {
    return fallback;
  }
}
