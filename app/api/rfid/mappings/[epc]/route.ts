import { NextResponse } from "next/server";
import { findMappingByEpc } from "@/lib/rfidStore";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ epc: string }> }
) {
  const { epc } = await params;
  const mapping = findMappingByEpc(epc);
  if (!mapping) {
    return NextResponse.json(
      {
        error: "EPC not found.",
        epc: String(epc || ""),
      },
      { status: 404 }
    );
  }
  return NextResponse.json(mapping);
}

