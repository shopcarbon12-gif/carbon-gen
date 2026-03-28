const r = await fetch("https://shopcarbon.com/");
const t = await r.text();
const m = t.match(/https:\/\/app\.shopcarbon\.com\/accessibility\/widget[^"'>\s]*/);
console.log(m ? m[0] : "no script url match");
