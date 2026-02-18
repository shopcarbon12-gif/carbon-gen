import type { NextRequest } from "next/server";

export function isRequestAuthed(req: NextRequest) {
  const bypass =
    process.env.NODE_ENV !== "production" &&
    (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true";
  if (bypass) return true;
  return req.cookies.get("carbon_gen_auth_v1")?.value === "true";
}
