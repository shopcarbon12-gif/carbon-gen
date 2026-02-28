import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken, normalizeShopDomain, runShopifyGraphql } from "@/lib/shopify";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createLightspeedSale, loadPosConfig, type ShopifyOrder } from "@/lib/lightspeedSaleCreate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

async function getTokenForShop(shop: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();
    const dbToken = !error ? normalizeText((data as { access_token?: string } | null)?.access_token) : "";
    if (dbToken) return dbToken;
  } catch { /* fallback */ }
  return getShopifyAdminToken(shop) || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const secret = normalizeText(body?.secret || req.nextUrl.searchParams.get("secret"));
  const cronSecret = normalizeText(process.env.CRON_SECRET);

  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shop =
    normalizeShopDomain(normalizeText(body?.shop)) ||
    normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN)) ||
    "";
  if (!shop) return NextResponse.json({ error: "No shop configured" }, { status: 400 });

  const token = await getTokenForShop(shop);
  if (!token) return NextResponse.json({ error: "No Shopify token" }, { status: 400 });

  const apiVersion = normalizeText(process.env.SHOPIFY_API_VERSION) || "2025-01";

  const ordersResult = await runShopifyGraphql<{
    orders: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          createdAt: string;
          displayFinancialStatus: string;
          totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
          subtotalPriceSet: { shopMoney: { amount: string } };
          totalTaxSet: { shopMoney: { amount: string } };
          totalDiscountsSet: { shopMoney: { amount: string } };
          shippingLines: {
            nodes: Array<{ title: string; originalPriceSet: { shopMoney: { amount: string } } }>;
          };
          shippingAddress: {
            firstName: string | null;
            lastName: string | null;
            address1: string | null;
            address2: string | null;
            city: string | null;
            province: string | null;
            zip: string | null;
            country: string | null;
            phone: string | null;
          } | null;
          billingAddress: {
            firstName: string | null;
            lastName: string | null;
            address1: string | null;
            address2: string | null;
            city: string | null;
            province: string | null;
            zip: string | null;
            country: string | null;
            phone: string | null;
          } | null;
          email: string | null;
          phone: string | null;
          lineItems: {
            nodes: Array<{
              title: string;
              name: string;
              sku: string;
              quantity: number;
              variant: { id: string; price: string } | null;
            }>;
          };
        };
      }>;
    };
  }>({
    shop,
    token,
    apiVersion,
    query: `{
      orders(first: 1, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            email
            phone
            displayFinancialStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount } }
            totalTaxSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            shippingLines(first: 5) {
              nodes { title originalPriceSet { shopMoney { amount } } }
            }
            shippingAddress {
              firstName lastName address1 address2 city province zip country phone
            }
            billingAddress {
              firstName lastName address1 address2 city province zip country phone
            }
            lineItems(first: 50) {
              nodes {
                title
                name
                sku
                quantity
                variant { id price }
              }
            }
          }
        }
      }
    }`,
  });

  if (!ordersResult.ok || !ordersResult.data?.orders?.edges?.length) {
    return NextResponse.json({
      ok: false,
      error: "Could not fetch latest order",
      details: ordersResult.errors,
    }, { status: 500 });
  }

  const orderNode = ordersResult.data.orders.edges[0].node;
  const numericOrderId = Number(orderNode.id.replace("gid://shopify/Order/", ""));

  const shopifyOrder: ShopifyOrder = {
    id: numericOrderId,
    name: orderNode.name,
    order_number: numericOrderId,
    financial_status: orderNode.displayFinancialStatus,
    total_price: orderNode.totalPriceSet.shopMoney.amount,
    subtotal_price: orderNode.subtotalPriceSet.shopMoney.amount,
    total_tax: orderNode.totalTaxSet.shopMoney.amount,
    total_discounts: orderNode.totalDiscountsSet.shopMoney.amount,
    currency: orderNode.totalPriceSet.shopMoney.currencyCode,
    created_at: orderNode.createdAt,
    line_items: orderNode.lineItems.nodes.map((item) => ({
      variant_id: item.variant ? Number(item.variant.id.replace("gid://shopify/ProductVariant/", "")) : null,
      sku: item.sku || "",
      quantity: item.quantity,
      price: item.variant?.price || "0",
      title: item.title,
      name: item.name || item.title,
    })),
    shipping_lines: (orderNode.shippingLines?.nodes || []).map((sl) => ({
      title: sl.title,
      price: sl.originalPriceSet?.shopMoney?.amount || "0",
    })),
    customer: orderNode.email || orderNode.phone ? {
      id: 0,
      first_name: orderNode.shippingAddress?.firstName || orderNode.billingAddress?.firstName || undefined,
      last_name: orderNode.shippingAddress?.lastName || orderNode.billingAddress?.lastName || undefined,
      email: orderNode.email || undefined,
      phone: orderNode.phone || orderNode.shippingAddress?.phone || undefined,
    } : null,
    shipping_address: orderNode.shippingAddress ? {
      first_name: orderNode.shippingAddress.firstName || undefined,
      last_name: orderNode.shippingAddress.lastName || undefined,
      address1: orderNode.shippingAddress.address1 || undefined,
      address2: orderNode.shippingAddress.address2 || undefined,
      city: orderNode.shippingAddress.city || undefined,
      province: orderNode.shippingAddress.province || undefined,
      zip: orderNode.shippingAddress.zip || undefined,
      country: orderNode.shippingAddress.country || undefined,
      phone: orderNode.shippingAddress.phone || undefined,
    } : null,
    billing_address: orderNode.billingAddress ? {
      first_name: orderNode.billingAddress.firstName || undefined,
      last_name: orderNode.billingAddress.lastName || undefined,
      address1: orderNode.billingAddress.address1 || undefined,
      address2: orderNode.billingAddress.address2 || undefined,
      city: orderNode.billingAddress.city || undefined,
      province: orderNode.billingAddress.province || undefined,
      zip: orderNode.billingAddress.zip || undefined,
      country: orderNode.billingAddress.country || undefined,
      phone: orderNode.billingAddress.phone || undefined,
    } : null,
  };

  const posConfig = await loadPosConfig();
  const result = await createLightspeedSale(shopifyOrder, posConfig, shop);

  return NextResponse.json({
    ok: result.ok,
    orderFetched: {
      id: shopifyOrder.id,
      name: shopifyOrder.name,
      total: shopifyOrder.total_price,
      lineItems: shopifyOrder.line_items.length,
      items: shopifyOrder.line_items.map((li) => ({
        title: li.name,
        sku: li.sku,
        qty: li.quantity,
        price: li.price,
        variantId: li.variant_id,
      })),
    },
    saleResult: result,
  });
}
