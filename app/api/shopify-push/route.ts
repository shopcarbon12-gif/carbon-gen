import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { downloadStorageObject, tryGetStoragePathFromUrl, uploadBytesToStorage } from "@/lib/storageProvider";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
  toProductGid,
} from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

type ProductMediaNode = {
  id: string;
  mediaContentType: string;
  status?: string | null;
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

type ProductUpdateMediaResult = {
  productUpdateMedia: {
    media?: Array<{ id: string; alt?: string | null }>;
    mediaUserErrors?: Array<{ field?: string[]; message: string }>;
    userErrors?: Array<{ field?: string[]; message: string }>;
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

type ProductReorderMediaResult = {
  productReorderMedia: {
    job?: { id?: string | null } | null;
    mediaUserErrors?: Array<{ field?: string[]; message: string }>;
    userErrors?: Array<{ field?: string[]; message: string }>;
  };
};

function norm(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toMediaGid(value: unknown) {
  const raw = norm(value);
  if (!raw) return "";
  if (raw.startsWith("gid://")) return raw;
  const numeric = raw.match(/\d+/)?.[0] || "";
  return numeric ? `gid://shopify/MediaImage/${numeric}` : "";
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

async function getShopifySourceUrl(sourceUrl: string) {
  let raw = norm(sourceUrl);
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    // Shopify CDN URLs are already public and stable for Shopify ingestion.
    // Do not re-fetch/re-stage these, as server-side fetches can return 4xx.
    if (host === "cdn.shopify.com" || host.endsWith(".cdn.shopify.com") || host === "cdn.shopifycdn.net") {
      return raw;
    }
  } catch {}

  // Re-stage every remote source into our own public storage so Shopify
  // always reads from a stable host with consistent headers/content-type.
  const fallbackExtFromUrl = (() => {
    try {
      const pathname = new URL(raw).pathname || "";
      const ext = pathname.split(".").pop()?.toLowerCase() || "";
      if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif") {
        return ext === "jpeg" ? "jpg" : ext;
      }
    } catch {}
    return "jpg";
  })();

  const stageBytesToStorage = async (bytes: Uint8Array, incomingContentType: string) => {
    if (!bytes.byteLength) {
      throw new Error("source image is empty");
    }
    const loweredType = String(incomingContentType || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const contentType = loweredType && loweredType.startsWith("image/") ? loweredType : "image/jpeg";
    const ext =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("gif")
            ? "gif"
            : contentType.includes("jpg") || contentType.includes("jpeg")
              ? "jpg"
              : fallbackExtFromUrl;
    const path = `items/push-staging/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const uploaded = await uploadBytesToStorage({ path, bytes, contentType });
    return norm(uploaded.url);
  };

  // Some rows carry /api/storage/preview URLs. Resolve those first.
  try {
    const parsed = new URL(raw);
    if (parsed.pathname === "/api/storage/preview") {
      const previewPath = String(parsed.searchParams.get("path") || "").trim();
      const previewUrl = String(parsed.searchParams.get("url") || "").trim();
      const resolvedPath = previewPath || (previewUrl ? tryGetStoragePathFromUrl(previewUrl) : "");
      if (resolvedPath) {
        const { body, contentType } = await downloadStorageObject(resolvedPath);
        return await stageBytesToStorage(new Uint8Array(body), contentType);
      }
      if (previewUrl && /^https?:\/\//i.test(previewUrl)) {
        raw = previewUrl;
      } else {
        throw new Error("source fetch failed (400)");
      }
    }
  } catch (err: any) {
    const message = String(err?.message || "");
    if (/source fetch failed/i.test(message)) throw err;
  }

  const candidates = new Set<string>([raw]);
  try {
    const parsed = new URL(raw);
    if (parsed.search) {
      parsed.search = "";
      candidates.add(parsed.toString());
    }
  } catch {}

  let lastError = "source fetch failed (400)";
  for (const candidate of candidates) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const resp = await fetch(candidate, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; CarbonGenShopifyPush/1.0)",
        },
        cache: "no-store",
      });
      if (!resp.ok) {
        lastError = `source fetch failed (${resp.status})`;
        continue;
      }
      const bytes = new Uint8Array(await resp.arrayBuffer());
      return await stageBytesToStorage(bytes, String(resp.headers.get("content-type") || ""));
    } catch (err: any) {
      lastError = String(err?.message || "source fetch failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError || "source fetch failed (400)");
}

function toNumericId(value: string) {
  const v = norm(value);
  if (!v) return "";
  const match = v.match(/(\d+)(?:\D*)$/);
  return match ? match[1] : "";
}

async function getTokenCandidates(shop: string) {
  const dbToken = await getShopifyAccessToken(shop);
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

async function updateMediaAlt(shop: string, productGid: string, mediaId: string, altText: string) {
  const mutation = `
    mutation ProductUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
      productUpdateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            alt
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  const normalizedAlt = normalizeAlt(altText);
  const normalizedMediaId = toMediaGid(mediaId);
  if (!normalizedMediaId) {
    throw new Error("Invalid mediaId for Shopify alt update.");
  }
  const media = [{ id: normalizedMediaId, alt: normalizedAlt ? normalizedAlt : null }];
  const result = await runWithAnyToken<ProductUpdateMediaResult>(shop, async (token) =>
    runShopifyGraphql<ProductUpdateMediaResult>({
      shop,
      token,
      query: mutation,
      variables: { productId: productGid, media },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to update Shopify media alt text: ${JSON.stringify(result.errors)}`);
  }
  const errors = [
    ...(result.data?.productUpdateMedia?.mediaUserErrors || []),
    ...(result.data?.productUpdateMedia?.userErrors || []),
  ];
  if (errors.length) {
    throw new Error(
      `Failed to update Shopify media alt text: ${errors
        .map((e: { message: string }) => e.message)
        .join("; ")}`
    );
  }
  return { success: true };
}

async function reorderProductMedia(shop: string, productGid: string, orderedMediaIds: string[]) {
  const normalizedIds = Array.from(new Set(orderedMediaIds.map((id) => toMediaGid(id)).filter(Boolean)));
  if (normalizedIds.length < 2) return { success: true };
  const moves = normalizedIds.map((id, idx) => ({ id, newPosition: idx + 1 }));
  const mutation = `
    mutation ProductReorderMedia($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        job {
          id
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `;
  const result = await runWithAnyToken<ProductReorderMediaResult>(shop, async (token) =>
    runShopifyGraphql<ProductReorderMediaResult>({
      shop,
      token,
      query: mutation,
      variables: { id: productGid, moves },
      apiVersion: API_VERSION,
    })
  );
  if (!result.ok) {
    throw new Error(`Failed to reorder Shopify media: ${JSON.stringify(result.errors)}`);
  }
  const errors = [
    ...(result.data?.productReorderMedia?.mediaUserErrors || []),
    ...(result.data?.productReorderMedia?.userErrors || []),
  ];
  if (errors.length) {
    throw new Error(
      `Failed to reorder Shopify media: ${errors
        .map((e: { message: string }) => e.message)
        .join("; ")}`
    );
  }
  return {
    success: true,
    jobId: norm(result.data?.productReorderMedia?.job?.id || ""),
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
            status
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

async function listProductMediaStatusMap(shop: string, productGid: string) {
  const query = `
    query ProductMediaStatus($productId: ID!) {
      product(id: $productId) {
        media(first: 250) {
          nodes {
            id
            mediaContentType
            status
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
    throw new Error(`Failed to read product media status: ${JSON.stringify(result.errors)}`);
  }
  const map = new Map<string, string>();
  const nodes = result.data?.product?.media?.nodes || [];
  for (const node of nodes) {
    const id = norm(node?.id || "");
    if (!id) continue;
    map.set(id, String(node?.status || "").toUpperCase());
  }
  return map;
}

async function waitForMediaReady(
  shop: string,
  productGid: string,
  mediaIds: string[],
  options?: { timeoutMs?: number; intervalMs?: number }
) {
  const target = Array.from(new Set(mediaIds.map((id) => norm(id)).filter(Boolean)));
  if (!target.length) return { ready: true, failedIds: [] as string[] };
  const timeoutMs = Math.max(2_000, Number(options?.timeoutMs || 20_000));
  const intervalMs = Math.max(500, Number(options?.intervalMs || 1_000));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const statusMap = await listProductMediaStatusMap(shop, productGid);
    const failedIds = target.filter((id) => {
      const status = statusMap.get(id) || "";
      return status === "FAILED";
    });
    if (failedIds.length) {
      return { ready: false, failedIds };
    }
    const allReady = target.every((id) => {
      const status = statusMap.get(id) || "";
      return status === "READY";
    });
    if (allReady) return { ready: true, failedIds: [] as string[] };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ready: false, failedIds: [] as string[] };
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
  images: Array<{ url: string; altText?: string; storagePath?: string }>
) {
  const preparedImages: Array<{ url: string; altText?: string }> = [];
  for (const image of images) {
    const storagePath = norm(image.storagePath);
    const sourceUrl = norm(image.url);
    if (!sourceUrl && !storagePath) continue;
    if (storagePath) {
      const { body, contentType } = await downloadStorageObject(storagePath);
      const bytes = new Uint8Array(body);
      if (!bytes.byteLength) {
        throw new Error("Unable to prepare source image URL for Shopify push.");
      }
      const loweredType = String(contentType || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const safeType = loweredType && loweredType.startsWith("image/") ? loweredType : "image/jpeg";
      const ext =
        safeType.includes("png")
          ? "png"
          : safeType.includes("webp")
            ? "webp"
            : safeType.includes("gif")
              ? "gif"
              : safeType.includes("jpg") || safeType.includes("jpeg")
                ? "jpg"
                : "jpg";
      const path = `items/push-staging/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const uploaded = await uploadBytesToStorage({
        path,
        bytes,
        contentType: safeType,
      });
      const stagedUrl = norm(uploaded.url);
      if (!stagedUrl) {
        throw new Error("Unable to prepare source image URL for Shopify push.");
      }
      preparedImages.push({ url: stagedUrl, altText: image.altText });
      continue;
    }
    if (!sourceUrl) continue;
    if (isDataImageUrl(sourceUrl)) {
      const parsed = parseDataImage(sourceUrl);
      if (!parsed) continue;
      const path = `items/push-staging/${Date.now()}-${crypto.randomUUID()}.${parsed.ext}`;
      const uploaded = await uploadBytesToStorage({
        path,
        bytes: parsed.bytes,
        contentType: parsed.contentType,
      });
      const stagedUrl = norm(uploaded.url);
      if (stagedUrl) {
        preparedImages.push({ url: stagedUrl, altText: image.altText });
      }
      continue;
    }

    if (/^https?:\/\//i.test(sourceUrl)) {
      const shopifySourceUrl = await getShopifySourceUrl(sourceUrl);
      if (!shopifySourceUrl) {
        throw new Error("Unable to prepare source image URL for Shopify push.");
      }
      preparedImages.push({ url: shopifySourceUrl, altText: image.altText });
      continue;
    }

    throw new Error("Unable to fetch source image URL for Shopify push.");
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
  if (!assignments.length) return null;
  const assignedMediaIds = Array.from(new Set(assignments.map((row) => norm(row.mediaId)).filter(Boolean)));
  const initialReady = await waitForMediaReady(shop, productGid, assignedMediaIds, {
    timeoutMs: 10_000,
    intervalMs: 1_000,
  });
  if (!initialReady.ready) {
    if (initialReady.failedIds.length) {
      return "Variant mapping skipped: some Shopify media failed processing.";
    }
    return "Variant mapping skipped: Shopify media still processing.";
  }
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

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
    if (!errors.length) return null;

    const message = errors.map((e: { message: string }) => e.message).join("; ");
    const retryable =
      /non-ready media cannot be attached to variants/i.test(message) ||
      /still processing/i.test(message);
    if (!retryable || attempt >= maxAttempts) {
      if (retryable) return "Variant mapping skipped: Shopify media not ready yet.";
      throw new Error(`Failed to assign variant media: ${message}`);
    }
    const ready = await waitForMediaReady(shop, productGid, assignedMediaIds, {
      timeoutMs: 4_000,
      intervalMs: 800,
    });
    if (!ready.ready && ready.failedIds.length) {
      return "Variant mapping skipped: some Shopify media failed processing.";
    }
    const waitMs = 900 * attempt;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return null;
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
  const mediaId = norm(body?.mediaId);
  const altText = normalizeAlt(body?.altText);
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
          storagePath: norm(row?.storagePath),
        }))
        .filter((row: any) => row.url || row.storagePath)
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

    if (action === "update-media-alt") {
      if (!mediaId) {
        return NextResponse.json({ error: "mediaId is required for update-media-alt action." }, { status: 400 });
      }
      const updated = await updateMediaAlt(shop, productGid, mediaId, altText);
      return NextResponse.json(updated);
    }

    if (action === "reorder-media") {
      if (!mediaIds.length) {
        return NextResponse.json({ error: "mediaIds are required for reorder-media action." }, { status: 400 });
      }
      const reordered = await reorderProductMedia(shop, productGid, mediaIds);
      return NextResponse.json(reordered);
    }

    if (action !== "replace-product-images") {
      return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    if (!images.length) {
      return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
    }

    let deletedMediaIds: string[] = [];
    let existingImageMediaIds: string[] = [];
    if (removeExisting) {
      existingImageMediaIds = await listProductImageMediaIds(shop, productGid);
    }

    const created = await createProductImages(shop, productGid, images);
    if (removeExisting && existingImageMediaIds.length) {
      const deleted = await deleteMedia(shop, productGid, existingImageMediaIds);
      deletedMediaIds = deleted.deletedMediaIds || [];
    }
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
    let variantAssignWarning: string | null = null;
    if (assignmentPayload.length) {
      try {
        variantAssignWarning = await assignVariantMedia(shop, productGid, assignmentPayload);
      } catch (err: any) {
        variantAssignWarning = String(err?.message || "Variant media assignment failed.");
      }
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
      variantAssignWarning,
      variantReorderWarning: reorderWarning,
      count: created.createdIds.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Shopify image push failed." }, { status: 500 });
  }
}
