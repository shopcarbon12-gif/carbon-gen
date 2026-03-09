import { NextResponse } from "next/server";

import { createImageHandoffSession } from "@/lib/barcode-handoff-store";

export const dynamic = "force-dynamic";

function buildRequestOrigin(request: Request) {
  const directOrigin = String(request.headers.get("origin") || "").trim();
  if (directOrigin) return directOrigin;

  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").trim();
  const forwardedHost = String(request.headers.get("x-forwarded-host") || "").trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const session = createImageHandoffSession();
  const origin = buildRequestOrigin(request);
  const scanUrl = `${origin}/image-upload/${session.id}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(scanUrl)}`;

  return NextResponse.json({
    sessionId: session.id,
    expiresAt: new Date(session.expiresAt).toISOString(),
    scanUrl,
    qrCodeUrl,
  });
}
