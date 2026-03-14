import fs from "node:fs";

const cfg = JSON.parse(fs.readFileSync(".coolify-deploy.local.json", "utf8"));
const token = String(cfg.watchApiToken || cfg.apiToken || cfg.deployApiToken || "").trim();
const base = "http://178.156.136.112:8000";
const id = "wcwcgcwoo8ggks8wwo84kwk0";

async function probe(path) {
  try {
    const res = await fetch(`${base}${path}`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const text = await res.text();
    console.log(`${path} => ${res.status} ${text.slice(0, 280).replace(/\n/g, " ")}`);
  } catch (error) {
    console.log(`${path} => ERR ${error instanceof Error ? error.message : String(error || "unknown error")}`);
  }
}

await probe(`/api/v1/deployments/${id}/logs`);
await probe(`/api/v1/deployments/${id}/log`);
await probe(`/api/v1/deployments/${id}/events`);
await probe(`/api/v1/deployments/${id}/output`);
await probe(`/api/v1/deployments?limit=5`);
