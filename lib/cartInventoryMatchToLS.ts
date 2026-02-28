/**
 * Match Cart Inventory items (Shopify-pulled) to Lightspeed matrix IDs.
 * Updates parent_id from numeric/Shopify IDs to matrix:xxx or sku:xxx so
 * they appear as "In LS Inventory".
 */
import {
  listCartCatalogParents,
  updateCartCatalogParentId,
  upsertCartCatalogParents,
  type StagingParent,
  type StagingVariant,
} from "@/lib/shopifyCartStaging";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isInLightspeedCatalog(parentId: string): boolean {
  const id = normalizeLower(parentId);
  return id.startsWith("matrix:") || id.startsWith("sku:");
}

type LSCatalogRow = {
  itemId: string;
  itemMatrixId: string;
  customSku: string;
  systemSku: string;
  description: string;
  upc: string;
  ean: string;
  color: string;
  size: string;
  category: string;
  brand: string;
  itemType: string;
};

function removeTrailingTokenCaseInsensitive(text: string, token: string): string {
  const source = normalizeText(text);
  const t = normalizeText(token);
  if (!source || !t) return source;
  const lowerSource = source.toLowerCase();
  const lowerToken = t.toLowerCase();
  if (!lowerSource.endsWith(` ${lowerToken}`)) return source;
  return source.slice(0, source.length - t.length - 1).trim();
}

function deriveMatrixTitle(lsItems: LSCatalogRow[]): string {
  const candidates = new Map<string, { raw: string; count: number }>();
  for (const row of lsItems) {
    let base = normalizeText(row.description);
    if (!base) continue;
    base = removeTrailingTokenCaseInsensitive(base, row.size);
    base = removeTrailingTokenCaseInsensitive(base, row.color);
    base = normalizeText(base);
    if (!base) continue;
    const key = base.toLowerCase();
    const current = candidates.get(key);
    if (current) {
      current.count += 1;
    } else {
      candidates.set(key, { raw: base, count: 1 });
    }
  }
  let winner = "";
  let winnerCount = 0;
  for (const v of candidates.values()) {
    if (v.count > winnerCount || (v.count === winnerCount && v.raw.length > winner.length)) {
      winner = v.raw;
      winnerCount = v.count;
    }
  }
  return winner;
}

function buildLSLookup(rows: LSCatalogRow[]): Map<string, LSCatalogRow> {
  const byKey = new Map<string, LSCatalogRow>();
  for (const row of rows) {
    const customSku = normalizeLower(row.customSku);
    const systemSku = normalizeLower(row.systemSku);
    if (customSku) byKey.set(customSku, row);
    if (systemSku && !byKey.has(systemSku)) byKey.set(systemSku, row);
  }
  return byKey;
}

function resolveNewParentId(row: LSCatalogRow): string {
  const matrixId = normalizeText(row.itemMatrixId);
  if (matrixId && matrixId !== "0") {
    return `matrix:${normalizeLower(matrixId)}`;
  }
  const sku = normalizeText(row.customSku) || normalizeText(row.systemSku);
  if (sku) return `sku:${normalizeLower(sku)}`;
  return "";
}

function findLSMatch(
  parent: StagingParent,
  lookup: Map<string, LSCatalogRow>
): LSCatalogRow | null {
  const parentSku = normalizeLower(parent.sku);
  if (parentSku && lookup.has(parentSku)) {
    return lookup.get(parentSku)!;
  }
  for (const v of parent.variants) {
    const variantSku = normalizeLower(v.sku);
    if (variantSku && lookup.has(variantSku)) return lookup.get(variantSku)!;
  }
  return null;
}

export type MatchToLSResult = {
  ok: boolean;
  matched: number;
  skipped: number;
  enriched: number;
  errors: string[];
  warning?: string;
};

/**
 * Fetch LS catalog from the API (paging as needed).
 */
