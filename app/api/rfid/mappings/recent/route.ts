import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMappingLogsPage } from "@/lib/rfidStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get("limit") || "20");
  const rawPage = Number(searchParams.get("page") || "1");
  const rawPageSize = Number(searchParams.get("pageSize") || rawLimit || "20");
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.trunc(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize) ? Math.max(1, Math.min(20, Math.trunc(rawPageSize))) : 20;
  const from = String(searchParams.get("from") || "").trim();
  const to = String(searchParams.get("to") || "").trim();
  const details = String(searchParams.get("details") || "").trim();
  const result = getMappingLogsPage({
    page,
    pageSize,
    from: from || undefined,
    to: to || undefined,
    details: details || undefined,
  });

  return NextResponse.json({
    ...result,
  });
}
