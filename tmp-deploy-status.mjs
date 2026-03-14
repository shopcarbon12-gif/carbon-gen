import fs from "node:fs";

const state = JSON.parse(fs.readFileSync(".bridge/runtime/coolify-deploy-state.json", "utf8"));
const cfg = JSON.parse(fs.readFileSync(".coolify-deploy.local.json", "utf8"));
const apiBase = "http://178.156.136.112:8000";
const id = String(state.deploymentUuid || "").trim();
const token = String(cfg.watchApiToken || cfg.apiToken || cfg.deployApiToken || "").trim();

const res = await fetch(`${apiBase}/api/v1/deployments/${id}`, {
  headers: {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});
const txt = await res.text();
let payload = null;
try {
  payload = JSON.parse(txt);
} catch {
  payload = null;
}
const status =
  payload?.status ||
  payload?.deployment_status ||
  payload?.deployment?.status ||
  payload?.data?.status ||
  payload?.state ||
  "";

console.log(
  JSON.stringify(
    {
      httpStatus: res.status,
      deploymentUuid: id,
      status,
      deploymentUrl: payload?.deployment_url || "",
      createdAt: payload?.created_at || "",
      updatedAt: payload?.updated_at || "",
      finishedAt: payload?.finished_at || "",
      commit: payload?.commit || "",
      commitMessage: payload?.commit_message || "",
      payloadKeys: payload ? Object.keys(payload) : [],
      preview: String(txt || "").slice(0, 300),
    },
    null,
    2
  )
);
