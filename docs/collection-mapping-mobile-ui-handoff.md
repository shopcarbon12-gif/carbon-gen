# Collection Mapping Mobile UI Handoff

## Scope (Hard Lock)
- Apply changes to mobile view only (`max-width: 900px`).
- Do not change desktop/wide behavior, layout, links, or interactions.
- This document reflects the source-of-truth prototype:
  - `docs/collection-mapping-ui-prototypes/04-mobile-idea-v2.html`
- Visual language is aligned with:
  - `tmp/stitch_collection_mapping_mobile/DESIGN.md` (from `D:\Downloads\stitch_collection_mapping_mobile.zip`)

## Source of Truth
- **Interaction + structure:** `04-mobile-idea-v2.html`
- **Look and feel tokens/philosophy:** extracted `DESIGN.md`
- If there is a conflict, keep prototype behavior from `04-mobile-idea-v2.html` and style it with DESIGN.md principles.

## Mobile Design System (From DESIGN.md)
- Theme: deep midnight surfaces with bright functional accents ("Kinetic Obsidian").
- Use layered surfaces, not strong divider lines, for separation.
- Typography: Inter, high contrast, compact labels, clear hierarchy.
- Touch targets: minimum `48px` for primary controls on mobile.
- Chips:
  - Success: green
  - Warning: amber/orange
  - Error: red
  - Info/new: blue/purple
- Prefer soft glow/gradients and subtle contrast shifts over hard borders.

## Required Mobile Layout

### 1) Header
- Left: hamburger.
- Center-left: Carbon mark + title `CARBON / COLLECTION MAPPING`.
- Right: refresh button.
- Settings is in menu/drawer flow, not as a top header shortcut.

### 2) KPI Horizontal Strip
- Horizontal pill filters:
  - All
  - Loaded
  - Needs Review
  - Ready to Push
  - Failed
  - Synced
- Active filter has clear selected state.
- Strip remains compact and scrollable on narrow widths.

### 3) Search + Actions
- Full-width search input.
- Search icon button and filters icon button next to search in mobile toolbar.
- Keep spacing tight and consistent with prototype.

### 4) Products Section Header
- Left label: `Products (X match · Page Y)`.
- Right: `Select all on page` checkbox.

### 5) Card List (Mobile Rows)
- Each card includes:
  - Left status accent rail.
  - Product image with overlay checkbox inside image area.
  - Top status pill (`Ready to Push`, `Needs Review`, `Synced`, etc.).
  - Product title and metadata (`UPC`, `SKU`, `Type`).
  - Chips (mapped/suggestions/synced/app committed).
  - Right-side two controls in separate containers:
    - Eye button container.
    - Triangle/chevron container.
- Chevron rotates in expanded state.

### 6) Expanded Row Details
- Expanded content includes:
  - Current -> Final mapping summary.
  - Delta (`+`/`-`) counts.
  - Suggestion applied block.
  - Row-level links/actions where applicable.

## Required Mobile Behaviors

### A) Queue Behavior from Thumbnail Checkbox
- On `ALL`:
  - Checking image checkbox sends row to `ready-push` and keeps it visible on `ALL`.
  - Unchecking removes row from `ready-push` and restores prior queue/status/chips.
- Keep fallback baseline restore logic to avoid stuck rows in `ready-push`.

### B) Suggestions UX
- Suggestions chip opens a suggestions modal.
- User can pick a path from list.
- Selected value appears in `Suggestion applied` area.

### C) Image Lightbox
- Tapping thumbnail opens image lightbox modal.
- Includes title and close button.

### D) Menu Sheet (Bottom Sheet)
- Trigger from final menu action.
- Includes:
  - Save / Cancel actions.
  - Tree list collapsed by default.
  - Unmapped section as a toggle button.
  - Unmapped list expands only when toggled.

### E) Commit + Pagination Dock
- Bottom dock includes:
  - `COMMIT CHANGES` main button with dropdown chevron.
  - Commit menu with safe + destructive actions.
  - Pager and `Per page` selector on one row.

## Implementation Notes for App Component
- Implement only in mobile branch/classes used by mapping screen (for example mobile-specific classes and media query blocks).
- Do not alter desktop JSX path.
- Preserve existing route targets and links.
- Preserve queue/filter logic used by non-mobile views.

## QA Checklist (Must Pass)
- Mobile screenshot visually matches prototype card density and control placement.
- Eye and chevron each render inside their own container.
- Image checkbox overlays thumbnail and is usable.
- `ALL` checkbox promote/demote behavior works as specified.
- Suggestions modal opens and writes selected suggestion to row.
- Image lightbox opens from thumbnail.
- Menu sheet opens with collapsed tree and toggleable unmapped list.
- Commit bar + pager + per-page appear in bottom dock and are usable.
- Desktop view unchanged.

