import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken } from "@/lib/shopify";

const API_VERSION = "2026-01";

async function getAccessToken(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();
  if (!error && data?.access_token) return data.access_token;

  const fallback = getShopifyAdminToken(shop);
  return fallback || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shop = String(body?.shop || "").trim().toLowerCase();
    const handle = String(body?.handle || "").trim();
    const productId = String(body?.productId || "").trim();

    if (!shop) {
      return NextResponse.json({ error: "Missing shop." }, { status: 400 });
    }
    if (!handle && !productId) {
      return NextResponse.json({ error: "Provide handle or productId." }, { status: 400 });
    }

    const token = await getAccessToken(shop);
    if (!token) {
      return NextResponse.json({ error: "Shop not connected." }, { status: 401 });
    }

    const query = handle
      ? `
        query PullProduct($handle: String!) {
          productByHandle(handle: $handle) {
            id
            title
            description
            seo { title description }
            media(first: 20) {
              nodes {
                ... on MediaImage {
                  id
                  image { url altText }
                }
              }
            }
            variants(first: 20) {
              nodes { id title sku }
            }
          }
        }
      `
      : `
        query PullProduct($id: ID!) {
          product(id: $id) {
            id
            title
            description
            seo { title description }
            media(first: 20) {
              nodes {
                ... on MediaImage {
                  id
                  image { url altText }
                }
              }
            }
            variants(first: 20) {
              nodes { id title sku }
            }
          }
        }
      `;

    const variables = handle ? { handle } : { id: productId };

    const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await resp.json();
    if (!resp.ok || json.errors) {
      return NextResponse.json(
        { error: "Shopify GraphQL error", details: json.errors || json },
        { status: 400 }
      );
    }

    const product = json.data.productByHandle || json.data.product;
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Pull failed" }, { status: 500 });
  }
}
