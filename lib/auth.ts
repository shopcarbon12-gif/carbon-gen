import type { NextRequest } from "next/server";

export function isRequestAuthed(req: NextRequest) {
  const bypass =
    process.env.NODE_ENV !== "production" &&
    (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true";
  if (bypass) return true;
  return req.cookies.get("carbon_gen_auth_v1")?.value === "true";
}

/** Allow cron jobs and background workers to call protected APIs */
export function isCronAuthed(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = (req.headers.get("authorization") || "").trim();
  if (auth === `Bearer ${secret}`) return true;
  try {
    const url = typeof req.url === "string" && req.url.startsWith("http")
      ? new URL(req.url)
      : new URL(req.url, "http://localhost");
    if (url.searchParams.get("secret") === secret) return true;
  } catch {
    /* req.url may be malformed */
  }
  return false;
}
