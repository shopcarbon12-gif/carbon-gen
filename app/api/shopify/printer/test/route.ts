import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import {
  loadShopifyPrinterConfig,
  resolvePrinterShop,
  sendPrintNodeZplJob,
} from "@/lib/shopifyPrinter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function buildTestLabelZpl(shop: string) {
  const now = new Date().toLocaleString();
  return `^XA
^PW812
^LL1218
^CI28
^FO50,40^A0N,58,58^FDCARBON - TEST LABEL^FS
^FO50,150^A0N,42,42^FDShop: ${shop}^FS
^FO50,220^A0N,42,42^FDTime: ${now}^FS
^FO50,290^A0N,42,42^FDPrinter integration is working.^FS
^FO50,360^A0N,42,42^FDSize: 4x6 thermal^FS
^XZ`;
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const shop = resolvePrinterShop(body?.shop);
    const config = await loadShopifyPrinterConfig(shop);
    if (!config.hasApiKey || !config.printerId) {
      return NextResponse.json(
        { error: "Missing printer config. Set API key and printer ID first." },
        { status: 400 }
      );
    }

    await sendPrintNodeZplJob({
      apiKey: config.apiKey,
      printerId: config.printerId,
      zpl: buildTestLabelZpl(shop),
      title: "Carbon Shopify Printer Test",
      copies: Math.min(2, Math.max(1, config.copies || 1)),
    });

    return NextResponse.json({ ok: true, shop });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: normalizeText((e as { message?: string } | null)?.message) || "Test print failed." },
      { status: 500 }
    );
  }
}
