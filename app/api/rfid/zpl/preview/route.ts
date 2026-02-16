import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_DPMM = new Set(["6dpmm", "8dpmm", "12dpmm", "24dpmm"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const zpl = String(body?.zpl || "");
    const dpmm = String(body?.dpmm || "12dpmm");
    const width = Number(body?.width || 2.63);
    const height = Number(body?.height || 1.92);
    const index = Number(body?.index || 0);

    if (!zpl.trim()) {
      return NextResponse.json({ error: "ZPL is required." }, { status: 400 });
    }
    if (!ALLOWED_DPMM.has(dpmm)) {
      return NextResponse.json({ error: "Invalid dpmm value." }, { status: 400 });
    }
    if (!Number.isFinite(width) || width <= 0 || width > 10) {
      return NextResponse.json({ error: "Width must be between 0 and 10 inches." }, { status: 400 });
    }
    if (!Number.isFinite(height) || height <= 0 || height > 10) {
      return NextResponse.json({ error: "Height must be between 0 and 10 inches." }, { status: 400 });
    }
    if (!Number.isInteger(index) || index < 0 || index > 20) {
      return NextResponse.json({ error: "Index must be an integer between 0 and 20." }, { status: 400 });
    }

    const previewUrl = `https://api.labelary.com/v1/printers/${dpmm}/labels/${width}x${height}/${index}/`;
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
      { error: String(e?.message || "Unable to render ZPL preview.") },
      { status: 400 }
    );
  }
}

