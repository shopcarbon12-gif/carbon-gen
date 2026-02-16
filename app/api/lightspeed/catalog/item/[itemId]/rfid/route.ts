import { NextResponse, type NextRequest } from "next/server";
import { getMappingsByCustomSku } from "@/lib/rfidStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RfidTagStatus = "live" | "killed" | "damaged";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown): RfidTagStatus {
  const raw = normalizeText(value).toLowerCase();
  if (raw === "killed") return "killed";
  if (raw === "damaged") return "damaged";
  return "live";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const customSku = normalizeText(req.nextUrl.searchParams.get("customSku"));

  if (!customSku) {
    return NextResponse.json({
      ok: true,
      itemId: normalizeText(itemId),
      customSku: "",
      tags: [],
      meta: {
        placeholder: true,
        message:
          "No custom SKU provided. Future scan-upload module should supply RFID status data here.",
      },
    });
  }

  const rows = getMappingsByCustomSku(customSku, 500);
  const deduped = new Map<string, any>();
  for (const row of rows) {
    const epc = normalizeText(row.epc);
    if (!epc || deduped.has(epc)) continue;
    deduped.set(epc, row);
  }

  const tags = [...deduped.values()].map((row) => ({
    epc: normalizeText(row.epc),
    status: normalizeStatus((row as any)?.status),
    lastSeenAt: normalizeText((row as any)?.lastSeenAt || row.printedAt) || null,
    lastSeenSource: normalizeText((row as any)?.lastSeenSource) || "label_printed",
  }));

  return NextResponse.json({
    ok: true,
    itemId: normalizeText(itemId),
    customSku,
    tags,
    meta: {
      placeholder: true,
      message:
        "Prepared endpoint: currently fed by local RFID label mappings. Scan uploads can override status and last-seen.",
    },
  });
}
