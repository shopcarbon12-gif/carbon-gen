import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";
import { isRequestAuthed } from "@/lib/auth";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2026-01").trim();

function normalizeShop(value: string) {
  const v = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v) ? v : "";
}

function toProductGid(productId: string) {
  const id = String(productId || "").trim();
  if (!id) return "";
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

async function getAccessToken(shop: string) {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  const fallback = getShopifyAdminToken(shop);
  return fallback || null;
}

interface PublishFields {
  seoTitle?: string;
  metaDescription?: string;
  handle?: string;
  title?: string;
  bodyHtml?: string;
  tags?: string[];
  productType?: string;
  vendor?: string;
  imageAlts?: Array<{ id: string; altText: string }>;
}

export async function POST(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const shop = normalizeShop(String(body?.shop || ""));
    const productId = toProductGid(String(body?.productId || ""));

    // Accept the new { fields } shape, or fall back to the legacy top-level shape.
    const fields: PublishFields = body?.fields || {
      seoTitle: body?.seoTitle,
      metaDescription: body?.seoDescription,
    };
    const oldHandle = String(body?.oldHandle || "").trim();

    if (!shop) return NextResponse.json({ error: "Missing or invalid shop." }, { status: 400 });
    if (!productId) return NextResponse.json({ error: "Missing productId." }, { status: 400 });

    const token = await getAccessToken(shop);
    if (!token) {
      return NextResponse.json(
        { error: "Shop not connected.", details: "Missing token in shopify_tokens table." },
        { status: 401 }
      );
    }

    // ---- Build the productUpdate input from only the provided fields ----
    const input: Record<string, unknown> = { id: productId };
    const seo: Record<string, string> = {};
    if (typeof fields.seoTitle === "string") seo.title = fields.seoTitle.trim();
    if (typeof fields.metaDescription === "string") seo.description = fields.metaDescription.trim();
    if (Object.keys(seo).length) input.seo = seo;
    if (typeof fields.title === "string" && fields.title.trim()) input.title = fields.title.trim();
    if (typeof fields.handle === "string" && fields.handle.trim()) input.handle = fields.handle.trim().toLowerCase();
    if (typeof fields.bodyHtml === "string") input.descriptionHtml = fields.bodyHtml;
    if (typeof fields.productType === "string") input.productType = fields.productType.trim();
    if (typeof fields.vendor === "string") input.vendor = fields.vendor.trim();
    if (Array.isArray(fields.tags)) {
      input.tags = fields.tags.map((t) => String(t || "").trim()).filter(Boolean);
    }

    const updatedFields: string[] = [];
    const hasProductUpdate = Object.keys(input).length > 1; // more than just id

    if (hasProductUpdate) {
      const mutation = `
        mutation UpdateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id handle }
            userErrors { field message }
          }
        }
      `;
      const result = await runShopifyGraphql<{
        productUpdate?: { product?: { id: string; handle: string }; userErrors?: Array<{ field: string[]; message: string }> };
      }>({ shop, token, query: mutation, variables: { input }, apiVersion: API_VERSION });

      const userErrors = result.data?.productUpdate?.userErrors || [];
      if (!result.ok || result.errors || userErrors.length) {
        return NextResponse.json(
          { error: "Shopify product update failed", details: result.errors || userErrors || result.data },
          { status: result.status === 429 ? 429 : 400 }
        );
      }
      updatedFields.push(...Object.keys(input).filter((k) => k !== "id"));
    }

    // ---- 301 redirect when the handle changed (preserve SEO of the old URL) ----
    let redirectCreated = false;
    const newHandle = typeof input.handle === "string" ? (input.handle as string) : "";
    if (newHandle && oldHandle && newHandle !== oldHandle.toLowerCase()) {
      const redirectMutation = `
        mutation CreateRedirect($redirect: UrlRedirectInput!) {
          urlRedirectCreate(urlRedirect: $redirect) {
            urlRedirect { id }
            userErrors { field message }
          }
        }
      `;
      const redirectResult = await runShopifyGraphql<{
        urlRedirectCreate?: { userErrors?: Array<{ message: string }> };
      }>({
        shop,
        token,
        query: redirectMutation,
        variables: { redirect: { path: `/products/${oldHandle}`, target: `/products/${newHandle}` } },
        apiVersion: API_VERSION,
      });
      // Non-fatal: a redirect may already exist. Report but don't fail the publish.
      redirectCreated = Boolean(redirectResult.ok && !(redirectResult.data?.urlRedirectCreate?.userErrors || []).length);
    }

    // ---- Image alt text (batched) ----
    const altResults: { updated: number; errors: string[] } = { updated: 0, errors: [] };
    const alts = (fields.imageAlts || [])
      .map((a) => ({ id: String(a?.id || "").trim(), alt: String(a?.altText || "").trim() }))
      .filter((a) => a.id.startsWith("gid://shopify/MediaImage/"));
    if (alts.length) {
      const altMutation = `
        mutation ProductUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
          productUpdateMedia(productId: $productId, media: $media) {
            media { ... on MediaImage { id alt } }
            mediaUserErrors { field message }
          }
        }
      `;
      const media = alts.map((a) => ({ id: a.id, alt: a.alt ? a.alt : null }));
      const altResult = await runShopifyGraphql<{
        productUpdateMedia?: { mediaUserErrors?: Array<{ message: string }> };
      }>({ shop, token, query: altMutation, variables: { productId, media }, apiVersion: API_VERSION });
      const errs = altResult.data?.productUpdateMedia?.mediaUserErrors || [];
      if (!altResult.ok || altResult.errors || errs.length) {
        altResults.errors.push(
          ...errs.map((e: { message: string }) => e.message),
          ...(altResult.errors ? ["GraphQL error updating alts"] : [])
        );
      } else {
        altResults.updated = alts.length;
        updatedFields.push("imageAlts");
      }
    }

    // ---- Add product to recommended collections (manual only; smart reject) ----
    const collectionResults: { added: string[]; errors: string[] } = { added: [], errors: [] };
    const addToCollections = Array.isArray(body?.addToCollections)
      ? body.addToCollections
          .map((c: any) => String(c || "").trim())
          .filter((c: string) => c.startsWith("gid://shopify/Collection/"))
      : [];
    if (addToCollections.length) {
      const addMutation = `
        mutation AddToCollection($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            collection { id title }
            userErrors { field message }
          }
        }
      `;
      for (const cid of addToCollections) {
        try {
          const r = await runShopifyGraphql<{
            collectionAddProducts?: { collection?: { title?: string }; userErrors?: Array<{ message: string }> };
          }>({ shop, token, query: addMutation, variables: { id: cid, productIds: [productId] }, apiVersion: API_VERSION });
          const errs = r.data?.collectionAddProducts?.userErrors || [];
          if (!r.ok || r.errors || errs.length) {
            collectionResults.errors.push(`${cid}: ${errs.map((e: { message: string }) => e.message).join("; ") || "failed (smart collections can't be edited)"}`);
          } else {
            collectionResults.added.push(r.data?.collectionAddProducts?.collection?.title || cid);
          }
        } catch (e: any) {
          collectionResults.errors.push(`${cid}: ${e?.message || "error"}`);
        }
      }
      if (collectionResults.added.length) updatedFields.push("collections");
    }

    // ---- Mark the product as optimized by this tool (persists bulk highlight) ----
    let optimizedMarked = false;
    if (body?.markOptimized === true) {
      const metaMutation = `
        mutation SetOptimized($m: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $m) { userErrors { field message } }
        }
      `;
      const stamp = new Date().toISOString();
      const mr = await runShopifyGraphql<{ metafieldsSet?: { userErrors?: Array<{ message: string }> } }>({
        shop,
        token,
        query: metaMutation,
        variables: {
          m: [{ ownerId: productId, namespace: "carbon_seo", key: "optimized_at", type: "single_line_text_field", value: stamp }],
        },
        apiVersion: API_VERSION,
      });
      optimizedMarked = Boolean(mr.ok && !(mr.data?.metafieldsSet?.userErrors || []).length);
      if (optimizedMarked) updatedFields.push("optimized-flag");
    }

    if (!updatedFields.length && !redirectCreated) {
      return NextResponse.json({ error: "No fields provided to publish." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      updatedFields,
      redirectCreated,
      altResults,
      collectionResults,
      optimizedMarked,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SEO publish failed" }, { status: 500 });
  }
}
