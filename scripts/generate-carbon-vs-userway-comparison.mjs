/**
 * Copies Carbon Assist + UserWay PDP screenshot folders into one place and writes REPORT.md.
 * Run from repo root: node scripts/generate-carbon-vs-userway-comparison.mjs
 */
import { mkdirSync, cpSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT = join(REPO, "reports", "carbon-vs-userway-comparison");
const CARBON_SRC = join(REPO, "reports", "a11y-widget-mcp-shopcarbon-full", "02-product");
const UW_SRC = join(REPO, "reports", "userway-shopcarbon-storefront", "02-product");
const C_REL = "carbon-pdp";
const U_REL = "userway-pdp";

mkdirSync(OUT, { recursive: true });
cpSync(CARBON_SRC, join(OUT, C_REL), { recursive: true });
cpSync(UW_SRC, join(OUT, U_REL), { recursive: true });

const cPng = readdirSync(join(OUT, C_REL)).filter((f) => f.endsWith(".png")).sort();
const uPng = readdirSync(join(OUT, U_REL)).filter((f) => f.endsWith(".png")).sort();

/** Paired comparisons: [title, carbonFile, userwayFile, notes] — userway may be null */
const PAIRS = [
  [
    "Baseline (widget off)",
    "00-baseline-closed.png",
    "00-baseline.png",
    "Carbon: before launcher. UserWay: before API use (both on same PDP).",
  ],
  [
    "Panel / menu open",
    "01-panel-open.png",
    "01-widget-open.png",
    "Carbon: shadow panel. UserWay: iframe menu.",
  ],
  [
    "Contrast — invert-style",
    "reading-contrast-invert.png",
    "reading-invert-contrast-base.png",
    "Carbon: `contrastMode: invert`. UserWay: `UserWay.contrastEnable()`.",
  ],
  [
    "Contrast — dark",
    "reading-contrast-dark.png",
    "reading-ui-contrast-step-2.png",
    "Carbon: explicit dark mode. UserWay: 2nd step of **Contrast +** UI cycle (approximate; not identical).",
  ],
  [
    "Contrast — light",
    "reading-contrast-light.png",
    "reading-ui-contrast-step-3.png",
    "Carbon: light chrome. UserWay: 3rd **Contrast +** step (approximate).",
  ],
  [
    "Contrast — smart",
    "reading-contrast-smart.png",
    "reading-smart-contrast.png",
    "Carbon: `contrastMode: smart`. UserWay: `enableSmartContrast()`.",
  ],
  [
    "Text larger",
    "reading-textscale-plus5.png",
    "reading-bigger-text.png",
    "Carbon: text scale +5 steps. UserWay: `bigTextEnable()`. Compare to each baseline in folder.",
  ],
  [
    "Readable / legible font",
    "motion-tile-readable-font.png",
    "reading-legible-fonts.png",
    "Carbon: `readableFont` tile. UserWay: `legibleFontsEnable()`.",
  ],
  [
    "Text spacing (single setting)",
    "reading-spacing-moderate.png",
    "reading-text-spacing.png",
    "Carbon: radio `textSpacing: moderate`. UserWay: `textSpacingEnable()` (cycles; not same granularity).",
  ],
  [
    "Line height (single setting)",
    "reading-line-relaxed.png",
    "reading-line-height.png",
    "Carbon: `lineHeight: relaxed`. UserWay: `lineHeightEnable()`.",
  ],
  [
    "Text align (single setting)",
    "reading-align-left.png",
    "reading-text-align.png",
    "Carbon: `textAlign: left`. UserWay: `textAlignEnable()`.",
  ],
  [
    "Saturation (single setting)",
    "reading-saturation-low.png",
    "reading-saturation.png",
    "Carbon: `saturation: low`. UserWay: `saturationEnable()` (cycles modes).",
  ],
  [
    "Dyslexia-friendly font",
    "profile-dyslexia.png",
    "reading-dyslexia-font.png",
    "Carbon: **profile** bundles spacing + font + align. UserWay: `dyslexiaFontEnable()` only.",
  ],
  [
    "Hide images",
    "motion-tile-hide-images.png",
    "reading-hide-images.png",
    "Carbon: `hideImages` tile. UserWay: `enableHideImages()`.",
  ],
  [
    "High contrast tile (Carbon)",
    "motion-tile-high-contrast.png",
    null,
    "Carbon exposes a dedicated **High contrast** switch. UserWay has no separate equivalent; contrast is via **Contrast +** / \`contrastEnable\` / smart contrast.",
  ],
  [
    "Highlight links",
    "motion-tile-highlight-links.png",
    "motion-highlight-links.png",
    "Carbon: `highlightLinks` tile. UserWay: `highlightEnable()`.",
  ],
  [
    "Pause animations",
    "motion-tile-pause-animations.png",
    "motion-pause-animations.png",
    "Carbon: `pauseAnimations`. UserWay: `stopAnimationEnable()`.",
  ],
  [
    "Big cursor",
    "motion-tile-big-cursor.png",
    "motion-big-cursor.png",
    "Carbon: `bigCursor` tile. UserWay: `bigCursorEnable()`.",
  ],
  [
    "Tooltips",
    "motion-tile-enhanced-tooltips.png",
    "motion-tooltips.png",
    "Carbon: custom overlay for `title`. UserWay: `tooltipsEnable()`.",
  ],
  [
    "Reading guide",
    "motion-tile-reading-guide.png",
    "motion-reading-guide.png",
    "Both: horizontal reading line.",
  ],
  [
    "Reading mask",
    "motion-tile-reading-mask.png",
    "motion-reading-mask.png",
    "Both: focus mask overlay.",
  ],
  [
    "Jump to headings",
    "nav-jump-headings.png",
    "nav-jump-structure-headers.png",
    "Carbon: `cmd-jump-headings`. UserWay: `pageStructureHeaders()`.",
  ],
  [
    "Jump to links",
    "nav-jump-links.png",
    "nav-jump-structure-links.png",
    "Carbon: `cmd-jump-links`. UserWay: `pageStructureLinks()`.",
  ],
];

function exists(dir, f) {
  try {
    return readdirSync(dir).includes(f);
  } catch {
    return false;
  }
}

function img(relDir, file) {
  if (!file) return "_n/a_";
  if (!exists(join(OUT, relDir), file)) return "*_(missing — re-run source reports)_*";
  return `![${file}](./${relDir}/${file})`;
}

let md = `# Carbon Assist vs UserWay — comparison (Shopify PDP)

**Generated:** ${new Date().toISOString()}  
**Page:** [Gyda product PDP](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72) — both widgets can load here.  
**Screenshot sources:** copied into this folder as \`${C_REL}/\` (Carbon full run) and \`${U_REL}/\` (UserWay run).

**MCP:** Images come from the same Playwright-based runs as MCP-style storefront tests; re-verify live in MCP on the Gyda PDP if needed.

## Method

1. **Carbon Assist** — automated via \`#carbon-a11y-widget\` shadow DOM (\`scripts/run-a11y-widget-storefront-report-full.mjs\`).  
2. **UserWay** — automated via \`window.UserWay\` + widget iframe (\`scripts/run-userway-storefront-report.mjs\`).  
3. Pairs below match **similar intent**, not pixel-identical behavior. UserWay often uses **cycle/toggle** APIs; Carbon uses **explicit radios** with more steps.

## Code references (implementation)

| Product | Where | What |
|---------|--------|------|
| **Carbon Assist** | \`app/accessibility/widget/route.ts\` | \`state.contrastMode\`, \`makeRadioGroup\` for text spacing / line height / align / saturation; \`makeTileAction\` for high contrast, readable font, pause animations, links, images, guide, mask, cursor, tooltips; \`cmd-jump-headings\` / \`cmd-jump-links\`. |
| **UserWay** | Host page \`window.UserWay\` | e.g. \`contrastEnable\`, \`enableSmartContrast\`, \`bigTextEnable\`, \`legibleFontsEnable\`, \`textSpacingEnable\`, \`lineHeightEnable\`, \`textAlignEnable\`, \`saturationEnable\`, \`dyslexiaFontEnable\`, \`enableHideImages\`, \`highlightEnable\`, \`stopAnimationEnable\`, \`bigCursorEnable\`, \`tooltipsEnable\`, \`readingGuideEnable\`, \`readingMaskEnable\`, \`pageStructureHeaders\`, \`pageStructureLinks\`, \`pageStructureLandmarks\`, \`resetAll\`. Listed in \`scripts/run-userway-storefront-report.mjs\` (\`UW_API_READING\`, \`UW_API_MOTION\`). |

## Not comparable (by design)

| Only in Carbon | Only in UserWay |
|----------------|-----------------|
| Named **quick presets** (Screen reader, Low vision, Motor, ADHD, Seizure safe) — see \`${C_REL}/profile-*.png\` | **Read page (TTS)** — \`${U_REL}/motion-read-page-tts.png\` |
| **Panel chrome** (plain light UI, oversized) — \`${C_REL}/chrome-*.png\` | **Inline dictionary** — \`${U_REL}/motion-inline-dictionary.png\` |
| Separate **contrast none / five explicit modes** + **high contrast tile** | **Landmarks** navigation — \`${U_REL}/nav-jump-structure-landmarks.png\` (Carbon has headings + links only) |
| **Contrast +** is not a single UserWay control; UW uses one **Contrast +** button cycling modes (\`${U_REL}/reading-ui-contrast-step-*.png\`) | |

---

## Side-by-side: similar features

`;

for (const [title, cf, uf, note] of PAIRS) {
  md += `### ${title}\n\n`;
  md += `| Carbon Assist | UserWay |\n|---------------|--------|\n`;
  md += `| ${img(C_REL, cf)} | ${img(U_REL, uf)} |\n\n`;
  md += `_${note}_\n\n---\n\n`;
}

md += `## UserWay-only navigation

| UserWay | Screenshot |
|---------|------------|
| Landmarks | ${img(U_REL, "nav-jump-structure-landmarks.png")} |

---

## Full gallery — Carbon Assist (all PDP screenshots)

`;

for (const f of cPng) {
  md += `### \`${f}\`\n\n${img(C_REL, f)}\n\n`;
}

md += `---

## Full gallery — UserWay (all PDP screenshots)

`;

for (const f of uPng) {
  md += `### \`${f}\`\n\n${img(U_REL, f)}\n\n`;
}

md += `---

## Regenerate assets

1. \`node scripts/run-a11y-widget-storefront-report-full.mjs\`  
2. \`node scripts/run-userway-storefront-report.mjs\`  
3. \`node scripts/generate-carbon-vs-userway-comparison.mjs\`

`;

writeFileSync(join(OUT, "REPORT.md"), md, "utf8");
console.log("Wrote", join(OUT, "REPORT.md"));
console.log("Carbon PNGs:", cPng.length, "UserWay PNGs:", uPng.length);
