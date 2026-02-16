import { NextResponse } from "next/server";
import {
  coerceRfidSettings,
  epcBitTotal,
  type RfidSettings,
  validateRfidSettings,
} from "@/lib/rfid";
import { getRfidSettings, setRfidSettings } from "@/lib/rfidStore";

export const runtime = "nodejs";

function getLightspeedStatus() {
  return {
    clientIdSet: Boolean(String(process.env.LS_CLIENT_ID || "").trim()),
    clientSecretSet: Boolean(String(process.env.LS_CLIENT_SECRET || "").trim()),
    redirectUri: String(process.env.LS_REDIRECT_URI || "").trim(),
    domainPrefix: String(process.env.LS_DOMAIN_PREFIX || "").trim(),
    connected: Boolean(String(process.env.LS_REFRESH_TOKEN || "").trim()),
    accountId: String(process.env.LS_ACCOUNT_ID || "").trim(),
  };
}

export async function GET() {
  const settings = getRfidSettings();
  return NextResponse.json({
    settings,
    epcBitsTotal: epcBitTotal(settings),
    lightspeedStatus: getLightspeedStatus(),
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<RfidSettings>;
    const merged = coerceRfidSettings({ ...getRfidSettings(), ...body });
    validateRfidSettings(merged);
    const settings = setRfidSettings(merged);

    return NextResponse.json({
      ok: true,
      settings,
      epcBitsTotal: epcBitTotal(settings),
      lightspeedStatus: getLightspeedStatus(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Invalid settings payload.") },
      { status: 400 }
    );
  }
}

