import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
  toProductGid,
} from "@/lib/shopify";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

type ProductMediaNode = {
  id: string;
  mediaContentType: string;
};

type ProductMediaQuery = {
  product: {
    media: {
      nodes: ProductMediaNode[];
    };
  } | null;
};

type ProductDeleteMediaResult = {
  productDeleteMedia: {
    deletedMediaIds: string[];
    mediaUserErrors: Array<{ field?: string[]; message: string }>;
  };
};

type ProductCreateMediaResult = {
  productCreateMedia: {
    media: Array<{ id: string }>;
    mediaUserErrors: Array<{ field?: string[]; message: string }>;
  };
};

function norm(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAlt(value: unknown) {
  return norm(value).slice(0, 120);
}

async function getTokenCandidates(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();
  const dbToken = !error ? norm(data?.access_token) : "";
  const envToken = norm(getShopifyAdminToken(shop));
  const out: string[] = [];
  if (dbToken) out.push(dbToken);
  if (envToken && envToken !== dbToken) out.push(envToken);
  return out;
}

async function runWithAnyToken<T>(
  shop: string,
  fn: (token: string) => Promise<{ ok: boolean; status: number; data: T | null; errors: any }>
) {
  const tokens = await getTokenCandidates(shop);
  if (!tokens.length) {
    return { ok: false, status: 401, data: null as T | null, errors: "Shop not connected." };
  }
  let last: any = null;
  for (const token of tokens) {
    const result = await fn(token);
    if (result.ok) return result;
    last = result;
  }
  return last || { ok: false, status: 500, data: null as T | null, errors: "Unknown Shopify error." };
}

async function deleteMedia(shop: string, productGid: string, mediaIds: string[]) {
  if (!mediaIds.length) return { deletedMediaIds: [] as string[] };
  const mutation = `
    mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  const result = await runWithAnyToken<ProductDeleteMediaResult>(shop, async (token) =>
    runShopifyGraphql<ProductDeleteMediaResult>({
      shop,
      token,
      query: mutation,
      variables: { productId: productGid, mediaIds },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to delete Shopify media: ${JSON.stringify(result.errors)}`);
  }
  const errors = result.data?.productDeleteMedia?.mediaUserErrors || [];
  if (errors.length) {
    throw new Error(
      `Failed to delete Shopify media: ${errors
        .map((e: { message: string }) => e.message)
        .join("; ")}`
    );
  }
  return {
    deletedMediaIds: result.data?.productDeleteMedia?.deletedMediaIds || [],
  };
}

async function listProductImageMediaIds(shop: string, productGid: string) {
  const query = `
    query ProductMedia($productId: ID!) {
      product(id: $productId) {
        media(first: 250) {
          nodes {
            id
            mediaContentType
          }
        }
      }
    }
  `;
  const result = await runWithAnyToken<ProductMediaQuery>(shop, async (token) =>
    runShopifyGraphql<ProductMediaQuery>({
      shop,
      token,
      query,
      variables: { productId: productGid },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to read product media: ${JSON.stringify(result.errors)}`);
  }
  const nodes = result.data?.product?.media?.nodes || [];
  return nodes
    .filter((n: ProductMediaNode) => String(n.mediaContentType || "").toUpperCase() === "IMAGE")
    .map((n: ProductMediaNode) => String(n.id || "").trim())
    .filter(Boolean);
}

async function createProductImages(
  shop: string,
  productGid: string,
  images: Array<{ url: string; altText?: string }>
) {
  const mutation = `
    mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  const mediaPayload = images.map((image) => ({
    mediaContentType: "IMAGE",
    originalSource: image.url,
    alt: normalizeAlt(image.altText || ""),
  }));
  const result = await runWithAnyToken<ProductCreateMediaResult>(shop, async (token) =>
    runShopifyGraphql<ProductCreateMediaResult>({
      shop,
      token,
      query: mutation,
      variables: { productId: productGid, media: mediaPayload },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to create Shopify media: ${JSON.stringify(result.errors)}`);
  }
  const errors = result.data?.productCreateMedia?.mediaUserErrors || [];
  if (errors.length) {
    throw new Error(
      `Failed to create Shopify media: ${errors
        .map((e: { message: string }) => e.message)
        .join("; ")}`
    );
  }
  const createdIds = (result.data?.productCreateMedia?.media || [])
    .map((m: { id: string }) => String(m?.id || "").trim())
    .filter(Boolean);
  return { createdIds };
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = norm(body?.action) || "replace-product-images";
  const shop = normalizeShopDomain(norm(body?.shop));
  const productGid = toProductGid(norm(body?.productId));
  const mediaIds = Array.isArray(body?.mediaIds) ? body.mediaIds.map((v: unknown) => norm(v)).filter(Boolean) : [];
  const removeExisting = Boolean(body?.removeExisting);
  const images = Array.isArray(body?.images)
    ? body.images
        .map((row: any) => ({
          url: norm(row?.url),
          altText: normalizeAlt(row?.altText),
        }))
        .filter((row: any) => row.url)
    : [];

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }
  if (!productGid) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  }

  try {
    if (action === "delete-media") {
      if (!mediaIds.length) {
        return NextResponse.json({ error: "mediaIds are required for delete-media action." }, { status: 400 });
      }
      const deleted = await deleteMedia(shop, productGid, mediaIds);
      return NextResponse.json({ success: true, ...deleted });
    }

    if (action !== "replace-product-images") {
      return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    if (!images.length) {
      return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
    }

    let deletedMediaIds: string[] = [];
    if (removeExisting) {
      const existingImageMediaIds = await listProductImageMediaIds(shop, productGid);
      if (existingImageMediaIds.length) {
        const deleted = await deleteMedia(shop, productGid, existingImageMediaIds);
        deletedMediaIds = deleted.deletedMediaIds || [];
      }
    }

    const created = await createProductImages(shop, productGid, images);
    return NextResponse.json({
      success: true,
      action,
      removedExisting: removeExisting,
      deletedMediaIds,
      createdMediaIds: created.createdIds,
      count: created.createdIds.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Shopify image push failed." }, { status: 500 });
  }
}
