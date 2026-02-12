import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";

const API_VERSION =
  (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

async function probeShopToken(shop: string, token: string) {
  const query = `
    query ProbeShopConnection {
      shop {
        id
      }
    }
  `;

  try {
    const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false as const, status: resp.status, details: json?.errors || json };
    }
    if (Array.isArray(json?.errors) && json.errors.length) {
      return { ok: false as const, status: 400, details: json.errors };
    }
    if (!json?.data?.shop?.id) {
      return { ok: false as const, status: 400, details: "Missing shop payload." };
    }
    return { ok: true as const };
  } catch (e: any) {
    return {
      ok: false as const,
      status: 500,
      details: e?.message || "Connection probe failed.",
    };
  }
}

async function discoverAutoConnectedShop() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("shop,access_token,installed_at")
    .order("installed_at", { ascending: false })
    .limit(20);

  if (error || !Array.isArray(data) || !data.length) {
    return null;
  }

  for (const row of data) {
    const shop = normalizeShopDomain(String((row as any)?.shop || ""));
    const token = String((row as any)?.access_token || "").trim();
    if (!shop || !token) continue;

    const probe = await probeShopToken(shop, token);
    if (!probe.ok) continue;

    return {
      shop,
      installedAt: String((row as any)?.installed_at || "") || null,
    };
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawRequestedShop = String(searchParams.get("shop") || "").trim().toLowerCase();
  const requestedShop = normalizeShopDomain(rawRequestedShop) || "";
  if (rawRequestedShop && !requestedShop) {
    return NextResponse.json(
      { connected: false, shop: null, reason: "invalid_shop" },
      { status: 400 }
    );
  }
  const configuredShop = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "") || "";
  const shop = requestedShop || configuredShop;
  if (!shop) {
    const autoConnected = await discoverAutoConnectedShop();
    if (autoConnected?.shop) {
      return NextResponse.json({
        connected: true,
        shop: autoConnected.shop,
        installedAt: autoConnected.installedAt,
        source: "db_auto",
      });
    }
    return NextResponse.json({ connected: false, shop: null, reason: "missing_shop" });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token,installed_at")
    .eq("shop", shop)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ connected: false, shop });
  }

  const dbToken = String(data?.access_token || "").trim();
  const fallbackToken = getShopifyAdminToken(shop);
  const candidates: Array<{ token: string; source: "db" | "env_token" }> = [];

  if (dbToken) {
    candidates.push({ token: dbToken, source: "db" });
  }
  if (fallbackToken && fallbackToken !== dbToken) {
    candidates.push({ token: fallbackToken, source: "env_token" });
  }

  for (const candidate of candidates) {
    const probe = await probeShopToken(shop, candidate.token);
    if (probe.ok) {
      return NextResponse.json({
        connected: true,
        shop,
        installedAt: candidate.source === "db" ? data?.installed_at || null : null,
        source: candidate.source,
      });
    }
  }

  return NextResponse.json({
    connected: false,
    shop,
    source: candidates[0]?.source || null,
    reason: candidates.length ? "token_invalid" : "missing_token",
  });
}
