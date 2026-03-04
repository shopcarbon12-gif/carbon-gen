import net from "node:net";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

if (!url || !token) {
    console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN.");
    process.exit(1);
}

const baseUrl = url.replace(/\/+$/, "");

async function fetchQueue() {
    try {
        const resp = await fetch(`${baseUrl}/lpop/carbon:print:jobs`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await resp.json();
        if (!resp.ok) {
            console.error("Upstash Error:", json);
            return;
        }
        const val = json.result;
        if (!val) return;

        let job;
        try {
            job = JSON.parse(val);
        } catch {
            console.warn("Invalid job data:", val);
            return;
        }

        console.log(`[Job] Sending ZPL to ${job.ip}:${job.port}...`);
        await printZpl(job.ip, job.port, job.zpl);
        console.log(`[Job] Success.`);
    } catch (err) {
        console.error("Queue loop error:", err.message);
    }
}

function printZpl(ip, port, zpl) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: ip, port }, () => {
            socket.write(zpl, "utf8", () => socket.end());
        });
        socket.setTimeout(8000);
        socket.on("timeout", () => {
            socket.destroy();
            reject(new Error("Timeout"));
        });
        socket.on("error", (err) => reject(err));
        socket.on("close", (hadError) => {
            if (!hadError) resolve();
        });
    });
}

console.log("-----------------------------------------");
console.log(" Carbon Local Print Agent initialized! ");
console.log(" Routing cloud jobs -> Local Printer ");
console.log("---------------------------------------");
console.log("Polling Upstash Redis queue `carbon:print:jobs`...");

setInterval(fetchQueue, 3000);
fetchQueue();
