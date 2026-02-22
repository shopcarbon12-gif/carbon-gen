import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken, normalizeShopDomain, runShopifyGraphql } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

async function getToken(shop: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();
  const dbToken = String(data?.access_token || "").trim();
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

type ProductNode = {
  id: string;
  title: string;
  status: string;
  descriptionHtml?: string;
  variantsCount?: { count?: number };
  productType?: string;
  vendor?: string;
  variants?: { nodes: Array<{ sku?: string; barcode?: string; inventoryQuantity?: number }> };
  images?: { nodes: Array<{ id: string }> };
  featuredImage?: { url: string } | null;
};

type FlatProduct = {
  id: string;
  title: string;
  titleLower: string;
  hasDescription: boolean;
  descriptionLength: number;
  variants: number;
  productType: string;
  vendor: string;
  skus: string[];
  barcodes: string[];
  inventoryQuantities: { sku: string; qty: number }[];
  imageCount: number;
  hasPicture: boolean;
};

function flatten(p: ProductNode): FlatProduct {
  const varNodes = p.variants?.nodes || [];
  const skus = varNodes.map((v) => (v.sku || "").trim()).filter(Boolean);
  const barcodes = varNodes.map((v) => (v.barcode || "").trim()).filter(Boolean);
  const inventoryQuantities = varNodes.map((v) => ({ sku: (v.sku || "").trim(), qty: v.inventoryQuantity ?? 0 }));
  const desc = (p.descriptionHtml || "").trim();
  const imgCount = p.images?.nodes?.length ?? 0;
  return {
    id: p.id,
    title: p.title || "",
    titleLower: (p.title || "").trim().toLowerCase(),
    hasDescription: desc.length > 0,
    descriptionLength: desc.length,
    variants: p.variantsCount?.count ?? varNodes.length,
    productType: p.productType || "",
    vendor: p.vendor || "",
    skus,
    barcodes,
    inventoryQuantities,
    imageCount: imgCount,
    hasPicture: imgCount > 0 || !!p.featuredImage?.url,
  };
}

async function fetchAll(shop: string, token: string, statusFilter: string): Promise<FlatProduct[]> {
  const results: FlatProduct[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 120; page++) {
    const afterClause: string = cursor ? `, after: "${cursor}"` : "";
    const res = await runShopifyGraphql<{
      products?: {
        edges: Array<{ node: ProductNode; cursor: string }>;
        pageInfo: { hasNextPage: boolean };
      };
    }>({
      shop,
      token,
      query: `query {
        products(first: 250, query: "status:${statusFilter}"${afterClause}) {
          edges {
            node {
              id title status descriptionHtml productType vendor
              variantsCount { count }
              variants(first: 100) { nodes { sku barcode } }
              images(first: 1) { nodes { id } }
              featuredImage { url }
            }
            cursor
          }
          pageInfo { hasNextPage }
        }
      }`,
      variables: {},
      apiVersion: API_VERSION,
    });
    if (!res.ok || !res.data?.products) break;
    const edges = res.data.products.edges;
    for (const e of edges) results.push(flatten(e.node));
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
    if (!res.data.products.pageInfo.hasNextPage) break;
  }
  return results;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawShop = String(searchParams.get("shop") || "").trim();
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) return NextResponse.json({ ok: false, error: "Missing shop" }, { status: 400 });
    const token = await getToken(shop);
    if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 401 });

    const [active, archived] = await Promise.all([
      fetchAll(shop, token, "active"),
      fetchAll(shop, token, "archived"),
    ]);

    const archivedByTitle = new Map<string, FlatProduct[]>();
    const archivedBySku = new Map<string, FlatProduct[]>();
    const archivedByBarcode = new Map<string, FlatProduct[]>();

    for (const a of archived) {
      if (a.titleLower) {
        const arr = archivedByTitle.get(a.titleLower) || [];
        arr.push(a);
        archivedByTitle.set(a.titleLower, arr);
      }
      for (const s of a.skus) {
        const arr = archivedBySku.get(s.toLowerCase()) || [];
        arr.push(a);
        archivedBySku.set(s.toLowerCase(), arr);
      }
      for (const b of a.barcodes) {
        const arr = archivedByBarcode.get(b.toLowerCase()) || [];
        arr.push(a);
        archivedByBarcode.set(b.toLowerCase(), arr);
      }
    }

    type Match = {
      activeProduct: { id: string; title: string; variants: number; productType: string; vendor: string; hasDescription: boolean; descriptionLength: number; hasPicture: boolean; imageCount: number };
      archivedProduct: { id: string; title: string; variants: number; productType: string; vendor: string; hasDescription: boolean; descriptionLength: number; hasPicture: boolean; imageCount: number };
      matchedBy: string;
    };

    const seen = new Set<string>();
    const mismatches: Match[] = [];

    for (const act of active) {
      if (act.hasDescription) continue;

      const candidates: Array<{ product: FlatProduct; matchedBy: string }> = [];

      for (const s of act.skus) {
        const found = archivedBySku.get(s.toLowerCase());
        if (found) for (const f of found) candidates.push({ product: f, matchedBy: `sku:${s}` });
      }
      for (const b of act.barcodes) {
        const found = archivedByBarcode.get(b.toLowerCase());
        if (found) for (const f of found) candidates.push({ product: f, matchedBy: `barcode:${b}` });
      }
      const titleMatches = archivedByTitle.get(act.titleLower);
      if (titleMatches) for (const f of titleMatches) candidates.push({ product: f, matchedBy: "title" });

      for (const c of candidates) {
        if (!c.product.hasDescription) continue;
        const key = `${act.id}|${c.product.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mismatches.push({
          activeProduct: { id: act.id, title: act.title, variants: act.variants, productType: act.productType, vendor: act.vendor, hasDescription: act.hasDescription, descriptionLength: act.descriptionLength, hasPicture: act.hasPicture, imageCount: act.imageCount },
          archivedProduct: { id: c.product.id, title: c.product.title, variants: c.product.variants, productType: c.product.productType, vendor: c.product.vendor, hasDescription: c.product.hasDescription, descriptionLength: c.product.descriptionLength, hasPicture: c.product.hasPicture, imageCount: c.product.imageCount },
          matchedBy: c.matchedBy,
        });
      }
    }

    const activeNoDesc = active.filter((a) => !a.hasDescription).length;

    return NextResponse.json({
      ok: true,
      totalActive: active.length,
      totalArchived: archived.length,
      activeWithoutDescription: activeNoDesc,
      activeWithDescription: active.length - activeNoDesc,
      mismatchCount: mismatches.length,
      mismatches,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { shop?: string; ids?: string[] };
    const rawShop = String(body.shop || "").trim();
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) return NextResponse.json({ ok: false, error: "Missing shop" }, { status: 400 });
    const token = await getToken(shop);
    if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 401 });

    const ids = (body.ids || []).map((id: string) => {
      const s = String(id).trim();
      return s.startsWith("gid://") ? s : `gid://shopify/Product/${s}`;
    });
    if (!ids.length) return NextResponse.json({ ok: false, error: "No ids provided" }, { status: 400 });

    const BATCH = 50;
    const results: Array<{
      id: string; title: string; status: string;
      hasDescription: boolean; descriptionLength: number;
      hasPicture: boolean; imageCount: number;
      variants: number; productType: string; vendor: string;
      skus: string[]; barcodes: string[];
      inventoryQuantities: { sku: string; qty: number }[];
    }> = [];

    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const gidList = chunk.map((g: string) => `"${g}"`).join(",");
      const res = await runShopifyGraphql<{
        nodes?: Array<ProductNode | null>;
      }>({
        shop, token,
        query: `query { nodes(ids: [${gidList}]) { ... on Product { id title status descriptionHtml productType vendor variantsCount { count } variants(first: 100) { nodes { sku barcode inventoryQuantity } } images(first: 5) { nodes { id } } featuredImage { url } } } }`,
        variables: {},
        apiVersion: API_VERSION,
      });
      for (const node of (res.data?.nodes || [])) {
        if (!node || !node.id) continue;
        const f = flatten(node);
        results.push({
          id: f.id.replace("gid://shopify/Product/", ""),
          title: f.title, status: node.status,
          hasDescription: f.hasDescription, descriptionLength: f.descriptionLength,
          hasPicture: f.hasPicture, imageCount: f.imageCount,
          variants: f.variants, productType: f.productType, vendor: f.vendor,
          skus: f.skus, barcodes: f.barcodes,
          inventoryQuantities: f.inventoryQuantities,
        });
      }
    }

    return NextResponse.json({ ok: true, count: results.length, products: results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
