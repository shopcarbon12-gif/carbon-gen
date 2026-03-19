# Recovery Status - cursor_needs_review_filter_behavior_mod1

Scope source: `C:/Users/Elior/Desktop/cursor_needs_review_filter_behavior_mod1.md`

## Rules
- No deploy during recovery.
- Restore by final requested behavior in that conversation timeline.
- Verify each item by code + localhost behavior.

## Status Key
- `TODO` = missing
- `PARTIAL` = exists but not fully matching final request
- `DONE` = restored and verified

## Checklist

### KPI / Filter
- [x] DONE Needs Review KPI union (NR OR Suggestions OR Manual Changes)
- [x] DONE Needs Review queue logic excludes legacy
- [x] DONE Synced strict complete-only logic and count
- [x] DONE Default tab on load is `all`
- [x] DONE Queue filter row removed from UI
- [x] DONE Grouped header row removed from UI
- [x] DONE Label filter removed from UI/logic

### Commit Menu
- [x] DONE Remove action is selected-only wording + behavior
- [x] DONE Push selected disabled when 0 selected
- [x] DONE Push buttons final style (green text only, white subtext)
- [x] DONE Hidden summary strip removed

### Table / Columns
- [x] DONE Eye column added between checkbox and picture
- [x] DONE Picture frozen with checkbox/eye/product name
- [x] DONE Auto-Mapped Menus -> Auto Path (chip + tooltip)
- [x] DONE Suggested Menus -> Suggested (chip + tooltip)
- [x] DONE Mapping Decision -> Decision
- [x] DONE Collection Sync Status -> Status
- [x] DONE Remove extra Status column
- [x] DONE Current -> Final column uses compact format and `Changed:`
- [x] DONE Collection display names (titles, not handles)

### Popup / Explanations
- [x] DONE Eye popup with requested sections and labels
- [x] DONE Remove row inline reason; keep reason in popup
- [x] DONE Add “Why it was not auto-mapped” section in popup
- [x] DONE Collection Path Diff style (`= same`, `+ add`, `- remove`)

### Scroll / Freeze / Tooltip
- [x] DONE Horizontal clipping fixed at far-right
- [x] DONE Frozen columns hide underlying content correctly
- [x] DONE Bottom dock lane size and alignment restored
- [x] DONE Snap-to-column-stop behavior restored
- [x] DONE Tooltip blank white box root cause fixed
- [x] DONE Tooltip speed improved for suggested chips

### Tree / Selection
- [x] DONE 0/1/multi selected tree highlight behavior
- [x] DONE Undo/tree reset behavior
- [x] DONE Collapse sizing/offset/toggle final behavior

### Backend / Resolver
- [x] DONE autoMap failure fields passed through API row payload
- [x] DONE autoMap failure fields shown in UI
- [x] DONE coverage tie-break in resolver
- [x] DONE sibling keyword tie-break buckets
