import { NextResponse } from "next/server";
import {
  PRINTER_DPI,
  generateLabels,
  normalizeLabelInput,
  validateRfidSettings,
} from "@/lib/rfid";
import { getRfidSettings } from "@/lib/rfidStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeLabelInput({ ...body, qty: 1, printNow: false });
    if (!input.lightspeedSystemId.trim()) {
      throw new Error("Lightspeed System ID is required.");
    }

    const settings = getRfidSettings();
    validateRfidSettings(settings);

    const generated = generateLabels({
      input,
      settings,
      serialNumbers: [1],
    });
    const zpl = generated.labels[0]?.zpl || "";

    const previewWidthInches = (settings.labelWidthDots / PRINTER_DPI).toFixed(2);
    const previewHeightInches = (settings.labelHeightDots / PRINTER_DPI).toFixed(2);
    const previewUrl = `https://api.labelary.com/v1/printers/12dpmm/labels/${previewWidthInches}x${previewHeightInches}/0/`;

    const response = await fetch(previewUrl, {
      method: "POST",
      headers: {
        Accept: "image/png",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: zpl,
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        {
          error: "Preview provider rejected ZPL.",
          details: details.slice(0, 800),
        },
        { status: 502 }
      );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    return NextResponse.json({
      imageDataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Unable to render print preview.") },
      { status: 400 }
    );
  }
}

