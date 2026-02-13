import type { NextRequest } from "next/server";

export function isRequestAuthed(req: NextRequest) {
  const bypass = (process.env.AUTH_BYPASS || "true").trim().toLowerCase() === "true";
  if (bypass) return true;
  return req.cookies.get("carbon_gen_auth_v1")?.value === "true";
}
