/**
 * UserWay-first comparison: each UserWay PDP screenshot → closest Carbon shot + UX note.
 * Output: reports/userway-vs-carbon-comparison/
 */
import { mkdirSync, cpSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT = join(REPO, "reports", "userway-vs-carbon-comparison");
const CARBON_SRC = join(REPO, "reports", "a11y-widget-mcp-shopcarbon-full", "02-product");
const UW_SRC = join(REPO, "reports", "userway-shopcarbon-storefront", "02-product");
const C_DIR = "carbon-pdp";
const U_DIR = "userway-pdp";

/** [userwayFile, carbonFile|null, title, similarityNote] — explicit order: every UW asset */
const UW_LED = [
  [
    "00-baseline.png",
    "00-baseline-closed.png",
    "Baseline (no widget changes yet)",
    "Same PDP before applying either tool. Carbon launcher may still be visible; states should match ‘clean’ intent.",
  ],
  [
    "01-widget-open.png",
    "01-panel-open.png",
    "Menu open",
    "UserWay: **iframe** menu. Carbon: **shadow DOM** panel. Different chrome, focus model, and density — similar *goal* (pick options), not same UX.",
  ],
  [
    "reading-ui-contrast-step-1.png",
    "reading-contrast-invert.png",
    "Contrast + — step 1 (UserWay cycle)",
    "UserWay **one button cycles** modes; step 1 is not guaranteed to equal Carbon **Invert**. Carbon sets an explicit `contrastMode` radio — predictable, labeled outcome.",
  ],
  [
    "reading-ui-contrast-step-2.png",
    "reading-contrast-dark.png",
    "Contrast + — step 2 vs Carbon dark",
    "Ordinal mapping only. UserWay’s 2nd mode ≠ Carbon **dark** unless their engine matches; **outcome can diverge** on the same DOM.",
  ],
  [
    "reading-ui-contrast-step-3.png",
    "reading-contrast-light.png",
    "Contrast + — step 3 vs Carbon light",
    "Same caveat: **cycle position** vs **named mode** — different mental model and possibly different filters/CSS.",
  ],
  [
    "reading-invert-contrast-base.png",
    "reading-contrast-invert.png",
    "UserWay `contrastEnable` vs Carbon invert",
    "Closest semantic pair. Still: vendor filter stack vs Carbon `contrastMode==='invert'` in `route.ts` — **not pixel-identical**.",
  ],
  [
    "reading-smart-contrast.png",
    "reading-contrast-smart.png",
    "Smart contrast",
    "Both target ‘smart’ contrast, but **implementation and triggers** differ (UserWay API vs Carbon `contrastMode: smart`).",
  ],
  [
    "reading-bigger-text.png",
    "reading-textscale-plus5.png",
    "Larger text",
    "Carbon: **discrete steps** (+5 in test). UserWay: **bigTextEnable** toggle/cycle — **different step sizes** and max scale.",
  ],
  [
    "reading-legible-fonts.png",
    "motion-tile-readable-font.png",
    "Legible / readable font",
    "Same idea (font swap). **Font choice and fallbacks** differ by product; verify readability on your theme for both.",
  ],
  [
    "reading-text-spacing.png",
    "reading-spacing-moderate.png",
    "Text spacing",
    "Carbon: **explicit** normal | moderate | heavy. UserWay: **textSpacingEnable** typically **cycles** — one PNG is one stop, not the full matrix.",
  ],
  [
    "reading-line-height.png",
    "reading-line-relaxed.png",
    "Line height",
    "Carbon: **normal | relaxed | loose** radios. UserWay: **cycles** through states — **not the same labels** per click.",
  ],
  [
    "reading-text-align.png",
    "reading-align-left.png",
    "Text alignment",
    "Carbon: **default | left | center | justify**. UserWay: **align cycle** — mapping uses **left** as one comparable stop.",
  ],
  [
    "reading-saturation.png",
    "reading-saturation-low.png",
    "Saturation",
    "Carbon: **normal | low | high | mono** as separate values. UserWay: **saturation cycle** — screenshot is one arbitrary stop vs Carbon **low**.",
  ],
  [
    "reading-dyslexia-font.png",
    "profile-dyslexia.png",
    "Dyslexia-friendly",
    "Carbon **preset** also changes spacing + line height + align. UserWay **dyslexiaFont** is narrower — **same label, different bundle**.",
  ],
  [
    "reading-hide-images.png",
    "motion-tile-hide-images.png",
    "Hide images",
    "Same feature intent. **How** images are hidden (selectors, lazy-load) can differ — check cart/gallery edge cases.",
  ],
  [
    "motion-highlight-links.png",
    "motion-tile-highlight-links.png",
    "Highlight links",
    "Both outline/emphasize links; **styles and persistence** may differ.",
  ],
  [
    "motion-pause-animations.png",
    "motion-tile-pause-animations.png",
    "Pause / stop animation",
    "Carbon `pauseAnimations` vs UserWay `stopAnimationEnable` — similar; **what counts as animation** is product-specific.",
  ],
  [
    "motion-big-cursor.png",
    "motion-tile-big-cursor.png",
    "Big cursor",
    "Both enlarge pointer; **cursor asset and hit area** differ.",
  ],
  [
    "motion-tooltips.png",
    "motion-tile-enhanced-tooltips.png",
    "Tooltips",
    "Carbon: **migrates `title`** to custom overlay. UserWay: vendor tooltip behavior — **coverage of `aria-label` / custom tooltips** differs.",
  ],
  [
    "motion-reading-guide.png",
    "motion-tile-reading-guide.png",
    "Reading guide",
    "Same pattern (horizontal line); **positioning and keyboard** behavior may differ.",
  ],
  [
    "motion-reading-mask.png",
    "motion-tile-reading-mask.png",
    "Reading mask",
    "Same idea; **mask geometry** and interaction differ.",
  ],
  [
    "motion-read-page-tts.png",
    null,
    "Read page (text-to-speech)",
    "**No Carbon equivalent** in the Assist widget. Carbon does not ship this as a built-in control — UserWay-only capability in this comparison.",
  ],
  [
    "motion-inline-dictionary.png",
    null,
    "Inline dictionary",
    "**No Carbon equivalent** — UserWay-only.",
  ],
  [
    "nav-jump-structure-headers.png",
    "nav-jump-headings.png",
    "Structure: headings",
    "Both jump to heading-like content. **Selector lists and focus targets** may differ (Carbon uses `h1–h6` + `[role=heading]`).",
  ],
  [
    "nav-jump-structure-landmarks.png",
    null,
    "Structure: landmarks",
    "**No dedicated Carbon control** in the shipped menu (headings + links only). Closest manual approach would be browser/SR landmarks, not a matching button.",
  ],
  [
    "nav-jump-structure-links.png",
    "nav-jump-links.png",
    "Structure: links",
    "Same intent (first/managed link focus). **Which link fires first** can differ by DOM order.",
  ],
  [
    "99-after-reset-close.png",
    "99-after-reset.png",
    "After reset (+ Carbon panel state)",
    "UserWay: **resetAll + widgetClose**. Carbon: **reset footer + clear preset** (panel may still be open in test). Compare **page** return to baseline, not panel chrome.",
  ],
];

function has(dir, f) {
  return f && existsSync(join(OUT, dir, f));
}

function imgCell(dir, file) {
  if (!file) return "**Carbon:** _no direct equivalent in Assist widget_";
  if (!has(dir, file)) return `**Carbon:** _missing file \`${file}\` — re-run Carbon full report_`;
  return `**Carbon:** ![${file}](./${C_DIR}/${file})`;
}

function uwImg(file) {
  if (!has(U_DIR, file)) return `**UserWay:** _missing \`${file}\`_`;
  return `**UserWay:** ![${file}](./${U_DIR}/${file})`;
}

mkdirSync(OUT, { recursive: true });
if (!existsSync(CARBON_SRC) || !existsSync(UW_SRC)) {
  console.error("Missing source folders. Run:");
  console.error("  node scripts/run-a11y-widget-storefront-report-full.mjs");
  console.error("  node scripts/run-userway-storefront-report.mjs");
  process.exit(1);
}
cpSync(CARBON_SRC, join(OUT, C_DIR), { recursive: true });
cpSync(UW_SRC, join(OUT, U_DIR), { recursive: true });

let md = `# UserWay → Carbon comparison (every UserWay feature)

**Generated:** ${new Date().toISOString()}  
**PDP:** [Gyda product](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72) (both widgets present in source runs).  
**Assets:** \`${U_DIR}/\` = UserWay shots, \`${C_DIR}/\` = Carbon Assist shots (copies).

## Why “similar feature ≠ same UX or outcome”

| Topic | UserWay | Carbon Assist |
|-------|---------|----------------|
| **Controls** | Many features are **toggles or cycles** (one control, multiple presses). | Mostly **explicit values** (radios, separate tiles) — **predictable state** from the label. |
| **Contrast** | **Contrast +** walks a vendor-defined sequence. | **Named modes**: none, dark, light, invert, smart (+ optional **high contrast** tile). |
| **Typography / layout** | **Enable** APIs often **advance** internal state. | **Spacing / line / align / saturation** each have **listed options**. |
| **Bundling** | Dyslexia = **font** focus. | **Dyslexia preset** bundles font + spacing + line + align. |
| **Extras** | **TTS**, **inline dictionary**, **landmarks** navigation. | **No** TTS/dictionary; **no** landmarks button (headings + links only). |
| **Delivery** | Third-party **iframe** + **window.UserWay** API. | First-party **shadow root** on host **#carbon-a11y-widget**. |

Screenshots show **one moment in time** on one theme; they **do not** prove WCAG conformance or identical remediation.

---

## Pairing table (UserWay file → closest Carbon)

`;

for (const [uwFile, cFile, title, note] of UW_LED) {
  md += `### ${title}\n\n`;
  md += `| UserWay (this feature) | Carbon Assist (closest) |\n|--------------------------|---------------------------|\n`;
  md += `| ${uwImg(uwFile)} | ${imgCell(C_DIR, cFile)} |\n\n`;
  md += `**Similar ≠ same:** ${note}\n\n---\n\n`;
}

const uwAll = readdirSync(join(OUT, U_DIR))
  .filter((f) => f.endsWith(".png"))
  .sort();
const covered = new Set(UW_LED.map((r) => r[0]));
const extra = uwAll.filter((f) => !covered.has(f));
if (extra.length) {
  md += `## Unmapped UserWay files (should be empty)\n\n`;
  for (const f of extra) md += `- \`${f}\`\n`;
  md += "\n";
}

md += `## Regenerate

\`\`\`bash
node scripts/run-a11y-widget-storefront-report-full.mjs
node scripts/run-userway-storefront-report.mjs
node scripts/generate-userway-vs-carbon-comparison.mjs
\`\`\`
`;

writeFileSync(join(OUT, "REPORT.md"), md, "utf8");
console.log("Wrote", join(OUT, "REPORT.md"), "UserWay rows:", UW_LED.length);
