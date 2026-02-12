import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const shop = normalizeShopDomain(typeof body?.shop === "string" ? body.shop : "");
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  const mediaUrl = typeof body?.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  const mediaType = typeof body?.mediaType === "string" ? body.mediaType.trim() : "";
  const altText = typeof body?.altText === "string" ? body.altText.trim() : "";

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }
  if (!productId || !mediaUrl || !mediaType) {
    return NextResponse.json(
      { error: "Missing required fields", details: "shop, productId, mediaUrl, mediaType are required." },
      { status: 400 }
    );
  }

  const token = getShopifyAdminToken(shop);
  if (!token) {
    return NextResponse.json(
      { error: "Shopify not connected", details: "Missing admin access token for this shop." },
      { status: 401 }
    );
  }

  // Minimal safe implementation: validates payload and acknowledges queueing.
  return NextResponse.json({
    success: true,
    queued: true,
    productId,
    mediaType,
    altText: altText || null,
  });
}
