# Instagram widget parity checklist (Carbon + Meta)

Use when validating the Carbon Instagram widget against production. Compare layout and behavior in a **visible browser session** (e.g. Playwright MCP). Meta app setup: [instagram-meta-graph-api-setup.md](./instagram-meta-graph-api-setup.md) and [Meta for Developers](https://developers.facebook.com/apps/).

- [ ] Sources: account connection, filters, sorting
- [ ] Layout: column counts, gaps, responsive breakpoints
- [ ] Post: thumbnail aspect, carousel/reel/video badges
- [ ] Style: fonts, colors, card chrome (sharp squares per brand)
- [ ] Settings: widget title, lazy load, analytics hooks if any
- [ ] Hover: thumbnail hover / “Shop the look” or equivalent
- [ ] Navigation: horizontal scroll or arrows if design requires
- [ ] Performance: LCP-friendly images, no layout shift

Record screenshots and URLs when differences are found.
