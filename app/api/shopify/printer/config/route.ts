import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import {
  getPrintNodePrinterStatus,
  loadShopifyPrinterConfig,
  resolvePrinterShop,
  saveShopifyPrinterConfig,
} from "@/lib/shopifyPrinter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const shop = resolvePrinterShop(searchParams.get("shop"));
    const refresh = normalizeText(searchParams.get("refresh")) === "1";
    const config = await loadShopifyPrinterConfig(shop);
    let printerStatus: { online: boolean; state: string; name: string } | null = null;
    let statusError = "";
    if (refresh && config.hasApiKey && config.printerId) {
      try {
        const status = await getPrintNodePrinterStatus(config.apiKey, config.printerId);
        printerStatus = { online: status.online, state: status.state, name: status.name };
      } catch (e: unknown) {
        statusError = normalizeText((e as { message?: string } | null)?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      shop,
      config: {
        enabled: config.enabled,
        triggerTopic: config.triggerTopic,
        printerId: config.printerId,
        copies: config.copies,
        labelSize: config.labelSize,
        hasApiKey: config.hasApiKey,
        apiKeyMasked: config.apiKeyMasked,
        envManaged: true,
      },
      backend: config.backend,
      warning: config.warning || "",
      printerStatus,
      statusError,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: normalizeText((e as { message?: string } | null)?.message) || "Failed to load printer config." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const shop = resolvePrinterShop(body?.shop);
    const copiesRaw = normalizeText(body?.copies);
    const copies = copiesRaw ? Number.parseInt(copiesRaw, 10) : 1;

    const result = await saveShopifyPrinterConfig(shop, {
      enabled: body?.enabled === true,
      triggerTopic: body?.triggerTopic,
      copies: Number.isFinite(copies) ? copies : 1,
    });

    return NextResponse.json({
      ok: true,
      shop,
      backend: result.backend,
      warning: result.warning || "",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: normalizeText((e as { message?: string } | null)?.message) || "Failed to save printer config." },
      { status: 500 }
    );
  }
}
