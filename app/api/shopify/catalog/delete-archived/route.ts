import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const API_VERSION =
  (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

async function getToken(shop: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();
  const dbToken = String(data?.access_token || "").trim();
  if (dbToken) return dbToken;
  const envToken = getShopifyAdminToken(shop);
  return envToken || null;
}

async function gql(shop: string, token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  return res.json();
}

async function fetchArchivedIds(shop: string, token: string, cursor?: string): Promise<{ ids: string[]; nextCursor: string | null }> {
  const after = cursor ? `, after: "${cursor}"` : "";
  const json = await gql(shop, token, `{
    products(first: 250, query: "status:archived"${after}) {
      edges { node { id } }
      pageInfo { hasNextPage endCursor }
    }
  }`);
  const edges = json?.data?.products?.edges || [];
  const ids = edges.map((e: { node: { id: string } }) => e.node.id);
  const pi = json?.data?.products?.pageInfo;
  return { ids, nextCursor: pi?.hasNextPage ? pi.endCursor : null };
}

async function deleteBatch(shop: string, token: string, ids: string[]): Promise<{ deleted: number; errors: string[] }> {
  if (!ids.length) return { deleted: 0, errors: [] };

  const mutations = ids
    .map((id, i) => `d${i}: productDelete(input: { id: "${id}" }) { deletedProductId userErrors { field message } }`)
    .join("\n");
  const json = await gql(shop, token, `mutation { ${mutations} }`);

  let deleted = 0;
  const errors: string[] = [];
  const data = json?.data || {};
  for (let i = 0; i < ids.length; i++) {
    const result = data[`d${i}`];
    if (result?.deletedProductId) {
      deleted++;
    } else if (result?.userErrors?.length) {
      errors.push(`${ids[i]}: ${result.userErrors.map((e: { message: string }) => e.message).join(", ")}`);
    }
  }
  return { deleted, errors };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawShop = String(body.shop || "").trim();
    const shop = normalizeShopDomain(rawShop) || normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) return NextResponse.json({ ok: false, error: "Missing shop" }, { status: 400 });

    const token = await getToken(shop);
    if (!token) return NextResponse.json({ ok: false, error: "Shop not connected" }, { status: 401 });

    const startTime = Date.now();
    const TIME_LIMIT = 270_000; // 270s safety margin for 300s max
    const BATCH_SIZE = 10;
    const DELAY_MS = 500;

    let totalDeleted = 0;
    let totalErrors: string[] = [];
    let cursor: string | undefined;
    let pagesProcessed = 0;

    while (Date.now() - startTime < TIME_LIMIT) {
      const { ids, nextCursor } = await fetchArchivedIds(shop, token, cursor);
      if (!ids.length) break;

      pagesProcessed++;

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        if (Date.now() - startTime >= TIME_LIMIT) break;

        const batch = ids.slice(i, i + BATCH_SIZE);
        const { deleted, errors } = await deleteBatch(shop, token, batch);
        totalDeleted += deleted;
        if (errors.length) totalErrors.push(...errors);

        if (i + BATCH_SIZE < ids.length) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      }

      if (!nextCursor) break;
      cursor = nextCursor;

      await new Promise((r) => setTimeout(r, 300));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      ok: true,
      deleted: totalDeleted,
      errorCount: totalErrors.length,
      errors: totalErrors.slice(0, 20),
      pagesProcessed,
      elapsedSeconds: elapsed,
      timedOut: Date.now() - startTime >= TIME_LIMIT,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
