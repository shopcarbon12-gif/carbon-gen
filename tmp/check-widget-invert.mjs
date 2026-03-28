const u = "https://app.shopcarbon.com/accessibility/widget?scope=default&wrev=126";
const t = await fetch(u).then((r) => r.text());
console.log("len", t.length);
console.log("body{filter:", t.includes("body{filter:"));
console.log("html{filter:invert", t.includes("html{filter:invert"));
const needle = "contrastMode==='invert'";
const i = t.indexOf(needle);
console.log("idx", i);
if (i >= 0) console.log(t.slice(i, i + 600));
