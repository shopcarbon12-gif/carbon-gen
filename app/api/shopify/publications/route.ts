import { NextRequest, NextResponse } from "next/server";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
  getShopifyConfig,
} from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BLOCKED_CHANNELS = ["skuplugs", "skuplugs ‑ marketplace", "skuplugs - marketplace"];

interface PublicationNode {
  id: string;
  name: string;
  supportsFuturePublishing: boolean;
  app: { title: string } | null;
}

interface CatalogNode {
  id: string;
  title: string;
  status: string;
  publication: { id: string } | null;
}

interface ProductPublicationNode {
  publishDate: string | null;
  publication: { id: string };
}

const PUBLICATIONS_QUERY = `{
  publications(first: 50) {
    edges { node { id name supportsFuturePublishing app { title } } }
  }
}`;

const CATALOGS_QUERY = `{
  catalogs(first: 50) {
    edges { node { id title status publication { id } } }
  }
}`;

function buildProductPublicationsQuery(productGids: string[], catalogPubIds: string[] = []) {
  const fragments = productGids.map((gid, i) => {
    const alias = `p${i}`;
    const catChecks = catalogPubIds.map((cpid, ci) =>
      `cat${ci}: publishedOnPublication(publicationId: "${cpid}")`
    ).join("\n      ");
    return `${alias}: product(id: "${gid}") {
      id
      resourcePublicationsV2(first: 30) {
        edges { node { publishDate publication { id } } }
      }
      ${catChecks}
    }`;
  });
  return `{ ${fragments.join("\n")} }`;
}

async function getBlockedPublicationIds(shop: string, token: string, apiVersion: string): Promise<Set<string>> {
  const res = await runShopifyGraphql<{ publications: { edges: { node: PublicationNode }[] } }>({
    shop, token, query: PUBLICATIONS_QUERY, apiVersion,
  });
  const ids = new Set<string>();
  if (res.ok && res.data?.publications) {
    for (const edge of res.data.publications.edges) {
      const n = edge.node;
      if (BLOCKED_CHANNELS.some((h) => n.name.toLowerCase().includes(h) || n.app?.title?.toLowerCase().includes(h))) {
        ids.add(n.id);
      }
    }
  }
  return ids;
}

