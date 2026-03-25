/** Poll app.shopcarbon.com accessibility widget until __caRev matches and usage URL is not loopback. */
const u = "https://app.shopcarbon.com/accessibility/widget?config=%7B%7D";
const wantRev = process.argv[2] || "54";
const maxTries = Number(process.argv[3] || 14);
const delayMs = Number(process.argv[4] || 25000);

async function once() {
  const r = await fetch(u);
  const t = await r.text();
  const rev = (t.match(/__caRev=(\d+)/) || [])[1] || "";
  const bad = /usageEndpoint="https?:\/\/(0\.0\.0\.0|127\.0\.0\.1|localhost)/.test(t);
  return { rev, bad, ok: rev === wantRev && !bad };
}

for (let i = 0; i < maxTries; i++) {
  try {
    const x = await once();
    console.log("try", i, "rev", x.rev, "badLoopbackUsage", x.bad);
    if (x.ok) {
      console.log("PRODUCTION_OK");
      process.exit(0);
    }
  } catch (e) {
    console.log("try", i, "error", e.message);
  }
  if (i < maxTries - 1) await new Promise((r) => setTimeout(r, delayMs));
}
process.exit(1);