export async function fetchLSCatalog(
  origin: string,
  maxPages = 80
): Promise<LSCatalogRow[]> {
  const allRows: LSCatalogRow[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const url = new URL("/api/lightspeed/catalog", origin);
    url.searchParams.set("all", "1");
    url.searchParams.set("pageSize", "20000");
    url.searchParams.set("shops", "all");
    url.searchParams.set("includeNoStock", "1");
    if (cursor) url.searchParams.set("catalogCursor", cursor);
    else url.searchParams.set("maxPages", "10");

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      rows?: Array<{
        itemId?: string;
        itemMatrixId?: string;
        customSku?: string;
        systemSku?: string;
        upc?: string;
        ean?: string;
        color?: string;
        size?: string;
        category?: string;
        brand?: string;
        itemType?: string;
      }>;
      nextCatalogCursor?: string | null;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(normalizeText(json.error) || "Failed to load LS catalog");
    }

    const rows = Array.isArray(json.rows) ? json.rows : [];
    for (const r of rows) {
      allRows.push({
        itemId: normalizeText(r.itemId),
        itemMatrixId: normalizeText(r.itemMatrixId),
        customSku: normalizeText(r.customSku),
        systemSku: normalizeText(r.systemSku),
        description: normalizeText((r as { description?: unknown }).description),
        upc: normalizeText(r.upc),
        ean: normalizeText(r.ean),
        color: normalizeText(r.color),
        size: normalizeText(r.size),
        category: normalizeText(r.category),
        brand: normalizeText(r.brand) || normalizeText(r.itemType),
        itemType: normalizeText(r.itemType),
      });
    }

    cursor = json.nextCatalogCursor ?? null;
    pages += 1;

    if (!cursor || rows.length === 0) break;
  }

  return allRows;
}

/**
 * Match Cart Inventory parents to LS and update parent_id to matrix:xxx or sku:xxx.
 */
function buildMatrixIndex(rows: LSCatalogRow[]): Map<string, LSCatalogRow[]> {
  const idx = new Map<string, LSCatalogRow[]>();
  for (const r of rows) {
    const mid = normalizeText(r.itemMatrixId);
    if (!mid || mid === "0") continue;
    const arr = idx.get(mid) || [];
    arr.push(r);
    idx.set(mid, arr);
  }
  return idx;
}

function matchVariantToLS(
  v: StagingVariant,
  parentSku: string,
  lsItems: LSCatalogRow[]
): LSCatalogRow | null {
  const vSku = normalizeLower(v.sku) || normalizeLower(parentSku);

  for (const ls of lsItems) {
    if (vSku && (normalizeLower(ls.customSku) === vSku || normalizeLower(ls.systemSku) === vSku)) return ls;
  }
  return null;
}

