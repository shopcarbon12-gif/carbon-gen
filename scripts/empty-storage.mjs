import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

function readEnvFile() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const text = fs.readFileSync(envPath, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const row = line.trim();
      if (!row || row.startsWith("#")) continue;
      const idx = row.indexOf("=");
      if (idx <= 0) continue;
      const key = row.slice(0, idx).trim();
      const value = row.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile();
function env(name) {
  return (process.env[name] || fileEnv[name] || "").trim();
}

function normalizeProvider() {
  const raw = env("IMAGE_STORAGE_PROVIDER").toLowerCase();
  if (raw === "r2") return "r2";
  if (raw === "supabase") return "supabase";
  return "auto";
}

function parsePrefixes() {
  const raw = env("EMPTY_STORAGE_PREFIXES");
  const fallback = ["models", "items", "final-results"];
  const list = raw
    ? raw
        .split(/[,\s]+/g)
        .map((v) => v.trim())
        .filter(Boolean)
    : fallback;
  return list.map((prefix) => prefix.replace(/^\/+/, "").replace(/\/+$/, ""));
}

function formatPrefixes(prefixes) {
  return prefixes.map((p) => (p ? `${p}/` : "")).join(", ");
}

async function runR2(prefixes) {
  const accountId = env("R2_ACCOUNT_ID");
  const bucket = env("R2_BUCKET");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 config. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY."
    );
  }
  const endpoint =
    env("R2_ENDPOINT") || `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const allKeys = [];
  for (const prefix of prefixes) {
    const normalized = prefix ? `${prefix}/` : "";
    let continuationToken;
    do {
      const resp = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalized || undefined,
          ContinuationToken: continuationToken,
        })
      );
      for (const entry of resp.Contents || []) {
        if (entry.Key) allKeys.push(entry.Key);
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  if (!allKeys.length) {
    console.log("No objects found to delete.");
    return;
  }

  const chunkSize = 1000;
  let deleted = 0;
  for (let i = 0; i < allKeys.length; i += chunkSize) {
    const chunk = allKeys.slice(i, i + chunkSize);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      })
    );
    deleted += chunk.length;
  }
  console.log(`Deleted ${deleted} object(s) from R2.`);
}

async function listSupabaseFiles(supabase, bucket, prefix) {
  const queue = [prefix || ""];
  const files = [];
  while (queue.length) {
    const current = queue.shift() || "";
    const { data, error } = await supabase.storage.from(bucket).list(current, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(error.message);
    for (const entry of data || []) {
      const childPath = `${current}/${entry.name}`.replace(/^\/+/, "");
      if (!entry.id) {
        queue.push(childPath);
      } else {
        files.push(childPath);
      }
    }
  }
  return files;
}

async function runSupabase(prefixes) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = env("SUPABASE_STORAGE_BUCKET_ITEMS");
  if (!url || !key || !bucket) {
    throw new Error(
      "Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET_ITEMS."
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const allFiles = [];
  for (const prefix of prefixes) {
    const listed = await listSupabaseFiles(supabase, bucket, prefix);
    allFiles.push(...listed);
  }

  const deduped = Array.from(new Set(allFiles));
  if (!deduped.length) {
    console.log("No objects found to delete.");
    return;
  }

  let deleted = 0;
  for (let i = 0; i < deduped.length; i += 1000) {
    const chunk = deduped.slice(i, i + 1000);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) throw new Error(error.message);
    deleted += chunk.length;
  }
  console.log(`Deleted ${deleted} object(s) from Supabase storage.`);
}

async function main() {
  const provider = normalizeProvider();
  const prefixes = parsePrefixes();
  console.log(`Storage cleanup starting. Prefixes: ${formatPrefixes(prefixes)}`);

  const hasR2 =
    Boolean(env("R2_ACCOUNT_ID")) &&
    Boolean(env("R2_BUCKET")) &&
    Boolean(env("R2_ACCESS_KEY_ID")) &&
    Boolean(env("R2_SECRET_ACCESS_KEY"));

  const useR2 = provider === "r2" || (provider === "auto" && hasR2);
  if (useR2) {
    await runR2(prefixes);
  } else {
    await runSupabase(prefixes);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
