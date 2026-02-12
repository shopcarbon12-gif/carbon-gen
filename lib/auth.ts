import type { NextRequest } from "next/server";

export function isRequestAuthed(req: NextRequest) {
  return req.cookies.get("carbon_gen_auth_v1")?.value === "true";
}
