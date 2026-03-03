export function getProbeOrigins(reqFallbackOrigin?: string): string[] {
    const candidates: string[] = [];

    const envOrigin = (process.env.INTERNAL_API_ORIGIN || "").trim().replace(/\/+$/, "");
    if (envOrigin) candidates.push(envOrigin);

    // In Next.js, NODE_ENV is usually 'production' when built/running standalone Docker.
    // Including loopback IPv4 explicitly to avoid IPv6 `fetch failed` bugs in Node.js 18+.
    if (process.env.NODE_ENV === "production" || process.env.NODE_ENV !== "development") {
        candidates.push(`http://127.0.0.1:${process.env.PORT || 3000}`);
        candidates.push(`http://0.0.0.0:${process.env.PORT || 3000}`);
        candidates.push(`http://localhost:${process.env.PORT || 3000}`);
        candidates.push(`http://[::1]:${process.env.PORT || 3000}`);
    } else {
        candidates.push(`http://127.0.0.1:${process.env.PORT || 3000}`);
        candidates.push(`http://0.0.0.0:${process.env.PORT || 3000}`);
        candidates.push(`http://localhost:${process.env.PORT || 3000}`);
        candidates.push(`http://[::1]:${process.env.PORT || 3000}`);
    }

    if (reqFallbackOrigin) {
        const fallback = reqFallbackOrigin.trim().replace(/\/+$/, "");
        if (fallback) candidates.push(fallback);
    }

    return Array.from(new Set(candidates));
}

export async function fetchInternalApi(
    pathWithQuery: string,
    options?: RequestInit,
    reqFallbackOrigin?: string
): Promise<Response> {
    const origins = getProbeOrigins(reqFallbackOrigin);
    const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;

    const errorDetails: string[] = [];
    let lastResponse: Response | null = null;
    const TIMEOUT_MS = 90000; // 90s timeout for large catalog fetches like Lightspeed

    for (const origin of origins) {
        const url = `${origin}${normalizedPath}`;
        const controller = new AbortController();
        const timeoutToken = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            // Pass the user's options but override signal to enforce timeout
            const res = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeoutToken);

            if (res.ok) {
                return res; // Stop on first success
            }

            // If not ok (e.g., 500 or 404), keep track but try next origin
            lastResponse = res;
            errorDetails.push(`[${url} => HTTP ${res.status}]`);
        } catch (err: any) {
            clearTimeout(timeoutToken);
            errorDetails.push(`[${url} => ${err?.message || String(err)}]`);
        }
    }

    // If all failed, return the last meaningful non-ok response.
    if (lastResponse) {
        return lastResponse;
    }

    // Otherwise throw the aggregated network exceptions encountered.
    throw new Error(`All internal fetch candidates failed: ${errorDetails.join(" | ")}`);
}
