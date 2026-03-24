# Getting 404 URLs (Beyond GSC's 2,000 Limit)

GSC limits each export to **~2,000 URLs**. To get more, use **Wayback Machine** (Archive.org) – it has historical URLs for your domain; many now return 404.

## Option A: Wayback Machine (Recommended – No GSC)

Archive.org has crawled shopcarbon.com over the years. We fetch unique URLs from their CDX API and probe which return 404.

```bash
# Fetch all Wayback URLs (prefix queries, ~10–30 min) then probe for 404s
npm run fetch:404-wayback

# Or step by step:
node scripts/fetch-404-urls-wayback.mjs --fetch-only   # saves wayback-urls-all.txt
node scripts/fetch-404-urls-wayback.mjs --probe-only   # probes & outputs wayback-404s.txt
```

Outputs:
- `tmp-404-report/wayback-urls-all.txt` – all unique URLs from Archive.org
- `tmp-404-report/wayback-404s.txt` – URLs that return 404
- `tmp-404-report/404-all-merged.txt` – merged with GSC data (if present)

Use `--slow` for gentler probing (avoid rate limits). Use `--limit 5000` to cap the fetch for testing.

---

## Why GSC is Limited

- **UI export**: Max ~2,000 rows per export
- **Search Console API**: Only Performance data (clicks/impressions), **not** Indexing/404 data
- **BigQuery bulk export**: Same – only Performance data, no Coverage/Indexing tables
- **Indexing API**: For submitting URLs, not for retrieving lists

**There is no API** for Indexing report data. The only way is multiple filtered exports from the UI.

---

## Method 1: Automated (Playwright)

```bash
# 1. Be logged into Google in your browser
# 2. Run – uses headed browser, applies each filter, scrapes table, saves batch
node scripts/export-gsc-404-batches.mjs

# Optional: if any section still hits 2000 cap, rerun with handle-prefix subdivision
node scripts/export-gsc-404-batches.mjs --prefix

# 3. Merge all batches
node scripts/merge-gsc-404-batches.mjs
```

Result: `tmp-404-report/gsc-404-all.txt`

---

## Method 2: Manual CSV Download + Merge

1. Open GSC → **Indexing** → **Pages** → **Not found (404)**
2. For each filter below, apply it, click **Download** (Export), save the CSV
3. Put all CSVs in `tmp-404-report/gsc-downloads/`
4. Run: `node scripts/gsc-download-and-merge.mjs`

### Filter list (apply one at a time, export each)

**Path filters:**
- ` /products/`
- ` /collections/`
- ` /pages/`
- ` /blogs/`
- ` /search`

**Locale filters:**
- ` /es/` ` /pt/` ` /de/` ` /fr/` ` /ar/` ` /he/` ` /it/` ` /ru/`
- ` /ja/` ` /ko/` ` /zh/` ` /hy/` ` /fil/` ` /az/` ` /be/` ` /am/` ` /as/`
- ` /bn/` ` /bs/` ` /eu/` ` /af/` ` /ak/` ` /ro/` ` /sq/` ` /nl/` ` /pl/` ` /tr/`

**If any single filter returns exactly 2000** (hitting the cap), subdivide by handle prefix, e.g.:
- ` /products/a` … ` /products/z` and ` /products/0` … ` /products/9`
- Same for ` /collections/a` … ` /collections/z`

---

## Output

- `tmp-404-report/gsc-404-all.txt` – deduplicated list, one URL per line
- Format: `404 https://shopcarbon.com/...`

## Next steps

- Generate redirects: `node scripts/check-gsc-redirects.mjs`
- Push to Shopify: `npm run push:shopify-redirects`
