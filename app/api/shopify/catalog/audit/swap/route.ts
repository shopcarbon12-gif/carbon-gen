import { NextRequest, NextResponse } from "next/server";
import { getShopifyAdminToken, normalizeShopDomain, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

async function getToken(shop: string): Promise<string | null> {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

type SwapPair = {
  toArchive: string;
  toActivate: string;
  title: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { shop?: string; pairs?: SwapPair[] };
    const rawShop = String(body.shop || "").trim();
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) return NextResponse.json({ ok: false, error: "Missing shop" }, { status: 400 });
    const token = await getToken(shop);
    if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 401 });

    const pairs = body.pairs || [];
    if (pairs.length === 0) return NextResponse.json({ ok: false, error: "No pairs provided" }, { status: 400 });

    const results: Array<{ title: string; archivedOk: boolean; activatedOk: boolean; errors: string[] }> = [];

    for (const pair of pairs) {
      const errors: string[] = [];

      const archiveRes = await runShopifyGraphql<{
        productUpdate?: { product?: { id: string }; userErrors?: Array<{ message: string }> };
      }>({
        shop,
        token,
        query: `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id } userErrors { message } } }`,
        variables: { product: { id: pair.toArchive, status: "ARCHIVED" } },
        apiVersion: API_VERSION,
      });
      const archiveErrors = archiveRes.data?.productUpdate?.userErrors || [];
      const archivedOk = archiveRes.ok && archiveErrors.length === 0;
      if (!archivedOk) errors.push(`archive: ${archiveErrors.map((e: { message: string }) => e.message).join("; ") || "API error"}`);

      const activateRes = await runShopifyGraphql<{
        productUpdate?: { product?: { id: string }; userErrors?: Array<{ message: string }> };
      }>({
        shop,
        token,
        query: `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id } userErrors { message } } }`,
        variables: { product: { id: pair.toActivate, status: "ACTIVE" } },
        apiVersion: API_VERSION,
      });
      const activateErrors = activateRes.data?.productUpdate?.userErrors || [];
      const activatedOk = activateRes.ok && activateErrors.length === 0;
      if (!activatedOk) errors.push(`activate: ${activateErrors.map((e: { message: string }) => e.message).join("; ") || "API error"}`);

      results.push({ title: pair.title, archivedOk, activatedOk, errors });
    }

    const successCount = results.filter((r) => r.archivedOk && r.activatedOk).length;
    const failCount = results.filter((r) => !r.archivedOk || !r.activatedOk).length;

    return NextResponse.json({
      ok: true,
      total: pairs.length,
      swapped: successCount,
      failed: failCount,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
