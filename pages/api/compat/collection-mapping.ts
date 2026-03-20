import type { NextApiRequest, NextApiResponse } from "next";
import {
  GET as getCollectionMapping,
  POST as postCollectionMapping,
} from "@/app/api/shopify/collection-mapping/route";

type RouteHandler = (request: Request) => Promise<Response>;

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getRequestUrl(req: NextApiRequest) {
  const protocol = getHeaderValue(req.headers["x-forwarded-proto"]) || "http";
  const host = getHeaderValue(req.headers.host) || "localhost:3000";
  return new URL(req.url || "/api/compat/collection-mapping", `${protocol}://${host}`).toString();
}

function getRequestHeaders(req: NextApiRequest) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

function getRequestBody(req: NextApiRequest) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;
  if (req.body === undefined || req.body === null) return undefined;
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;

  const contentType = getHeaderValue(req.headers["content-type"]);
  if (contentType.includes("application/x-www-form-urlencoded") && typeof req.body === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
      params.set(key, String(value ?? ""));
    }
    return params.toString();
  }

  return JSON.stringify(req.body);
}

function getRouteHandler(method: string): RouteHandler | null {
  if (method === "GET") return getCollectionMapping as RouteHandler;
  if (method === "POST") return postCollectionMapping as RouteHandler;
  return null;
}

async function sendResponse(res: NextApiResponse, response: Response) {
  res.status(response.status);

  const responseHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = responseHeaders.getSetCookie?.();
  if (setCookies && setCookies.length > 0) {
    res.setHeader("Set-Cookie", setCookies);
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });

  const body = Buffer.from(await response.arrayBuffer());
  res.send(body.length > 0 ? body : undefined);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = String(req.method || "GET").toUpperCase();
  const routeHandler = getRouteHandler(method);
  if (!routeHandler) {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, error: `Method ${method} Not Allowed` });
    return;
  }

  try {
    const request = new Request(getRequestUrl(req), {
      method,
      headers: getRequestHeaders(req),
      body: getRequestBody(req),
    });
    const response = await routeHandler(request);
    await sendResponse(res, response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: message || "Collection mapping compat bridge failed." });
  }
}
