import sharp from "sharp";
import {
  lsGet,
  lsDelete,
  lsPostMultipartV3,
} from "@/lib/lightspeedApi";

const LS_IMAGE_MAX_DIMENSION = 650;
const LS_IMAGE_MAX_BYTES = 7_500_000; // 7.5 MB (leave margin under 8 MB)
const LS_IMAGE_QUALITY_START = 88;
const LS_IMAGE_QUALITY_MIN = 50;

export interface ImageSyncSettings {
  pushShopifyImagesToLS: boolean;
  deleteExistingLSImages: boolean;
}

export interface LsImageMeta {
  imageID: string;
  description: string;
  filename: string;
  ordering: string;
  publicID: string;
  baseImageURL: string;
  size: string;
  itemID: string;
  itemMatrixID: string;
}

export interface ImageSyncResult {
  itemId: string;
  itemMatrixId?: string;
  deleted: number;
  uploaded: number;
  errors: string[];
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .slice(0, 100) || "image.jpg";
}

/**
 * Download an image from a URL and return the raw buffer.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Failed to download image: ${resp.status} ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Process an image buffer: resize to fit within LS_IMAGE_MAX_DIMENSION,
 * convert to JPEG, and compress to stay under LS_IMAGE_MAX_BYTES.
 */
export async function processImageForLS(input: Buffer): Promise<Buffer> {
  let pipeline = sharp(input)
    .resize(LS_IMAGE_MAX_DIMENSION, LS_IMAGE_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: LS_IMAGE_QUALITY_START, mozjpeg: true });

  let result = await pipeline.toBuffer();

  if (result.byteLength <= LS_IMAGE_MAX_BYTES) return result;

  for (let q = LS_IMAGE_QUALITY_START - 10; q >= LS_IMAGE_QUALITY_MIN; q -= 10) {
    pipeline = sharp(input)
      .resize(LS_IMAGE_MAX_DIMENSION, LS_IMAGE_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: q, mozjpeg: true });
    result = await pipeline.toBuffer();
    if (result.byteLength <= LS_IMAGE_MAX_BYTES) return result;
  }

  if (result.byteLength > LS_IMAGE_MAX_BYTES) {
    console.warn(`[image-sync] Image still ${(result.byteLength / 1_000_000).toFixed(1)}MB after quality reduction (limit: ${(LS_IMAGE_MAX_BYTES / 1_000_000).toFixed(1)}MB). Upload may fail.`);
  }
  return result;
}

/**
 * List all LS images for a given item or matrix.
 */
export async function listLsImages(
  opts: { itemID?: string; itemMatrixID?: string }
): Promise<LsImageMeta[]> {
  const query: Record<string, string | number> = { limit: 100 };
  if (opts.itemID) query.itemID = opts.itemID;
  if (opts.itemMatrixID) query.itemMatrixID = opts.itemMatrixID;

  const res = await lsGet<{ Image?: LsImageMeta | LsImageMeta[] }>("Image", query);
  if (!res?.Image) return [];
  return Array.isArray(res.Image) ? res.Image : [res.Image];
}

/**
 * Delete all LS images for a given item or matrix.
 */
export async function deleteAllLsImages(
  opts: { itemID?: string; itemMatrixID?: string }
): Promise<number> {
  const images = await listLsImages(opts);
  let deleted = 0;
  for (const img of images) {
    try {
      await lsDelete(`Image/${img.imageID}`);
      deleted++;
    } catch (err) {
      console.warn(`[image-sync] Failed to delete image ${img.imageID}:`, err);
    }
  }
  return deleted;
}

/**
 * Upload a single image to LS for an item or matrix.
 */
export async function uploadImageToLS(opts: {
  imageBuffer: Buffer;
  filename: string;
  description: string;
  ordering: number;
  itemID?: string;
  itemMatrixID?: string;
}): Promise<LsImageMeta | null> {
  const metadata: Record<string, unknown> = {
    description: opts.description,
    ordering: opts.ordering,
  };

  let resource: string;
  if (opts.itemID) {
    resource = `Item/${opts.itemID}/Image`;
    metadata.itemID = Number(opts.itemID);
  } else if (opts.itemMatrixID) {
    resource = `ItemMatrix/${opts.itemMatrixID}/Image`;
    metadata.itemMatrixID = Number(opts.itemMatrixID);
  } else {
    throw new Error("Either itemID or itemMatrixID is required");
  }

  const safeName = sanitizeFilename(opts.filename);

  const formData = new FormData();
  formData.append("data", JSON.stringify(metadata));
  const ab = opts.imageBuffer.buffer.slice(
    opts.imageBuffer.byteOffset,
    opts.imageBuffer.byteOffset + opts.imageBuffer.byteLength,
  ) as ArrayBuffer;
  formData.append(
    "image",
    new Blob([ab], { type: "image/jpeg" }),
    safeName,
  );

  try {
    const res = await lsPostMultipartV3<{ Image?: LsImageMeta }>(resource, formData);
    return res?.Image || null;
  } catch (err) {
    console.error(`[image-sync] Upload failed for ${resource}:`, err);
    return null;
  }
}

