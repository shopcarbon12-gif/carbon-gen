import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed, isCronAuthed } from "@/lib/auth";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import {
  listCartCatalogParents,
  upsertCartCatalogParents,
  type StagingParent,
} from "@/lib/shopifyCartStaging";
import { createShopifyProductFromCart } from "@/lib/shopifyCartProductCreate";
import { loadConfig } from "@/lib/shopifyCartConfig";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const API_VERSION =
  (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

function norm(v: unknown) {
  return String(v ?? "").trim();
}

async function getToken(shop: string): Promise<string | null> {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

function extractProductId(cartId: string): { productId: string; variantGid: string; format: "split" | "variant-only" | "unknown" } {
  const c = norm(cartId);
  if (!c) return { productId: "", variantGid: "", format: "unknown" };

  if (c.includes("~")) {
    const [pid, vid] = c.split("~");
    return {
      productId: pid,
      variantGid: `gid://shopify/ProductVariant/${vid}`,
      format: "split",
    };
  }
  if (c.startsWith("gid://shopify/ProductVariant/")) {
    return { productId: "", variantGid: c, format: "variant-only" };
  }
  return { productId: c, variantGid: "", format: "unknown" };
}

type ShopifyProduct = {
  id: string;
  title: string;
  status: string;
  variantCount: number;
};

async function fetchAllActiveShopifyProducts(
  shop: string,
  token: string
): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null as string | null;
  let page = 0;

  while (page < 50) {
    const afterClause: string = cursor ? `, after: "${cursor}"` : "";
    const res = await runShopifyGraphql<{
      products?: {
        edges?: Array<{
          node?: {
            id: string;
            title: string;
            status: string;
            totalVariants?: number;
          };
          cursor?: string;
        }>;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string };
      };
    }>({
      shop,
      token,
      query: `query {
        products(first: 50, query: "status:active"${afterClause}) {
          edges {
            node { id title status totalVariants }
            cursor
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: {},
      apiVersion: API_VERSION,
    });

    if (!res.ok) break;
    const edges = res.data?.products?.edges || [];
    for (const e of edges) {
      if (!e.node) continue;
      products.push({
        id: e.node.id,
        title: e.node.title,
        status: e.node.status,
        variantCount: e.node.totalVariants ?? 0,
      });
    }
    const pageInfo = res.data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor ?? null;
    if (!cursor) break;
    page++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return products;
}

async function resolveVariantProducts(
  shop: string,
  token: string,
  variantGids: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const BATCH = 50;

  for (let i = 0; i < variantGids.length; i += BATCH) {
    const chunk = variantGids.slice(i, i + BATCH);
    const gidList = chunk.map((g) => `"${g}"`).join(",");
    const res = await runShopifyGraphql<{
      nodes?: Array<{
        id?: string;
        product?: { id: string };
      } | null>;
    }>({
      shop,
      token,
      query: `query { nodes(ids: [${gidList}]) { ... on ProductVariant { id product { id } } } }`,
      variables: {},
      apiVersion: API_VERSION,
    });

    if (res.ok) {
      for (const node of res.data?.nodes || []) {
        if (node?.id && node?.product?.id) {
          result.set(node.id, node.product.id);
        }
      }
    }
    if (i + BATCH < variantGids.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req) && !isCronAuthed(req)) {
    const url = new URL(req.url);
    const secret = (process.env.CRON_SECRET || "").trim();
    if (!secret || url.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawShop = norm(searchParams.get("shop"));
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop)
      return NextResponse.json({ error: "Missing shop" }, { status: 400 });
    const token = await getToken(shop);
    if (!token)
      return NextResponse.json({ error: "No token" }, { status: 401 });

    const action = searchParams.get("action") || "analyze";

    const cart = await listCartCatalogParents(shop);
    const parents = cart.data;

    const variantOnlyGids = new Set<string>();
    for (const parent of parents) {
      for (const v of parent.variants) {
        const { format, variantGid } = extractProductId(v.cartId);
        if (format === "variant-only" && variantGid) {
          variantOnlyGids.add(variantGid);
        }
      }
    }

    let variantToProduct = new Map<string, string>();
    if (variantOnlyGids.size > 0) {
      console.log(`[reconcile] Resolving ${variantOnlyGids.size} variant-only GIDs...`);
      variantToProduct = await resolveVariantProducts(shop, token, [...variantOnlyGids]);
      console.log(`[reconcile] Resolved ${variantToProduct.size} variant→product mappings`);
    }

    const parentToProducts = new Map<string, Set<string>>();
    const productToParents = new Map<string, Set<string>>();

    for (const parent of parents) {
      const productGids = new Set<string>();
      for (const v of parent.variants) {
        const { productId, variantGid, format } = extractProductId(v.cartId);
        let resolvedGid = "";
        if (format === "split" && productId) {
          resolvedGid = `gid://shopify/Product/${productId}`;
        } else if (format === "variant-only" && variantGid) {
          resolvedGid = variantToProduct.get(variantGid) || "";
        }
        if (resolvedGid) productGids.add(resolvedGid);
      }
      parentToProducts.set(parent.id, productGids);
      for (const gid of productGids) {
        const existing = productToParents.get(gid) || new Set();
        existing.add(parent.id);
        productToParents.set(gid, existing);
      }
    }

    const uniqueShopifyProductGids = new Set<string>();
    for (const gids of parentToProducts.values()) {
      for (const gid of gids) uniqueShopifyProductGids.add(gid);
    }

    const sharedProducts: Array<{
      shopifyProductGid: string;
      cartParentIds: string[];
      cartParentTitles: string[];
    }> = [];
    for (const [gid, parentIds] of productToParents.entries()) {
      if (parentIds.size > 1) {
        const titles = [...parentIds].map(
          (id) => parents.find((p) => p.id === id)?.title || id
        );
        sharedProducts.push({
          shopifyProductGid: gid,
          cartParentIds: [...parentIds],
          cartParentTitles: titles,
        });
      }
    }

    const parentsWithoutProduct = parents.filter((p) => {
      const gids = parentToProducts.get(p.id);
      return !gids || gids.size === 0;
    });

    console.log(
      `[reconcile] ${parents.length} cart parents → ${uniqueShopifyProductGids.size} unique Shopify product GIDs, ${sharedProducts.length} shared, ${parentsWithoutProduct.length} unresolved`
    );

    if (action === "analyze") {
      const allActive = await fetchAllActiveShopifyProducts(shop, token);
      const shopifyGidSet = new Set(allActive.map((p) => p.id));

      const orphanShopify = allActive.filter(
        (p) => !uniqueShopifyProductGids.has(p.id)
      );
      const cartRefsNotActive: string[] = [];
      for (const gid of uniqueShopifyProductGids) {
        if (!shopifyGidSet.has(gid)) {
          cartRefsNotActive.push(gid);
        }
      }

      return NextResponse.json({
        ok: true,
        action: "analyze",
        cartParentCount: parents.length,
        uniqueShopifyProductsLinked: uniqueShopifyProductGids.size,
        activeShopifyProductCount: allActive.length,
        sharedProductCount: sharedProducts.length,
        orphanShopifyCount: orphanShopify.length,
        cartRefsNotActiveCount: cartRefsNotActive.length,
        parentsWithoutProductCount: parentsWithoutProduct.length,
        variantOnlyGidsResolved: variantToProduct.size,
        variantOnlyGidsTotal: variantOnlyGids.size,
        sharedProducts: sharedProducts.slice(0, 50),
        orphanShopify: orphanShopify.slice(0, 100).map((p) => ({
          id: p.id,
          title: p.title,
        })),
        cartRefsNotActive: cartRefsNotActive.slice(0, 50),
        parentsWithoutProduct: parentsWithoutProduct
          .slice(0, 50)
          .map((p) => ({ id: p.id, title: p.title })),
      });
    }

    if (action === "fix") {
      const allActive = await fetchAllActiveShopifyProducts(shop, token);

      const orphanShopify = allActive.filter(
        (p) => !uniqueShopifyProductGids.has(p.id)
      );

      const unlinkedTitles = new Map<string, StagingParent>();
      for (const p of parentsWithoutProduct) {
        unlinkedTitles.set(p.title.toLowerCase().trim(), p);
      }

      let linked = 0;
      const linkedPairs: Array<{ cartParent: string; shopifyProduct: string }> = [];
      let archived = 0;
      const archivedTitles: string[] = [];

      for (const orphan of orphanShopify) {
        const matchKey = orphan.title.toLowerCase().trim();
        const matchingParent = unlinkedTitles.get(matchKey);

        if (matchingParent) {
          const varRes = await runShopifyGraphql<{
            product?: {
              variants?: { nodes?: Array<{ id: string; sku?: string }> };
            };
          }>({
            shop,
            token,
            query: `query($id: ID!) {
              product(id: $id) {
                variants(first: 100) { nodes { id sku } }
              }
            }`,
            variables: { id: orphan.id },
            apiVersion: API_VERSION,
          });

          if (varRes.ok && varRes.data?.product?.variants?.nodes?.length) {
            const shopifyVariants = varRes.data.product.variants.nodes;
            const numericProduct = orphan.id.replace("gid://shopify/Product/", "");

            for (const cv of matchingParent.variants) {
              const matched = shopifyVariants.find(
                (sv) => sv.sku && norm(sv.sku).toLowerCase() === norm(cv.sku).toLowerCase()
              ) || shopifyVariants[0];
              if (matched) {
                const numericVariant = matched.id.replace("gid://shopify/ProductVariant/", "");
                cv.cartId = `${numericProduct}~${numericVariant}`;
              }
            }

            await upsertCartCatalogParents(shop, [matchingParent]);
            linked++;
            linkedPairs.push({
              cartParent: matchingParent.title,
              shopifyProduct: orphan.title,
            });
            unlinkedTitles.delete(matchKey);
          }
        } else {
          const archiveRes = await runShopifyGraphql<{
            productUpdate?: {
              product?: { id: string };
              userErrors?: Array<{ message: string }>;
            };
          }>({
            shop,
            token,
            query: `mutation($input: ProductInput!) {
              productUpdate(input: $input) {
                product { id }
                userErrors { message }
              }
            }`,
            variables: { input: { id: orphan.id, status: "ARCHIVED" } },
            apiVersion: API_VERSION,
          });
          if (archiveRes.ok) {
            archived++;
            archivedTitles.push(orphan.title);
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      let cartIdFixed = 0;
      for (const parent of parents) {
        let updated = false;
        for (const v of parent.variants) {
          const { format, variantGid } = extractProductId(v.cartId);
          if (format === "variant-only" && variantGid) {
            const productGid = variantToProduct.get(variantGid);
            if (productGid) {
              const numericProduct = productGid.replace("gid://shopify/Product/", "");
              const numericVariant = variantGid.replace("gid://shopify/ProductVariant/", "");
              v.cartId = `${numericProduct}~${numericVariant}`;
              updated = true;
            }
          }
        }
        if (updated) {
          await upsertCartCatalogParents(shop, [parent]);
          cartIdFixed++;
        }
      }

      const stillUnlinked = [...unlinkedTitles.values()].map((p) => ({
        id: p.id,
        title: p.title,
      }));

      return NextResponse.json({
        ok: true,
        action: "fix",
        orphansLinkedToCart: linked,
        linkedPairs,
        orphansArchived: archived,
        archivedTitles,
        cartIdFormatFixed: cartIdFixed,
        stillUnlinkedCount: stillUnlinked.length,
        stillUnlinked,
      });
    }

    if (action === "publish-all") {
      const restPubRes = await fetch(
        `https://${shop}/admin/api/${API_VERSION}/publications.json`,
        {
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        }
      );
      const restPubJson = (await restPubRes.json().catch(() => ({}))) as {
        publications?: Array<{ id: number; name: string }>;
      };
      const restPubs = restPubJson?.publications || [];

      const onlineStore = restPubs.find(
        (p: { id: number; name: string }) => /online store/i.test(p.name)
      );
      if (!onlineStore) {
        return NextResponse.json({
          ok: false,
          error: "Could not find Online Store publication via REST",
          publications: restPubs.map((p: { id: number; name: string }) => ({
            id: p.id,
            name: p.name,
          })),
        });
      }

      const publicationGid = `gid://shopify/Publication/${onlineStore.id}`;
      const allActive = await fetchAllActiveShopifyProducts(shop, token);

      let published = 0;
      let alreadyPublished = 0;
      let failed = 0;
      const errors: Array<{ title: string; error: string }> = [];

      for (const product of allActive) {
        const pubCheckRes = await runShopifyGraphql<{
          product?: {
            resourcePublicationsV2?: {
              nodes?: Array<{ publication?: { id: string } }>;
            };
          };
        }>({
          shop,
          token,
          query: `query($id: ID!) {
            product(id: $id) {
              resourcePublicationsV2(first: 20) {
                nodes { publication { id } }
              }
            }
          }`,
          variables: { id: product.id },
          apiVersion: API_VERSION,
        });

        const currentPubs =
          pubCheckRes.data?.product?.resourcePublicationsV2?.nodes || [];
        const isPublished = currentPubs.some(
          (n: { publication?: { id: string } }) =>
            n.publication?.id === publicationGid
        );

        if (isPublished) {
          alreadyPublished++;
          continue;
        }

        const pubMutRes = await runShopifyGraphql<{
          publishablePublish?: {
            userErrors?: Array<{ message: string }>;
          };
        }>({
          shop,
          token,
          query: `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              userErrors { message }
            }
          }`,
          variables: {
            id: product.id,
            input: [{ publicationId: publicationGid }],
          },
          apiVersion: API_VERSION,
        });

        const pubErrors =
          pubMutRes.data?.publishablePublish?.userErrors || [];
        if (pubMutRes.ok && pubErrors.length === 0) {
          published++;
        } else {
          failed++;
          errors.push({
            title: product.title,
            error: pubErrors.map((e: { message: string }) => e.message).join(", ") || "Unknown",
          });
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      return NextResponse.json({
        ok: true,
        action: "publish-all",
        totalActive: allActive.length,
        alreadyPublished,
        newlyPublished: published,
        failed,
        errors: errors.slice(0, 20),
        publicationId: publicationGid,
        publicationName: onlineStore.name,
      });
    }

    if (action === "create-missing") {
      const locRes = await runShopifyGraphql<{
        location?: { id: string };
      }>({
        shop,
        token,
        query: `query { location { id } }`,
        variables: {},
        apiVersion: API_VERSION,
      });
      let locationId = locRes.ok && locRes.data?.location?.id ? locRes.data.location.id : "";
      if (!locationId) {
        const fallbackRes = await runShopifyGraphql<{
          locations?: { nodes?: Array<{ id: string }> };
        }>({
          shop,
          token,
          query: `query { locations(first: 5) { nodes { id } } }`,
          variables: {},
          apiVersion: API_VERSION,
        });
        locationId = fallbackRes.ok && fallbackRes.data?.locations?.nodes?.[0]?.id
          ? fallbackRes.data.locations.nodes[0].id
          : "";
      }
      if (!locationId) {
        return NextResponse.json({
          ok: false,
          error: "Could not find Shopify location ID",
        });
      }

      const config = await loadConfig(shop);
      const cartConfig = {
        newProductMapping: (config?.newProductMapping as Record<string, unknown>) || {},
        newProductRules: (config?.newProductRules as Record<string, unknown>) || {},
      };

      let created = 0;
      const results: Array<{ title: string; status: string; productGid?: string; error?: string }> = [];

      for (const parent of parentsWithoutProduct) {
        try {
          const res = await createShopifyProductFromCart(
            shop,
            token,
            parent,
            cartConfig,
            locationId
          );
          if (res.ok && res.productGid && res.variantGids?.length) {
            const numericProduct = res.productGid.replace("gid://shopify/Product/", "");
            for (let i = 0; i < parent.variants.length; i++) {
              const vGid = res.variantGids[i];
              if (vGid) {
                const numericVariant = vGid.replace("gid://shopify/ProductVariant/", "");
                parent.variants[i].cartId = `${numericProduct}~${numericVariant}`;
              }
            }
            await upsertCartCatalogParents(shop, [parent]);
            created++;
            results.push({ title: parent.title, status: "created", productGid: res.productGid });
          } else {
            results.push({ title: parent.title, status: "failed", error: res.error });
          }
        } catch (e) {
          results.push({ title: parent.title, status: "error", error: String(e) });
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      return NextResponse.json({
        ok: true,
        action: "create-missing",
        attempted: parentsWithoutProduct.length,
        created,
        locationId,
        results,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
