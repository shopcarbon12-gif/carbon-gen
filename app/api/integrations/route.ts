import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type IntegrationStatus = "online" | "offline";

type IntegrationRecord = {
  id: string;
  name: string;
  endpoint: string;
  settingsHref: string;
  status: IntegrationStatus;
  label: string;
};

type EndpointCache = {
  expiresAt: number;
  endpoints: string[];
};

let endpointCache: EndpointCache | null = null;

const ENDPOINT_CACHE_MS = 60_000;
const ENDPOINT_PROBE_TIMEOUT_MS = 4500;
const DEFAULT_INTEGRATION_ENDPOINTS = [
  "/api/health",
  "/api/dropbox/status",
  "/api/shopify/status",
  "/api/lightspeed/status",
];

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function endpointToName(endpoint: string) {
  if (endpoint === "/api/health") return "Core API";
  if (endpoint === "/api/lightspeed/status") return "Lightspeed API";

  const segments = endpoint
    .replace(/^\/api\//, "")
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "status");

  if (!segments.length) return "Integration";
  return segments.map((segment) => titleCase(segment)).join(" ");
}

function endpointToId(endpoint: string) {
  return endpoint.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function endpointToSettingsHref(endpoint: string) {
  if (endpoint === "/api/health") return "/settings#integration-core-api";

  const slug = endpoint
    .replace(/^\/api\//, "")
    .replace(/\/status$/, "")
    .replace(/[^a-z0-9/_-]/gi, "")
    .replace(/[\/_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug ? `/settings#integration-${slug}` : "/settings";
}

async function collectRouteFiles(dir: string, out: string[]) {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectRouteFiles(full, out);
        return;
      }
      if (entry.isFile() && entry.name === "route.ts") {
        out.push(full);
      }
    })
  );
}

async function discoverIntegrationEndpoints() {
  const now = Date.now();
  if (endpointCache && endpointCache.expiresAt > now) {
    return endpointCache.endpoints;
  }

  const apiRoot = path.join(process.cwd(), "app", "api");
  const routeFiles: string[] = [];
  await collectRouteFiles(apiRoot, routeFiles);

  const endpoints = new Set<string>();

  for (const filePath of routeFiles) {
    const rel = path.relative(apiRoot, filePath).replace(/\\/g, "/");
    if (rel === "health/route.ts" || rel.endsWith("/status/route.ts")) {
      endpoints.add(`/api/${rel.replace(/\/route\.ts$/, "")}`);
    }
  }

  const sorted = Array.from(endpoints).sort((a, b) => {
    if (a === "/api/health") return -1;
    if (b === "/api/health") return 1;
    return a.localeCompare(b);
  });

  const configured = String(process.env.INTEGRATION_ENDPOINTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.startsWith("/api/") ? value : `/api/${value.replace(/^\/+/, "")}`));

  const fallback = configured.length ? configured : DEFAULT_INTEGRATION_ENDPOINTS;
  const finalEndpoints = sorted.length ? sorted : fallback;

  endpointCache = {
    expiresAt: now + ENDPOINT_CACHE_MS,
    endpoints: finalEndpoints,
  };

  return finalEndpoints;
}

function inferStatus(responseOk: boolean, json: unknown): IntegrationStatus {
  if (json && typeof json === "object") {
    const payload = json as Record<string, unknown>;
    if (typeof payload.connected === "boolean") {
      return payload.connected ? "online" : "offline";
    }
    if (typeof payload.ok === "boolean") {
      return payload.ok ? "online" : "offline";
    }
    if (typeof payload.active === "boolean") {
      return payload.active ? "online" : "offline";
    }
    if (typeof payload.synced === "boolean") {
      return payload.synced ? "online" : "offline";
    }
  }

  return responseOk ? "online" : "offline";
}

function inferLabel(status: IntegrationStatus, json: unknown) {
  if (status === "offline") return "Offline";

  if (json && typeof json === "object") {
    const payload = json as Record<string, unknown>;
    if (payload.connected === true) return "Active";
    if (payload.synced === true) return "Synced";
    if (payload.ok === true) return "Synced";
  }

  return "Online";
}

function getProbeOrigins(req: NextRequest) {
  const requestOrigin = new URL(req.url).origin.replace(/\/+$/, "");
  const configuredInternal = String(process.env.INTERNAL_API_ORIGIN || "")
    .trim()
    .replace(/\/+$/, "");
  const defaultInternal =
    process.env.NODE_ENV === "production" ? "http://127.0.0.1:3000" : "";
  const origins = [configuredInternal || defaultInternal, requestOrigin].filter(Boolean);
  return Array.from(new Set(origins));
}

async function probeEndpoint(req: NextRequest, endpoint: string): Promise<IntegrationRecord> {
  const origins = getProbeOrigins(req);
  const cookie = req.headers.get("cookie") || "";

  let lastStatus: IntegrationStatus = "offline";
  let lastLabel = "Offline";
  let failedOrigins = 0;

  for (const origin of origins) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENDPOINT_PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(`${origin}${endpoint}`, {
        method: "GET",
        headers: cookie ? { cookie } : undefined,
        cache: "no-store",
        signal: controller.signal,
      });

      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }

      const status = inferStatus(response.ok, json);
      if (status === "online") {
        clearTimeout(timeout);
        return {
          id: endpointToId(endpoint),
          name: endpointToName(endpoint),
          endpoint,
          settingsHref: endpointToSettingsHref(endpoint),
          status,
          label: inferLabel(status, json),
        };
      }

      // If we reached here, it didn't error, but it returned offline payload
      lastStatus = status;
      lastLabel = inferLabel(status, json);
    } catch (e: any) {
      console.error(`[Integrations Probe] Failed to fetch ${endpoint} via ${origin}:`, e?.message || e);
      failedOrigins++;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    id: endpointToId(endpoint),
    name: endpointToName(endpoint),
    endpoint,
    settingsHref: endpointToSettingsHref(endpoint),
    status: lastStatus,
    label: lastLabel,
  };
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const endpoints = await discoverIntegrationEndpoints();
  const integrations = await Promise.all(endpoints.map((endpoint) => probeEndpoint(req, endpoint)));
  return NextResponse.json({ integrations });
}
