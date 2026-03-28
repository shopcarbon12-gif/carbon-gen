const u = "https://cdn.userway.org/widgetapp/2026-03-20-13-54-16/widget_app_1774014856108.js";
const r = await fetch(u);
const t = await r.text();
console.log("len", t.length);
for (const pat of [
  /Dyslexia Friendly[^"']{0,80}/gi,
  /stopAnimation[^]{0,100}/gi,
  /"s15"[^]{0,80}/g,
  /dyslexia_font[^]{0,100}/gi,
]) {
  console.log("---", pat);
  let m;
  let n = 0;
  while ((m = pat.exec(t)) && n < 8) {
    console.log(m[0].replace(/\s+/g, " ").slice(0, 200));
    n++;
  }
}