/**
 * Sync images from Shopify to a Lightspeed item.
 * Downloads Shopify images, processes them, and uploads to LS.
 */
export async function syncImagesToLsItem(opts: {
  itemID: string;
  shopifyImageUrls: string[];
  productTitle: string;
  deleteFirst: boolean;
}): Promise<ImageSyncResult> {
  const result: ImageSyncResult = {
    itemId: opts.itemID,
    deleted: 0,
    uploaded: 0,
    errors: [],
  };

  if (opts.shopifyImageUrls.length === 0) return result;

  let existingCount = 0;
  let oldImageIds: string[] = [];
  if (opts.deleteFirst) {
    const existing = await listLsImages({ itemID: opts.itemID });
    existingCount = existing.length;
    oldImageIds = existing.map((img) => img.imageID);
  } else {
    existingCount = (await listLsImages({ itemID: opts.itemID })).length;
  }

  const slotsAvailable = Math.max(0, 12 - (opts.deleteFirst ? 0 : existingCount));
  const maxImages = Math.min(opts.shopifyImageUrls.length, slotsAvailable);
  if (maxImages === 0 && !opts.deleteFirst) return result;

  for (let i = 0; i < Math.min(opts.shopifyImageUrls.length, 12); i++) {
    const url = opts.shopifyImageUrls[i];
    try {
      const raw = await downloadImage(url);
      const processed = await processImageForLS(raw);
      const uploaded = await uploadImageToLS({
        imageBuffer: processed,
        filename: `${sanitizeFilename(opts.productTitle)}-${i}.jpg`,
        description: opts.productTitle,
        ordering: i,
        itemID: opts.itemID,
      });
      if (uploaded) result.uploaded++;
      else result.errors.push(`Upload returned null for image ${i}`);
    } catch (err) {
      result.errors.push(`Image ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (opts.deleteFirst && result.uploaded > 0 && oldImageIds.length > 0) {
    for (const imgId of oldImageIds) {
      try {
        await lsDelete(`Image/${imgId}`);
        result.deleted++;
      } catch (err) {
        console.warn(`[image-sync] Failed to delete old image ${imgId}:`, err);
      }
    }
  }

  return result;
}

/**
 * Sync images from Shopify to a Lightspeed matrix (parent).
 * Downloads ALL Shopify product images, processes them, and uploads to the LS matrix.
 */
export async function syncImagesToLsMatrix(opts: {
  itemMatrixID: string;
  shopifyImageUrls: string[];
  productTitle: string;
  deleteFirst: boolean;
}): Promise<ImageSyncResult> {
  const result: ImageSyncResult = {
    itemId: "",
    itemMatrixId: opts.itemMatrixID,
    deleted: 0,
    uploaded: 0,
    errors: [],
  };

  if (opts.shopifyImageUrls.length === 0) return result;

  let oldImageIds: string[] = [];
  let existingCount = 0;
  if (opts.deleteFirst) {
    const existing = await listLsImages({ itemMatrixID: opts.itemMatrixID });
    existingCount = existing.length;
    oldImageIds = existing.map((img) => img.imageID);
  } else {
    existingCount = (await listLsImages({ itemMatrixID: opts.itemMatrixID })).length;
  }

  const slotsAvailable = Math.max(0, 12 - (opts.deleteFirst ? 0 : existingCount));
  const maxImages = Math.min(opts.shopifyImageUrls.length, slotsAvailable);
  if (maxImages === 0 && !opts.deleteFirst) return result;

  for (let i = 0; i < Math.min(opts.shopifyImageUrls.length, 12); i++) {
    const url = opts.shopifyImageUrls[i];
    try {
      const raw = await downloadImage(url);
      const processed = await processImageForLS(raw);
      const uploaded = await uploadImageToLS({
        imageBuffer: processed,
        filename: `${sanitizeFilename(opts.productTitle)}-${i}.jpg`,
        description: opts.productTitle,
        ordering: i,
        itemMatrixID: opts.itemMatrixID,
      });
      if (uploaded) result.uploaded++;
      else result.errors.push(`Upload returned null for matrix image ${i}`);
    } catch (err) {
      result.errors.push(`Matrix image ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (opts.deleteFirst && result.uploaded > 0 && oldImageIds.length > 0) {
    for (const imgId of oldImageIds) {
      try {
        await lsDelete(`Image/${imgId}`);
        result.deleted++;
      } catch (err) {
        console.warn(`[image-sync] Failed to delete old matrix image ${imgId}:`, err);
      }
    }
  }

  return result;
}
