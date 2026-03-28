/** Expect __caRev 126+ after Coolify ships latest `app/accessibility/widget/route.ts`. */
const u =
  "https://app.shopcarbon.com/accessibility/widget?scope=default&wrev=126&_=" + Date.now();
const t = await fetch(u).then((r) => r.text());
const rev = (t.match(/__caRev=(\d+)/) || [])[1];
console.log("__caRev", rev, rev && Number(rev) >= 126 ? "(ok)" : "(still old build — redeploy / branch)");
console.log("docRoot.appendChild(wrap)", t.includes("docRoot.appendChild(wrap)"));
console.log("uses body filter for invert", t.includes("css.push('body{filter:'+invF"));
console.log("uses html filter for invert (old)", t.includes("css.push('html{filter:'+invF"));
