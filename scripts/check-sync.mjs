const LOCAL_BASE = process.env.SYNC_LOCAL_BASE || "http://localhost:3001";
const PUBLIC_BASE = process.env.SYNC_PUBLIC_BASE || "https://carbon-gen.shopcarbon.com";
const PATH = "/api/runtime-sync";

async function fetchSync(baseUrl) {
  const url = `${baseUrl}${PATH}`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${url} returned non-JSON payload (status ${resp.status}).`);
  }

  if (!resp.ok) {
    throw new Error(`${url} failed with status ${resp.status}: ${JSON.stringify(json)}`);
  }

  if (!json?.ok || typeof json?.fingerprint !== "string") {
    throw new Error(`${url} missing sync payload fields.`);
  }

  return {
    baseUrl,
    fingerprint: json.fingerprint,
    dashboardStudioSynced: Boolean(json.dashboardStudioSynced),
    files: Array.isArray(json.files) ? json.files : [],
  };
}

async function fetchSyncWithRetry(baseUrl, attempts = 20, delayMs = 1000) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchSync(baseUrl);
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error(`Failed to fetch sync payload from ${baseUrl}`);
}

async function main() {
  console.log("Checking runtime sync...");
  console.log(`Local:  ${LOCAL_BASE}${PATH}`);
  console.log(`Public: ${PUBLIC_BASE}${PATH}`);

  const [local, pub] = await Promise.all([
    fetchSyncWithRetry(LOCAL_BASE),
    fetchSyncWithRetry(PUBLIC_BASE),
  ]);

  console.log("\nLocal fingerprint: ", local.fingerprint);
  console.log("Public fingerprint:", pub.fingerprint);

  if (!local.dashboardStudioSynced) {
    throw new Error("Local check failed: dashboard/studio pages are not synced.");
  }
  if (!pub.dashboardStudioSynced) {
    throw new Error("Public check failed: dashboard/studio pages are not synced.");
  }

  if (local.fingerprint !== pub.fingerprint) {
    throw new Error("SYNC FAILED: localhost and public tunnel are serving different runtime fingerprints.");
  }

  console.log("\nSYNC OK");
  console.log("localhost and carbon-gen.shopcarbon.com are in sync.");
}

main().catch((err) => {
  console.error("\nSYNC CHECK FAILED");
  console.error(err?.message || err);
  process.exit(1);
});
