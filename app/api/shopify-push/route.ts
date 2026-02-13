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

type ProductMediaImageNode = {
  id: string;
  mediaContentType: string;
  alt: string | null;
  image: { url: string | null } | null;
};

type ProductMediaQuery = {
  product: {
    media: {
      nodes: ProductMediaNode[];
    };
  } | null;
};

type ProductMediaImagesQuery = {
  product: {
    media: {
      nodes: ProductMediaImageNode[];
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

type ProductVariantsQuery = {
  product: {
    options: Array<{ name: string; position: number }>;
    variants: {
      nodes: ProductVariantNode[];
    };
  } | null;
};

type ProductVariantNode = {
  id: string;
  title: string;
  position: number;
  selectedOptions: Array<{ name: string; value: string }>;
  image: { id: string; url: string } | null;
};

type VariantRow = {
  id: string;
  gid: string;
  title: string;
  color: string;
  position: number;
  imageId: string;
  imageUrl: string;
};

type VariantAppendMediaResult = {
  productVariantAppendMedia: {
    product: { id: string } | null;
    productVariants: Array<{ id: string }>;
    userErrors: Array<{ field?: string[]; message: string }>;
  };
};

type VariantOrderUpdateResult = {
  productVariantsBulkUpdate: {
    product: { id: string } | null;
    userErrors: Array<{ field?: string[]; message: string }>;
  };
};

function norm(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAlt(value: unknown) {
  return norm(value).slice(0, 120);
}

function isDataImageUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(String(value || "").trim());
}

function parseDataImage(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const contentType = String(match[1] || "image/png").toLowerCase();
  const base64 = String(match[2] || "");
  const bytes = Buffer.from(base64, "base64");
  const ext =
    contentType.includes("png")
      ? "png"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : contentType.includes("webp")
          ? "webp"
          : "png";
  return { contentType, bytes, ext };
}

function extFromContentType(contentType: string) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "png";
}

function toNumericId(value: string) {
  const v = norm(value);
  if (!v) return "";
  const match = v.match(/(\d+)(?:\D*)$/);
  return match ? match[1] : "";
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

async function listProductImageMedia(shop: string, productGid: string) {
  const query = `
    query ProductMediaImages($productId: ID!) {
      product(id: $productId) {
        media(first: 250) {
          nodes {
            ... on MediaImage {
              id
              mediaContentType
              alt
              image {
                url
              }
            }
          }
        }
      }
    }
  `;
  const result = await runWithAnyToken<ProductMediaImagesQuery>(shop, async (token) =>
    runShopifyGraphql<ProductMediaImagesQuery>({
      shop,
      token,
      query,
      variables: { productId: productGid },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to read product media images: ${JSON.stringify(result.errors)}`);
  }
  const nodes = result.data?.product?.media?.nodes || [];
  return nodes
    .filter(
      (node: ProductMediaImageNode) =>
        String(node.mediaContentType || "").toUpperCase() === "IMAGE" && Boolean(node.image?.url)
    )
    .map((node: ProductMediaImageNode) => ({
      id: norm(node.id),
      url: norm(node.image?.url || ""),
      altText: norm(node.alt || ""),
    }))
    .filter((row: { id: string; url: string }) => row.id && row.url);
}

async function createProductImages(
  shop: string,
  productGid: string,
  images: Array<{ url: string; altText?: string }>
) {
  const supabase = getSupabaseAdmin();
  const bucket = norm(process.env.SUPABASE_STORAGE_BUCKET_ITEMS);
  if (!bucket) {
    throw new Error("Missing SUPABASE_STORAGE_BUCKET_ITEMS for image staging.");
  }
  const preparedImages: Array<{ url: string; altText?: string }> = [];
  for (const image of images) {
    const sourceUrl = norm(image.url);
    if (!sourceUrl) continue;
    let bytes: Buffer | null = null;
    let contentType = "image/png";
    let ext = "png";

    if (isDataImageUrl(sourceUrl)) {
      const parsed = parseDataImage(sourceUrl);
      if (!parsed) continue;
      bytes = parsed.bytes;
      contentType = parsed.contentType;
      ext = parsed.ext;
    } else {
      try {
        const remote = await fetch(sourceUrl, {
          headers: { Accept: "image/*,*/*;q=0.8", "User-Agent": "Mozilla/5.0" },
        });
        if (!remote.ok) {
          preparedImages.push({ url: sourceUrl, altText: image.altText });
          continue;
        }
        contentType = norm(remote.headers.get("content-type")) || "image/png";
        ext = extFromContentType(contentType);
        bytes = Buffer.from(await remote.arrayBuffer());
      } catch {
        preparedImages.push({ url: sourceUrl, altText: image.altText });
        continue;
      }
    }

    if (!bytes || !bytes.length) continue;
    const path = `items/push-staging/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType });
    if (uploadError) throw new Error(uploadError.message || "Failed to stage image for Shopify push.");

    const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    const stagedUrl = norm(signedData?.signedUrl || "");
    if (stagedUrl) {
      preparedImages.push({ url: stagedUrl, altText: image.altText });
      continue;
    }
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    preparedImages.push({ url: norm(publicUrl), altText: image.altText });
  }
  if (!preparedImages.length) {
    throw new Error("No valid images to push.");
  }

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
  const mediaPayload = preparedImages.map((image) => ({
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

async function getProductVariants(shop: string, productGid: string) {
  const query = `
    query ProductVariants($productId: ID!) {
      product(id: $productId) {
        options {
          name
          position
        }
        variants(first: 250) {
          nodes {
            id
            title
            position
            selectedOptions {
              name
              value
            }
            image {
              id
              url
            }
          }
        }
      }
    }
  `;
  const result = await runWithAnyToken<ProductVariantsQuery>(shop, async (token) =>
    runShopifyGraphql<ProductVariantsQuery>({
      shop,
      token,
      query,
      variables: { productId: productGid },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to pull Shopify variants: ${JSON.stringify(result.errors)}`);
  }
  const product = result.data?.product;
  if (!product) return [];
  const colorOptionName =
    product.options
      .map((opt: { name: string; position: number }) => String(opt?.name || "").trim())
      .find((name: string) => /^(color|colour)$/i.test(name)) || "";

  return (product.variants?.nodes || [])
    .map((variant: ProductVariantNode) => {
      const selectedColor = variant.selectedOptions.find((opt: { name: string; value: string }) =>
        colorOptionName
          ? String(opt?.name || "").trim().toLowerCase() === colorOptionName.toLowerCase()
          : /^(color|colour)$/i.test(String(opt?.name || "").trim())
      );
      const color = String(selectedColor?.value || "").trim();
      return {
        id: toNumericId(variant.id),
        gid: norm(variant.id),
        title: norm(variant.title),
        color: color || norm(variant.title),
        position: Number(variant.position || 0),
        imageId: variant.image?.id ? toNumericId(variant.image.id) : "",
        imageUrl: variant.image?.url ? norm(variant.image.url) : "",
      };
    })
    .filter((v: { id: string }) => v.id)
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position) as VariantRow[];
}

function groupVariantRowsByColor(rows: VariantRow[]) {
  const byColor = new Map<string, VariantRow[]>();
  for (const row of rows) {
    const key = norm(row.color || row.title).toLowerCase();
    if (!key) continue;
    const list = byColor.get(key) || [];
    list.push(row);
    byColor.set(key, list);
  }
  const grouped = Array.from(byColor.values())
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.position - b.position);
      const main = sorted[0];
      return {
        id: main.id,
        color: main.color || main.title,
        position: main.position,
        imageUrl: main.imageUrl || "",
        variantCount: sorted.length,
        variantIds: sorted.map((row) => row.id),
      };
    })
    .sort((a, b) => a.position - b.position);
  return grouped;
}

async function assignVariantMedia(
  shop: string,
  productGid: string,
  assignments: Array<{ variantGid: string; mediaId: string }>
) {
  if (!assignments.length) return;
  const mutation = `
    mutation ProductVariantAppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
      productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
        product { id }
        productVariants { id }
        userErrors { field message }
      }
    }
  `;
  const variantMedia = assignments.map((row) => ({
    variantId: row.variantGid,
    mediaIds: [row.mediaId],
  }));

  const result = await runWithAnyToken<VariantAppendMediaResult>(shop, async (token) =>
    runShopifyGraphql<VariantAppendMediaResult>({
      shop,
      token,
      query: mutation,
      variables: { productId: productGid, variantMedia },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to assign variant media: ${JSON.stringify(result.errors)}`);
  }
  const errors = result.data?.productVariantAppendMedia?.userErrors || [];
  if (errors.length) {
    throw new Error(
      `Failed to assign variant media: ${errors
        .map((e: { message: string }) => e.message)
        .join("; ")}`
    );
  }
}

async function reorderVariants(shop: string, productGid: string, orderedVariantGids: string[]) {
  if (!orderedVariantGids.length) return null;
  const mutation = `
    mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product { id }
        userErrors { field message }
      }
    }
  `;
  const variants = orderedVariantGids.map((variantId, idx) => ({
    id: variantId,
    position: idx + 1,
  }));
  const result = await runWithAnyToken<VariantOrderUpdateResult>(shop, async (token) =>
    runShopifyGraphql<VariantOrderUpdateResult>({
      shop,
      token,
      query: mutation,
      variables: { productId: productGid, variants },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    return `Variant reorder skipped: ${JSON.stringify(result.errors)}`;
  }
  const errors = result.data?.productVariantsBulkUpdate?.userErrors || [];
  if (errors.length) {
    return `Variant reorder skipped: ${errors
      .map((e: { message: string }) => e.message)
      .join("; ")}`;
  }
  return null;
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
  const colorAssignments = Array.isArray(body?.colorAssignments)
    ? body.colorAssignments
        .map((row: any) => ({
          color: norm(row?.color).toLowerCase(),
          imageIndex: Number(row?.imageIndex),
        }))
        .filter(
          (row: { color: string; imageIndex: number }) =>
            row.color && Number.isFinite(row.imageIndex) && row.imageIndex >= 0
        )
    : [];
  const colorOrder = Array.isArray(body?.colorOrder)
    ? body.colorOrder.map((v: unknown) => norm(v).toLowerCase()).filter(Boolean)
    : [];
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
    if (action === "get-variants") {
      const variants = await getProductVariants(shop, productGid);
      const colors = groupVariantRowsByColor(variants);
      return NextResponse.json({ success: true, colors });
    }

    if (action === "get-product-media") {
      const media = await listProductImageMedia(shop, productGid);
      return NextResponse.json({ success: true, media });
    }

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
    const variantRows = await getProductVariants(shop, productGid);
    const variantGidByNumericId = new Map(
      variantRows
        .map((row: { id: string; gid: string }) => [row.id, row.gid] as [string, string])
        .filter((row: [string, string]) => row[0] && row[1])
    );
    const variantRowsByColor = new Map<string, VariantRow[]>();
    for (const row of variantRows) {
      const key = norm(row.color || row.title).toLowerCase();
      if (!key) continue;
      const list = variantRowsByColor.get(key) || [];
      list.push(row);
      variantRowsByColor.set(key, list);
    }

    const assignmentPayload = colorAssignments.flatMap((row: { color: string; imageIndex: number }) => {
      const mediaId = created.createdIds[row.imageIndex] || "";
      if (!mediaId) return [];
      const group = variantRowsByColor.get(row.color) || [];
      return group
        .map((variant) => ({
          variantGid: variantGidByNumericId.get(variant.id) || "",
          mediaId,
        }))
        .filter((v) => v.variantGid && v.mediaId);
    });
    if (assignmentPayload.length) {
      await assignVariantMedia(shop, productGid, assignmentPayload);
    }

    const orderedVariantGids = colorOrder.flatMap((color: string) => {
      const group = variantRowsByColor.get(color) || [];
      const sorted = [...group].sort((a, b) => a.position - b.position);
      return sorted
        .map((variant) => variantGidByNumericId.get(variant.id) || "")
        .filter(Boolean);
    });
    const reorderWarning = orderedVariantGids.length
      ? await reorderVariants(shop, productGid, orderedVariantGids)
      : null;

    return NextResponse.json({
      success: true,
      action,
      removedExisting: removeExisting,
      deletedMediaIds,
      createdMediaIds: created.createdIds,
      variantAssignedCount: assignmentPayload.length,
      variantReorderWarning: reorderWarning,
      count: created.createdIds.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Shopify image push failed." }, { status: 500 });
  }
}