export async function runMatchToLSMatrix(
  shop: string,
  origin: string
): Promise<MatchToLSResult> {
  const errors: string[] = [];
  let matched = 0;
  let skipped = 0;

  const catalogRows = await fetchLSCatalog(origin);
  const lookup = buildLSLookup(catalogRows);
  const matrixIdx = buildMatrixIndex(catalogRows);

  const listed = await listCartCatalogParents(shop);
  const toConvert = listed.data.filter((p) => !isInLightspeedCatalog(p.id));

  for (const parent of toConvert) {
    const lsRow = findLSMatch(parent, lookup);
    if (!lsRow) {
      skipped += 1;
      continue;
    }

    const newParentId = resolveNewParentId(lsRow);
    if (!newParentId) {
      errors.push(`No LS ID for ${parent.sku}`);
      continue;
    }

    const matrixId = normalizeText(lsRow.itemMatrixId);
    const siblingItems = (matrixId && matrixId !== "0" ? matrixIdx.get(matrixId) : null) || [lsRow];
    const lsTitle = deriveMatrixTitle(siblingItems);

    const updatedVariants: StagingVariant[] = parent.variants.map((v) => {
      const lsMatch = matchVariantToLS(v, parent.sku, siblingItems);
      const newSku = normalizeText(lsMatch?.customSku) || normalizeText(lsMatch?.systemSku);
      const newUpc = normalizeText(lsMatch?.upc);
      return {
        ...v,
        parentId: newParentId,
        ...(newSku && !normalizeText(v.sku) ? { sku: newSku } : {}),
        ...(newUpc && !normalizeText(v.upc) ? { upc: newUpc } : {}),
      };
    });

    const lsCategory = normalizeText(lsRow.category);
    const lsBrand = normalizeText(lsRow.brand);

    const updatedParent: StagingParent = {
      ...parent,
      id: newParentId,
      variants: updatedVariants,
      ...(lsTitle ? { title: lsTitle } : {}),
      ...(lsCategory ? { category: lsCategory } : {}),
      ...(lsBrand ? { brand: lsBrand } : {}),
    };

    const result = await updateCartCatalogParentId(shop, parent.id, updatedParent);
    if (result.ok && result.data.updated > 0) {
      matched += 1;
    } else if (result.warning) {
      errors.push(`${parent.sku}: ${result.warning}`);
    }
  }

  let enriched = 0;
  const alreadyMatched = listed.data.filter((p) => isInLightspeedCatalog(p.id));
  for (const parent of alreadyMatched) {
    const needsEnrich = parent.variants.some(
      (v) => !normalizeText(v.sku) || !normalizeText(v.upc)
    ) || !normalizeText(parent.brand) || normalizeLower(parent.brand) === "default";
    if (!needsEnrich) continue;

    const lsRow = findLSMatch(parent, lookup);
    if (!lsRow) continue;

    const matrixId = normalizeText(lsRow.itemMatrixId);
    const siblingItems = (matrixId && matrixId !== "0" ? matrixIdx.get(matrixId) : null) || [lsRow];
    const lsTitle = deriveMatrixTitle(siblingItems);

    let changed = false;
    const updatedVariants: StagingVariant[] = parent.variants.map((v) => {
      const lsMatch = matchVariantToLS(v, parent.sku, siblingItems);
      const newSku = normalizeText(lsMatch?.customSku) || normalizeText(lsMatch?.systemSku);
      const newUpc = normalizeText(lsMatch?.upc);
      const skuUpdate = newSku && !normalizeText(v.sku) ? newSku : undefined;
      const upcUpdate = newUpc && !normalizeText(v.upc) ? newUpc : undefined;
      if (skuUpdate || upcUpdate) changed = true;
      return {
        ...v,
        ...(skuUpdate ? { sku: skuUpdate } : {}),
        ...(upcUpdate ? { upc: upcUpdate } : {}),
      };
    });

    const lsCategory = normalizeText(lsRow.category);
    const lsBrand = normalizeText(lsRow.brand);
    const catUpdate = lsCategory && !normalizeText(parent.category) ? lsCategory : undefined;
    const brandUpdate = lsBrand && (!normalizeText(parent.brand) || normalizeLower(parent.brand) === "default") ? lsBrand : undefined;
    const titleUpdate = lsTitle && normalizeLower(parent.title) !== normalizeLower(lsTitle) ? lsTitle : undefined;
    if (catUpdate || brandUpdate) changed = true;
    if (titleUpdate) changed = true;

    if (!changed) continue;

    const updatedParent: StagingParent = {
      ...parent,
      variants: updatedVariants,
      ...(titleUpdate ? { title: titleUpdate } : {}),
      ...(catUpdate ? { category: catUpdate } : {}),
      ...(brandUpdate ? { brand: brandUpdate } : {}),
    };

    try {
      await upsertCartCatalogParents(shop, [updatedParent]);
      enriched += 1;
    } catch (e) {
      errors.push(`Enrich ${parent.sku}: ${(e as Error)?.message}`);
    }
  }

  return {
    ok: true,
    matched,
    skipped,
    enriched,
    errors,
    warning:
      errors.length > 0
        ? `${errors.length} issue(s) during update`
        : undefined,
  };
}
