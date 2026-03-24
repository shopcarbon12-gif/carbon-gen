# GSC noindex Investigation – 24 Mar 2026

## Summary

**Checked:** Shopify theme via Admin → Themes → Edit code → Search.

**Result:** No explicit `noindex` or `robots` meta tags were found anywhere in the theme files.

---

## What Was Checked

1. **Theme editor search** (Playwright MCP):
   - "noindex" → **0 results**
   - "robots" → **0 results**

2. **Theme:** Backup - Shopcarbon.com | January 2025 (ID: 146033770748)

3. **Dawn base theme:** The default Dawn `layout/theme.liquid` and `snippets/meta-tags.liquid` do not add noindex.

---

## Likely Sources of 106,762 noindex Pages

Because the theme itself does not add noindex, the URLs are likely coming from:

| Source | Description |
|--------|-------------|
| **SEO app** | Apps like "Plug in SEO" or "SEO King" can add noindex for filters, search, etc. |
| **Shopify platform** | Cart, checkout, account pages may get noindex from `content_for_header`. |
| **App extensions** | Theme app extensions can inject meta tags. |
| **Shopify Markets / locales** | Alternate-language URLs can be treated as noindex when using hreflang/canonical. |

---

## Add noindex for Search & Filters (manual steps)

1. **Add snippet:** In Shopify theme editor → `snippets` → Add new file `head-noindex.liquid` with:

```liquid
{%- comment -%} Noindex for search and collection filters {%- endcomment -%}
{%- if template.name == 'search' -%}
  <meta name="robots" content="noindex, follow">
{%- elsif template.name == 'collection' and request.path contains '?' -%}
  <meta name="robots" content="noindex, follow">
{%- endif -%}
```

2. **Include in theme.liquid:** In `layout/theme.liquid`, find the line `{{ content_for_header }}` and add **above** it:

```liquid
{% render 'head-noindex' %}
```

A copy of the snippet is in `shopify/snippets/head-noindex.liquid` – you can push it via `shopify theme push` if you have the CLI set up.

---

## Next Steps

1. **Check installed apps:**  
   Shopify Admin → Apps → look for SEO tools (e.g. Plug in SEO, SEO King, Booster) and review their noindex settings.

2. **Confirm URL types:**  
   In GSC, open the "Excluded by noindex tag" row and export the sample URLs to see patterns (e.g. `/search?q=`, `?filter.`, `/cart`, `/account`, locale paths).

3. **Theme pull (optional):**  
   Run `shopify theme pull --live --store 30e7d3` and locally search for `noindex`/`robots` in case the editor search missed files.
