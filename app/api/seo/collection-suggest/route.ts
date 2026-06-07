import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";
import { isRequestAuthed } from "@/lib/auth";
import { computeCollectionAutoMap } from "@/lib/shopifyCollectionAutoMapper";
import { listAndEnsureMenuNodes, type CollectionOption, type MenuNodeRecord } from "@/lib/shopifyCollectionMappingRepository";
import { normalizeMenuPath } from "@/lib/shopifyCollectionSkuParser";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2026-01").trim();

function normalizeShop(value: string) {
  const v = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v) ? v : "";
}
async function getAccessToken(shop: string) {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

interface CollNode {
  id?: string; title?: string; handle?: string;
  ruleSet?: { rules?: Array<{ column?: string }> } | null;
  productsCount?: { count?: number } | null;
}

async function fetchCollections(shop: string, token: string): Promise<CollectionOption[]> {
  const query = `query Colls($first:Int!,$after:String){ collections(first:$first,after:$after,sortKey:TITLE){ nodes{ id title handle productsCount{count} ruleSet{rules{column}} } pageInfo{hasNextPage endCursor} } }`;
  const out: CollectionOption[] = [];
  let after: string | null = null;
  for (let p = 0; p < 4; p += 1) {
    const r: { ok: boolean; status: number; errors: unknown; data: { collections?: { nodes: CollNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null } =
      await runShopifyGraphql({ shop, token, query, variables: { first: 250, after }, apiVersion: API_VERSION });
    if (!r.ok || r.errors) break;
    for (const n of r.data?.collections?.nodes || []) {
      if (!n.id) continue;
      out.push({
        id: String(n.id), title: String(n.title || ""), handle: String(n.handle || ""),
        productsCount: Number(n.productsCount?.count || 0),
        isAutomated: Array.isArray(n.ruleSet?.rules) && (n.ruleSet?.rules?.length || 0) > 0,
      });
    }
    const pi = r.data?.collections?.pageInfo;
    if (!pi?.hasNextPage) break;
    after = pi.endCursor;
  }
  return out;
}

/** Full "A > B > C" label path for a menu node by walking its parent chain. */
function buildLabelPath(node: MenuNodeRecord, byKey: Map<string, MenuNodeRecord>): string {
  const labels: string[] = [];
  let cur: MenuNodeRecord | undefined = node;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.nodeKey)) {
    guard.add(cur.nodeKey);
    labels.unshift(cur.label);
    cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined;
  }
  return labels.join(" > ");
}

export async function POST(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const shop = normalizeShop(String(body?.shop || ""));
    const sku = String(body?.sku || "").trim();
    const barcode = String(body?.barcode || "").trim();
    const title = String(body?.title || "").trim();
    const itemType = String(body?.itemType || "").trim();
    if (!shop) return NextResponse.json({ error: "Missing or invalid shop." }, { status: 400 });
    if (!sku && !barcode) return NextResponse.json({ error: "Need a SKU or barcode to map collections." }, { status: 400 });

    const token = await getAccessToken(shop);
    if (!token) return NextResponse.json({ error: "Shop not connected." }, { status: 401 });

    const collections = await fetchCollections(shop, token);
    const { nodes } = await listAndEnsureMenuNodes(shop, collections);

    // Deterministic barcode -> category mapping.
    const auto = computeCollectionAutoMap({ sku, upc: barcode, title, itemType, assignedMenuPaths: [] });

    // Indexes for resolving menu paths + handles to real collections.
    const byKey = new Map(nodes.map((n) => [n.nodeKey, n]));
    const nodeByPath = new Map<string, MenuNodeRecord>();
    for (const n of nodes) nodeByPath.set(normalizeMenuPath(buildLabelPath(n, byKey)), n);
    const collById = new Map(collections.map((c) => [c.id, c]));
    const collByHandle = new Map(collections.map((c) => [c.handle.toLowerCase(), c]));

    type Rec = { id: string; title: string; handle: string; smart: boolean; source: "auto" | "suggested"; reason: string };
    const recs = new Map<string, Rec>();

    const addCollection = (collId: string | null | undefined, handle: string | null | undefined, source: "auto" | "suggested", reason: string) => {
      let coll = collId ? collById.get(collId) : undefined;
      if (!coll && handle) coll = collByHandle.get(String(handle).toLowerCase());
      if (!coll) return;
      const existing = recs.get(coll.id);
      // "auto" outranks "suggested" if the same collection shows up twice.
      if (existing && existing.source === "auto") return;
      recs.set(coll.id, {
        id: coll.id, title: coll.title, handle: coll.handle,
        smart: Boolean(coll.isAutomated), source, reason,
      });
    };

    const resolvePath = (path: string, source: "auto" | "suggested", reason: string, withAncestors: boolean) => {
      const node = nodeByPath.get(normalizeMenuPath(path));
      if (!node) return;
      addCollection(node.collectionId, node.collectionHandle || node.defaultCollectionHandle, source, reason);
      if (withAncestors) {
        let parent = node.parentKey ? byKey.get(node.parentKey) : undefined;
        const guard = new Set<string>();
        while (parent && !guard.has(parent.nodeKey)) {
          guard.add(parent.nodeKey);
          addCollection(parent.collectionId, parent.collectionHandle || parent.defaultCollectionHandle, source, `Parent category of "${node.label}"`);
          parent = parent.parentKey ? byKey.get(parent.parentKey) : undefined;
        }
      }
    };

    const baseReason = auto.barcodeLabel ? `Barcode → ${auto.barcodeLabel}` : "Barcode mapping";
    for (const p of auto.autoMappedPaths) resolvePath(p, "auto", `${baseReason}: ${p}`, true);
    for (const h of auto.directCollectionsToAssign) addCollection(null, h, "auto", baseReason);
    for (const p of auto.suggestedPaths) resolvePath(p, "suggested", `Suggested: ${p}`, false);
    for (const h of auto.suggestedDirectCollections) addCollection(null, h, "suggested", "Suggested by mapping rules");

    return NextResponse.json({
      barcodeLabel: auto.barcodeLabel,
      parserType: auto.parserType,
      mappingDecision: auto.mappingDecision,
      reviewReason: auto.reviewReason,
      recommendations: Array.from(recs.values()),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Collection suggest failed" }, { status: 500 });
  }
}
