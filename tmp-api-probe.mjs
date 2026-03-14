const endpoints = [
  "http://localhost:3000/api/shopify/collection-mapping?page=1&pageSize=20&q=&sortField=title&sortDir=asc",
  "http://localhost:3000/api/shopify/collection-mapping?page=1&pageSize=20&q=&sortField=title&sortDir=asc&shop=30e7d3.myshopify.com",
];

for (const url of endpoints) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const line = {
      url,
      status: res.status,
      ok: json?.ok ?? null,
      shop: json?.shop ?? null,
      nodes: Array.isArray(json?.nodes) ? json.nodes.length : null,
      rows: Array.isArray(json?.rows) ? json.rows.length : null,
      error: json?.error ?? null,
      warning: json?.warning ?? null,
      bodyPreview: text.slice(0, 140),
    };
    console.log(JSON.stringify(line));
  } catch (error) {
    console.log(
      JSON.stringify({
        url,
        probeError: error instanceof Error ? error.message : String(error || "unknown error"),
      })
    );
  } finally {
    clearTimeout(timeout);
  }
}