async function getToken(shop: string): Promise<string | null> {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  const envToken = getShopifyAdminToken(shop);
  return envToken || null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawShop = String(searchParams.get("shop") || "").trim();
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop)
      return NextResponse.json(
        { ok: false, error: "Missing or invalid shop." },
        { status: 400 },
      );

    const token = await getToken(shop);
    if (!token)
      return NextResponse.json(
        { ok: false, error: "Shop not connected." },
        { status: 401 },
      );

    const { apiVersion } = getShopifyConfig(
      new URL(req.url).origin,
    );

    const [pubRes, catRes] = await Promise.all([
      runShopifyGraphql<{
        publications: { edges: { node: PublicationNode }[] };
      }>({ shop, token, query: PUBLICATIONS_QUERY, apiVersion }),
      runShopifyGraphql<{
        catalogs: { edges: { node: CatalogNode }[] };
      }>({ shop, token, query: CATALOGS_QUERY, apiVersion }),
    ]);

      const allPublications = pubRes.ok && pubRes.data?.publications
      ? pubRes.data.publications.edges.map((e) => e.node)
      : [];
    const publications = allPublications.filter(
      (p) => !BLOCKED_CHANNELS.some((h) => p.name.toLowerCase().includes(h) || p.app?.title?.toLowerCase().includes(h))
    );

    const catalogs =
      catRes.ok && catRes.data?.catalogs
        ? catRes.data.catalogs.edges.map((e) => ({
            id: e.node.id,
            title: e.node.title,
            status: e.node.status,
            publicationId: e.node.publication?.id || null,
          }))
        : [];

    return NextResponse.json({ ok: true, publications, catalogs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const rawShop = String(body.shop || "").trim();
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop)
      return NextResponse.json(
        { ok: false, error: "Missing or invalid shop." },
        { status: 400 },
      );

    const token = await getToken(shop);
    if (!token)
      return NextResponse.json(
        { ok: false, error: "Shop not connected." },
        { status: 401 },
      );

    const { apiVersion } = getShopifyConfig(new URL(req.url).origin);

    if (action === "get-product-publications") {
      const productGids: string[] = Array.isArray(body.productGids)
        ? body.productGids.slice(0, 50)
        : [];
      const catalogPubIds: string[] = Array.isArray(body.catalogPubIds)
        ? body.catalogPubIds
        : [];
      if (!productGids.length)
        return NextResponse.json({ ok: true, products: {} });

      const query = buildProductPublicationsQuery(productGids, catalogPubIds);
      const res = await runShopifyGraphql<Record<string, Record<string, unknown>>>({
        shop, token, query, apiVersion,
      });

      if (!res.ok)
        return NextResponse.json(
          { ok: false, error: "Failed to fetch product publications", errors: res.errors },
          { status: 500 },
        );

      const products: Record<string, string[]> = {};
      if (res.data) {
        for (const val of Object.values(res.data)) {
          if (!val?.id) continue;
          const pubIds: string[] = [];
          const rpv2 = val.resourcePublicationsV2 as { edges: { node: ProductPublicationNode }[] } | undefined;
          if (rpv2) {
            for (const edge of rpv2.edges) pubIds.push(edge.node.publication.id);
          }
          for (let ci = 0; ci < catalogPubIds.length; ci++) {
            if (val[`cat${ci}`] === true && !pubIds.includes(catalogPubIds[ci])) {
              pubIds.push(catalogPubIds[ci]);
            }
          }
          products[val.id as string] = pubIds;
        }
      }
      return NextResponse.json({ ok: true, products });
    }

    if (action === "set-product-publications") {
      const productGid = String(body.productGid || "").trim();
      const publishTo: string[] = Array.isArray(body.publishTo) ? body.publishTo : [];
      const unpublishFrom: string[] = Array.isArray(body.unpublishFrom) ? body.unpublishFrom : [];

      if (!productGid)
        return NextResponse.json(
          { ok: false, error: "Missing productGid." },
          { status: 400 },
        );

      const results: { published: number; unpublished: number; errors: string[] } = {
        published: 0,
        unpublished: 0,
        errors: [],
      };

      if (publishTo.length > 0) {
        const pubMutation = `mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }`;
        const pubInput = publishTo.map((pid) => ({ publicationId: pid }));
        const pubRes = await runShopifyGraphql<{
          publishablePublish: { userErrors: { field: string[]; message: string }[] };
        }>({
          shop,
          token,
          query: pubMutation,
          variables: { id: productGid, input: pubInput },
          apiVersion,
        });
        if (pubRes.ok && pubRes.data?.publishablePublish) {
          const ue = pubRes.data.publishablePublish.userErrors;
          if (ue.length > 0) results.errors.push(...ue.map((e) => e.message));
          else results.published = publishTo.length;
        } else {
          results.errors.push("publishablePublish call failed");
        }
      }

      if (unpublishFrom.length > 0) {
        const unpubMutation = `mutation UnpublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishableUnpublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }`;
        const unpubInput = unpublishFrom.map((pid) => ({ publicationId: pid }));
        const unpubRes = await runShopifyGraphql<{
          publishableUnpublish: { userErrors: { field: string[]; message: string }[] };
        }>({
          shop,
          token,
          query: unpubMutation,
          variables: { id: productGid, input: unpubInput },
          apiVersion,
        });
        if (unpubRes.ok && unpubRes.data?.publishableUnpublish) {
          const ue = unpubRes.data.publishableUnpublish.userErrors;
          if (ue.length > 0) results.errors.push(...ue.map((e) => e.message));
          else results.unpublished = unpublishFrom.length;
        } else {
          results.errors.push("publishableUnpublish call failed");
        }
      }

      return NextResponse.json({ ok: results.errors.length === 0, ...results });
    }

    if (action === "bulk-set-publications") {
      const parentIds: string[] = Array.isArray(body.parentIds) ? body.parentIds : [];
      const blockedPubIds = await getBlockedPublicationIds(shop, token, apiVersion);
      const publishTo: string[] = (Array.isArray(body.publishTo) ? body.publishTo : []).filter((id: string) => !blockedPubIds.has(id));
      const unpublishFrom: string[] = (Array.isArray(body.unpublishFrom) ? body.unpublishFrom : []).filter((id: string) => !blockedPubIds.has(id));

      if (parentIds.length === 0)
        return NextResponse.json({ ok: false, error: "parentIds[] required." }, { status: 400 });

      const { sqlQuery, ensureSqlReady } = await import("@/lib/sqlDb");
      await ensureSqlReady();
      const PAGE = 500;
      const allProductGids = new Set<string>();

      for (let offset = 0; offset < parentIds.length; offset += PAGE) {
        const batch = parentIds.slice(offset, offset + PAGE);
        const placeholders = batch.map((_, idx) => `$${idx + 2}`).join(", ");
        const dbRows = await sqlQuery<{ variants: unknown }>(
          `SELECT variants FROM shopify_cart_inventory_staging
           WHERE shop = $1 AND parent_id IN (${placeholders})`,
          [shop, ...batch]
        );

        for (const row of dbRows) {
          const rawVariants = typeof row.variants === "string" ? JSON.parse(row.variants) : row.variants;
          const variants = Array.isArray(rawVariants) ? rawVariants : [];
          for (const v of variants) {
            const cid = String((v as Record<string, unknown>).cartId || "").trim();
            if (!cid) continue;
            if (cid.includes("~")) {
              allProductGids.add(`gid://shopify/Product/${cid.split("~")[0]}`);
            }
          }
        }
      }

      const gids = Array.from(allProductGids);
      if (gids.length === 0)
        return NextResponse.json({ ok: true, updated: 0, message: "No linked Shopify products found." });

      console.log("[bulk-set-publications]", {
        totalProducts: gids.length,
        publishToCount: publishTo.length,
        unpublishFromCount: unpublishFrom.length,
        publishTo,
        unpublishFrom,
      });

      let published = 0;
      let unpublished = 0;
      const errors: string[] = [];
      const BATCH = 25;

      const pubInputLiteral = publishTo.map((pid) => `{ publicationId: "${pid}" }`).join(", ");
      const unpubInputLiteral = unpublishFrom.map((pid) => `{ publicationId: "${pid}" }`).join(", ");

      for (let i = 0; i < gids.length; i += BATCH) {
        const batch = gids.slice(i, i + BATCH);

        if (publishTo.length > 0) {
          const aliases = batch.map((gid, idx) =>
            `p${idx}: publishablePublish(id: "${gid}", input: [${pubInputLiteral}]) { userErrors { message } }`
          );
          const mutation = `mutation BulkPub { ${aliases.join("\n")} }`;
          const res = await runShopifyGraphql<Record<string, { userErrors: { message: string }[] }>>({
            shop, token, query: mutation, apiVersion,
          });
          if (res.ok && res.data) {
            for (const val of Object.values(res.data)) {
              if (val?.userErrors?.length === 0) published++;
              else if (val?.userErrors?.length) {
                const msgs = val.userErrors.map((e) => e.message);
                if (!msgs.every((m) => m.includes("already"))) {
                  console.log(`[bulk-set-publications] publish errors:`, msgs);
                  errors.push(...msgs);
                }
              }
            }
          } else {
            console.log(`[bulk-set-publications] publish batch failed:`, res.errors);
            errors.push(`publishablePublish batch failed at offset ${i}`);
          }
        }

        if (unpublishFrom.length > 0) {
          const aliases = batch.map((gid, idx) =>
            `u${idx}: publishableUnpublish(id: "${gid}", input: [${unpubInputLiteral}]) { userErrors { message } }`
          );
          const mutation = `mutation BulkUnpub { ${aliases.join("\n")} }`;
          const res = await runShopifyGraphql<Record<string, { userErrors: { message: string }[] }>>({
            shop, token, query: mutation, apiVersion,
          });
          if (res.ok && res.data) {
            for (const val of Object.values(res.data)) {
              if (val?.userErrors?.length === 0) unpublished++;
              else if (val?.userErrors?.length) {
                const msgs = val.userErrors.map((e) => e.message);
                if (!msgs.every((m) => m.includes("already"))) {
                  console.log(`[bulk-set-publications] unpublish errors:`, msgs);
                  errors.push(...msgs);
                }
              }
            }
          } else {
            console.log(`[bulk-set-publications] unpublish batch failed:`, res.errors);
            errors.push(`publishableUnpublish batch failed at offset ${i}`);
          }
        }
      }

      const uniqueErrors = Array.from(new Set(errors)).slice(0, 20);
      console.log("[bulk-set-publications] result:", { published, unpublished, errors: uniqueErrors.length, totalProducts: gids.length });
      return NextResponse.json({
        ok: uniqueErrors.length === 0,
        updated: published + unpublished,
        published,
        unpublished,
        totalProducts: gids.length,
        publishedToIds: publishTo,
        unpublishedFromIds: unpublishFrom,
        errors: uniqueErrors,
      });
    }

    if (action === "remove-channel") {
      const channelName = String(body.channelName || "").trim().toLowerCase();
      if (!channelName)
        return NextResponse.json({ ok: false, error: "channelName required." }, { status: 400 });

      const pubRes = await runShopifyGraphql<{
        publications: { edges: { node: PublicationNode }[] };
      }>({ shop, token, query: PUBLICATIONS_QUERY, apiVersion });

      if (!pubRes.ok || !pubRes.data?.publications)
        return NextResponse.json({ ok: false, error: "Failed to fetch publications." }, { status: 500 });

      const target = pubRes.data.publications.edges
        .map((e) => e.node)
        .find((p) => p.name.toLowerCase().includes(channelName) || p.app?.title?.toLowerCase().includes(channelName));

      if (!target)
        return NextResponse.json({ ok: false, error: `Channel "${channelName}" not found.` }, { status: 404 });

      console.log(`[remove-channel] Found channel: "${target.name}" (${target.id}), app: ${target.app?.title}`);

      const ALL_PRODUCTS_QUERY = `query AllProducts($cursor: String) {
        products(first: 250, after: $cursor) {
          edges { node { id } }
          pageInfo { hasNextPage endCursor }
        }
      }`;

      interface ProductsPage {
        products: { edges: { node: { id: string } }[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
      }
      const allGids: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 20; page++) {
        const vars: Record<string, unknown> = { cursor };
        const pRes = await runShopifyGraphql<ProductsPage>({ shop, token, query: ALL_PRODUCTS_QUERY, variables: vars, apiVersion });
        if (!pRes.ok || !pRes.data?.products) break;
        for (const edge of pRes.data.products.edges) allGids.push(edge.node.id);
        if (!pRes.data.products.pageInfo.hasNextPage) break;
        cursor = pRes.data.products.pageInfo.endCursor;
      }

      console.log(`[remove-channel] Found ${allGids.length} products to unpublish from "${target.name}"`);

      let unpublished = 0;
      const errors: string[] = [];
      const BATCH = 25;
      const unpubLiteral = `{ publicationId: "${target.id}" }`;

      for (let i = 0; i < allGids.length; i += BATCH) {
        const batch = allGids.slice(i, i + BATCH);
        const aliases = batch.map((gid, idx) =>
          `u${idx}: publishableUnpublish(id: "${gid}", input: [${unpubLiteral}]) { userErrors { message } }`
        );
        const mutation = `mutation RemoveChannel { ${aliases.join("\n")} }`;
        const res = await runShopifyGraphql<Record<string, { userErrors: { message: string }[] }>>({
          shop, token, query: mutation, apiVersion,
        });
        if (res.ok && res.data) {
          for (const val of Object.values(res.data)) {
            if (val?.userErrors?.length === 0) unpublished++;
          }
        } else {
          errors.push(`Batch at offset ${i} failed`);
        }
      }

      let appDeleted = false;
      let appDeleteError = "";
      try {
        const appInstQuery = `{
          appInstallations(first: 50) {
            edges { node { id app { title handle } } }
          }
        }`;
        const appRes = await runShopifyGraphql<{
          appInstallations: { edges: { node: { id: string; app: { title: string; handle: string } } }[] };
        }>({ shop, token, query: appInstQuery, apiVersion });

        if (appRes.ok && appRes.data?.appInstallations) {
          const appInst = appRes.data.appInstallations.edges
            .map((e) => e.node)
            .find((n) => n.app.title.toLowerCase().includes(channelName) || n.app.handle.toLowerCase().includes(channelName));

          if (appInst) {
            console.log(`[remove-channel] Found app installation: "${appInst.app.title}" (${appInst.id}), attempting delete...`);
            const delRes = await runShopifyGraphql<{
              appInstallationDelete: { userErrors: { message: string }[] } | null;
            }>({
              shop, token, apiVersion,
              query: `mutation { appInstallationDelete(id: "${appInst.id}") { userErrors { message } } }`,
            });
            if (delRes.ok && delRes.data?.appInstallationDelete?.userErrors?.length === 0) {
              appDeleted = true;
            } else {
              appDeleteError = JSON.stringify(delRes.errors || delRes.data?.appInstallationDelete?.userErrors || "unknown");
            }
          } else {
            appDeleteError = "App installation not found (may already be uninstalled)";
          }
        }
      } catch (err) {
        appDeleteError = err instanceof Error ? err.message : String(err);
      }

      console.log(`[remove-channel] Done. Unpublished: ${unpublished}/${allGids.length}, appDeleted: ${appDeleted}`);
      return NextResponse.json({
        ok: errors.length === 0,
        channel: { name: target.name, id: target.id, app: target.app?.title },
        totalProducts: allGids.length,
        unpublished,
        appDeleted,
        appDeleteError: appDeleteError || null,
        errors: errors.slice(0, 20),
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
