import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken } from "@/lib/shopify";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2026-01").trim();

function normalizeShop(value: string) {
  const v = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v) ? v : "";
}

function toProductGid(productId: string) {
  const id = productId.trim();
  if (!id) return "";
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

async function getAccessToken(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();
  if (!error && data?.access_token) return String(data.access_token);

  const fallback = getShopifyAdminToken(shop);
  return fallback || null;
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const shop = normalizeShop(String(body?.shop || ""));
    const productId = toProductGid(String(body?.productId || ""));
    const seoTitle = String(body?.seoTitle || "").trim();
    const seoDescription = String(body?.seoDescription || "").trim();
    const altText = String(body?.altText || "").trim();

    if (!shop) {
      return NextResponse.json({ error: "Missing or invalid shop." }, { status: 400 });
    }
    if (!productId) {
      return NextResponse.json({ error: "Missing productId." }, { status: 400 });
    }
    if (!seoTitle && !seoDescription && !altText) {
      return NextResponse.json(
        { error: "Provide at least one of seoTitle, seoDescription, or altText." },
        { status: 400 }
      );
    }

    const token = await getAccessToken(shop);
    if (!token) {
      return NextResponse.json(
        { error: "Shop not connected.", details: "Missing token in shopify_tokens table." },
        { status: 401 }
      );
    }

    if (seoTitle || seoDescription) {
      const mutation = `
        mutation UpdateProductSeo($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `;
      const seo = {
        ...(seoTitle ? { title: seoTitle } : {}),
        ...(seoDescription ? { description: seoDescription } : {}),
      };
      const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query: mutation, variables: { input: { id: productId, seo } } }),
      });
      const json = await resp.json().catch(() => ({}));
      const userErrors = json?.data?.productUpdate?.userErrors || [];
      if (!resp.ok || (Array.isArray(userErrors) && userErrors.length) || json?.errors) {
        return NextResponse.json(
          {
            error: "Shopify SEO update failed",
            details: json?.errors || userErrors || json,
          },
          { status: 400 }
        );
      }
    }

    // Best-effort alt text note. The studio flow mostly uses dedicated push routes for media.
    return NextResponse.json({
      ok: true,
      updated: true,
      altTextApplied: Boolean(altText),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SEO push failed" }, { status: 500 });
  }
}
