const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShopDomain(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return SHOP_DOMAIN_RE.test(normalized) ? normalized : null;
}

export function toProductGid(productId: string) {
  const trimmed = productId.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("gid://")) return trimmed;
  return `gid://shopify/Product/${trimmed}`;
}

export function getShopifyConfig(baseUrl: string) {
  return {
    clientId: (process.env.SHOPIFY_APP_CLIENT_ID || "").trim() || "missing-client-id",
    scopes:
      (process.env.SHOPIFY_SCOPES || "").trim() ||
      "read_products,write_products,write_files,read_locations,write_inventory",
    redirectUri:
      (process.env.SHOPIFY_REDIRECT_URI || "").trim() || `${baseUrl}/api/shopify/callback`,
    apiVersion: (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01",
  };
}

export function getShopifyAdminToken(shop: string) {
  const normalizedShop = normalizeShopDomain(shop) || "";
  const key = `SHOPIFY_ADMIN_TOKEN_${normalizedShop.replace(/[.-]/g, "_").toUpperCase()}`;
  const scoped = (process.env[key] || "").trim();
  if (scoped) return scoped;

  const global = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!global) return "";

  const configuredShop = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "") || "";
  if (configuredShop && normalizedShop && configuredShop !== normalizedShop) {
    return "";
  }
  return global;
}

export async function runShopifyGraphql<T>({
  shop,
  token,
  query,
  variables,
  apiVersion,
}: {
  shop: string;
  token: string;
  query: string;
  variables?: Record<string, unknown>;
  apiVersion: string;
}) {
  const url = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables: variables || {} }),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      errors: json?.errors || json,
      data: null as T | null,
    };
  }

  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    return {
      ok: false as const,
      status: 400,
      errors: json.errors,
      data: json?.data ?? null,
    };
  }

  return {
    ok: true as const,
    status: 200,
    errors: null,
    data: (json?.data ?? null) as T | null,
  };
}
