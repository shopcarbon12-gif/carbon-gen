import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken, normalizeShopDomain, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

async function getTokenForShop(shop: string): Promise<string | null> {
  try {
    const dbToken = await getShopifyAccessToken(shop);
    if (dbToken) return dbToken;
  } catch { /* fallback */ }
  return getShopifyAdminToken(shop) || null;
}

const WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_CANCELLED", "ORDERS_FULFILLED"] as const;

type WebhookNode = {
  id: string;
  topic: string;
  callbackUrl: string | null;
  endpoint: {
    __typename: string;
    callbackUrl?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = normalizeText(body?.secret || req.nextUrl.searchParams.get("secret"));
    const cronSecret = normalizeText(process.env.CRON_SECRET);

    if (cronSecret && secret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const shop =
      normalizeShopDomain(normalizeText(body?.shop)) ||
      normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN)) ||
      "";
    if (!shop) {
      return NextResponse.json({ error: "shop is required" }, { status: 400 });
    }

    const token = await getTokenForShop(shop);
    if (!token) {
      return NextResponse.json({ error: "No Shopify token found" }, { status: 400 });
    }

    const apiVersion = normalizeText(process.env.SHOPIFY_API_VERSION) || "2025-01";
    const baseUrl = normalizeText(body?.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL);
    const protocol = baseUrl.startsWith("localhost") ? "http" : "https";
    const appUrl = baseUrl.startsWith("http") ? baseUrl : `${protocol}://${baseUrl}`;

    const existingResult = await runShopifyGraphql<{
      webhookSubscriptions: { edges: Array<{ node: WebhookNode }> };
    }>({
      shop,
      token,
      apiVersion,
      query: `{
        webhookSubscriptions(first: 50) {
          edges {
            node {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint { callbackUrl }
              }
            }
          }
        }
      }`,
    });

    const existing = existingResult.ok
      ? (existingResult.data?.webhookSubscriptions?.edges || []).map((e) => e.node)
      : [];

    const results: Array<{ topic: string; action: string; id?: string; error?: string }> = [];

    const topicToPath: Record<string, string> = {
      ORDERS_CREATE: "orders-create",
      ORDERS_CANCELLED: "orders-cancelled",
      ORDERS_FULFILLED: "orders-fulfilled",
    };

    for (const topic of WEBHOOK_TOPICS) {
      const path = topicToPath[topic] || topic.toLowerCase().replace(/_/g, "-");
      const callbackUrl = `${appUrl}/api/shopify/webhooks/${path}`;

      const alreadyRegistered = existing.find(
        (w) => w.topic === topic && w.endpoint?.callbackUrl === callbackUrl
      );

      if (alreadyRegistered) {
        results.push({ topic, action: "already_registered", id: alreadyRegistered.id });
        continue;
      }

      const staleWebhooks = existing.filter((w) => w.topic === topic);
      for (const stale of staleWebhooks) {
        await runShopifyGraphql({
          shop,
          token,
          apiVersion,
          query: `mutation($id: ID!) {
            webhookSubscriptionDelete(id: $id) {
              deletedWebhookSubscriptionId
              userErrors { field message }
            }
          }`,
          variables: { id: stale.id },
        });
      }

      const createResult = await runShopifyGraphql<{
        webhookSubscriptionCreate: {
          webhookSubscription: { id: string } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>({
        shop,
        token,
        apiVersion,
        query: `mutation($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id }
            userErrors { field message }
          }
        }`,
        variables: {
          topic,
          webhookSubscription: {
            callbackUrl,
            format: "JSON",
          },
        },
      });

      if (!createResult.ok) {
        results.push({ topic, action: "failed", error: JSON.stringify(createResult.errors) });
        continue;
      }

      const userErrors = createResult.data?.webhookSubscriptionCreate?.userErrors || [];
      if (userErrors.length > 0) {
        results.push({ topic, action: "failed", error: userErrors.map((e) => e.message).join(", ") });
        continue;
      }

      const newId = createResult.data?.webhookSubscriptionCreate?.webhookSubscription?.id;
      results.push({ topic, action: "created", id: newId || undefined });
    }

    return NextResponse.json({ ok: true, shop, results });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
