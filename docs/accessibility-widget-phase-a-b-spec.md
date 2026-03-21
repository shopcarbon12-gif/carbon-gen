# Phase A + B — implementation spec (frozen scope)

**Status:** Working spec for implementation. Roadmap structure is **frozen**; see `docs/accessibility-widget-roadmap.md` for phase order and v1 bar.

**Implement first:** Phase A, then Phase B. **Do not start Phase C** until A+B pass acceptance below (keyboard + SR + mobile spot-check).

**Runtime target:** `app/accessibility/widget/route.ts` (Shadow DOM).

**Discipline while implementing A+B**

- Do **not** add Phase C (or later) behavior “while you’re here.”
- Do **not** redesign control layout mid-stream; stick to this spec.
- No “small helpers” unless **required** for an A+B acceptance checkbox.
- After **each** PR: **keyboard-only** smoke before the next PR.

---

## 1. Panel pattern decision (lock this before coding)

**Chosen pattern: non-modal utility panel (named region)**

Rationale: jump-to-headings / jump-to-links move focus into **page content** while adjustments are page-level. A strict `aria-modal="true"` dialog would contradict that. This pattern is **honest** for an accessibility toolbar.

| Item | Value |
|------|--------|
| `role` | **`region`** on panel (named via `aria-labelledby` + title) |
| `aria-modal` | **Omit** (not a modal dialog) |
| `aria-labelledby` | Panel title id |
| `aria-describedby` | Optional id on subtitle (`carbon-a11y-panel-desc`) |
| Focus trap | **None** — `Tab` / `Shift+Tab` follow **document order** (launcher, panel controls, then page). |
| Focus on open | See **§1a** (locked default). |
| Focus on close | Return focus to **launcher** — see **§1a**. |
| **`Esc`** | **Only when focus is inside the panel** — `keydown` handler on the panel; closes and returns focus to launcher. **No** global `Esc` while focus is in the page (expected for non-modal). |
| Click outside | Closes panel (existing); return focus to launcher — must not leave focus in limbo |
| Jump actions | **Scroll + focus** target on page per **§5c**; panel **stays open** unless product later opts to collapse. |

### 1a. Focus management — explicit rules (avoid regressions)

| Event | Focus target | Notes |
|--------|----------------|-------|
| **Panel opens** | **Close button** inside panel header | Predictable; user can dismiss immediately. |
| **Panel closes** (Close, outside click, or `Esc` while focus in panel) | **Launcher `button`** | Always restore to trigger; `aria-expanded="false"`. |
| **`Esc` while focus inside panel** | **Launcher** (after close) | Handler on panel only — see table above. |
| **`Esc` while focus in page** | *(no widget action)* | Correct for non-modal; page or browser handles keys. |
| **Jump to headings/links** | **First matching element** on page (per **§5c**) | Panel remains open; live region still announces. |
| **Click outside closes** | **Launcher** | Same as close. |

**Close button missing or disabled (future config):** Not allowed in A+B — Close stays **present and enabled**. If a future flag removes it: on open, focus **first focusable inside `panelBody`**; `Esc` (in panel) and click-outside **still** close; document in a follow-up spec.

**Panel rerender (`rerenderPanel`) while open**

- If `document.activeElement` is **still connected** inside the shadow tree after rerender → **keep focus** on that element if it still exists (same logical control).
- If the focused node was **removed** (e.g. feature flag changed) → move focus to **Close button**; if unavailable → **first focusable in panel**.
- If **language change** causes RTL/layout rerender → re-apply rule above; do not leave `activeElement` on `document.body` outside the widget unless focus was intentionally moved to the page (e.g. jump).

**Launcher unmounts or widget removed while panel open** (edge case)

- Before removing DOM, **close** panel and move focus to a **safe host target**: `document.body`, or the **last known good** element outside shadow if available. Avoid stranded focus inside a removed root.

**Region root `tabindex`**

- Prefer **not** relying on focus on the panel root if a visible control exists. **Do not** remove Close; initial focus goes to **Close** per above.

---

## 1b. Preset behavior boundary (A+B — shapes state + announcements)

| Question | Spec |
|----------|------|
| Are presets “selected” in state? | **No persistent `activeProfile` id required for A+B.** Pills are **`button`s** (actions), not `aria-pressed` toggles. |
| What does a preset do? | **Command:** applies a **defined bundle** of field updates to `state` (same as today’s `applyProfile`). |
| Overwrite behavior? | **Yes — overwrites** every field that preset branch mutates. Fields **not** listed in that branch are **unchanged** (e.g. a minimal preset does not zero out unrelated toggles). **Clear profile** resets the full baseline set (same as current `clear`). |
| Live region | **One summary only:** `Profile applied: {label}` or `Accessibility settings reset`. **Do not** emit a burst of per-control announcements for a single preset or reset. |
| UI summary cards (Phase F) | **Out of scope** for A+B; behavior above still holds. |

---

## 1c. Select → radio migration path (avoid building UI twice)

| Rule | Decision |
|------|----------|
| Double implementation? | **Avoid.** Do not ship a **temporary custom cycle** or segmented control in A, then replace with radios in B. |
| Phase A | **Keep native `<select>`** for contrast, spacing, line height, align, saturation (and language if still a select). Meets A acceptance for “exclusive setting” semantics. |
| Phase B | **Single PR** replaces those five exclusives with **`role="radiogroup"`** (+ roving tabindex). **One layout pass** — radios are the first custom exclusive UI for those fields. |
| Language | Either **keep `<select>`** through B or move to radiogroup **in the same B PR** as other exclusives — **not** a third pattern mid-sprint. |

**Summary:** A may ship with selects; B swaps to radios **once**. No intermediate third control type.

---

## 2. Component inventory (exact list)

Components are listed in **tab order** when all feature flags are on. Omit any row when `config.features.*` disables it.

| # | Component id (logical) | DOM role (target) | State keys / action |
|---|-------------------------|-------------------|---------------------|
| 1 | **Launcher** | `button` | Opens/closes panel |
| 2 | **Panel** | `region` (named) | Container |
| 3 | **Close** | `button` | Closes panel |
| 4 | **Live region** | container `role="status"` **or** `aria-live="polite"` on single element | No user focus |
| 5 | **Language** | `select` through A → **radiogroup** or `select` through B (see **§1c**) | `state.language` |
| 6 | **Section: Profiles** | heading + region | — |
| 7 | **Profile pills** (6) | `button` each | `applyProfile(key)` |
| 8 | **Clear profile** | `button` | `applyProfile('clear')` |
| 9 | **Section: Quick controls** | heading + region | — |
| 10 | **Toggle: High contrast** | `button` **`role="switch"`** | `highContrast` |
| 11 | **Toggle: Readable font** | switch | `readableFont` |
| 12 | **Toggle: Pause animations** | switch | `pauseAnimations` |
| 13 | **Toggle: Highlight links** | switch | `highlightLinks` |
| 14 | **Toggle: Hide images** | switch | `hideImages` |
| 15 | **Toggle: Reading guide** | switch | `readingGuide` |
| 16 | **Toggle: Reading mask** | switch | `readingMask` |
| 17 | **Toggle: Big cursor** | switch | `bigCursor` |
| 18 | **Section: Adjustments** | heading + region | — |
| 19 | **Command: Text larger** | `button` | `textScale += 10` |
| 20 | **Command: Text smaller** | `button` | `textScale -= 10` |
| 21 | **Contrast mode** | `select` (A) → **radiogroup** (B) | `contrastMode` |
| 22 | **Text spacing** | `select` (A) → **radiogroup** (B) | `textSpacing` |
| 23 | **Line height** | `select` (A) → **radiogroup** (B) | `lineHeight` |
| 24 | **Text align** | `select` (A) → **radiogroup** (B) | `textAlign` |
| 25 | **Saturation** | `select` (A) → **radiogroup** (B) | `saturation` |
| 26 | **Jump to headings** | `button` | See **§5c** / **§7.5** |
| 27 | **Jump to links** | `button` | See **§5c** / **§7.5** |
| 28 | **Reset** | `button` | `applyProfile('clear')` |
| 29 | **Statement link** | `a` | external |
| 30 | **Report link** | `a` | mailto or external |

**Unused in current panel (keep for grid layouts elsewhere):** `makeToolCard` / `makeToolCardAction` — if re-enabled, map to same switch/command rules below.

---

## 3. ARIA — exact attributes by component type

### 3.1 Launcher (`button`)

| Attribute | Value |
|-----------|--------|
| `aria-haspopup` | **Omit** (panel is not a dialog popup; use `aria-expanded` + `aria-controls` only) |
| `aria-expanded` | `true` / `false` |
| `aria-controls` | panel id (e.g. `carbon-a11y-panel`) |
| Accessible name | **`{config.label}, accessibility menu`** (or i18n equivalent) — not `"Accessibility options"` alone if label is custom |
| Icon `AA` | `aria-hidden="true"` |

### 3.2 Panel (`region` — non-modal)

| Attribute | Value |
|-----------|--------|
| `role` | `region` |
| `aria-modal` | **Do not set** |
| `aria-labelledby` | title id |
| `aria-describedby` | subtitle id (if present) |
| `tabindex` | `-1` on panel root **only if** focus moves to root on open; prefer first control (Close) |

### 3.3 Close (`button`)

| Attribute | Value |
|-----------|--------|
| `aria-label` | `Close accessibility settings` (i18n key: `closePanel`) |

### 3.4 Live region

| Attribute | Value |
|-----------|--------|
| `role` | `status` (preferred) |
| `aria-live` | `polite` |
| `aria-atomic` | `true` |
| Class | visually hidden (clip/off-screen, not `display:none`) |

### 3.5 Section titles

| Attribute | Value |
|-----------|--------|
| Element | native **heading** `h2` or `h3` inside shadow (preferred) **or** `div` with `role="heading"` `aria-level="2"` |
| Section wrapper | `section` with `aria-labelledby` pointing at heading id |

### 3.6 Profile pills (`button`)

| Attribute | Value |
|-----------|--------|
| Name | visible text (profile name) |
| `aria-pressed` | omit (not toggle — each applies a preset) |

### 3.7 Toggle row → **switch**

| Attribute | Value |
|-----------|--------|
| `role` | `switch` |
| `aria-checked` | `true` / `false` |
| `aria-labelledby` | id of label text **or** `aria-label` = full feature name |
| **Do not** expose fake “On/Off” text inside switch track to SR if redundant — use `aria-checked` only |

Implementation note: use `<button type="button" role="switch">` with `aria-checked` updated on toggle.

### 3.8 Command buttons (text scale, jump)

| Attribute | Value |
|-----------|--------|
| `type` | `button` |
| Name | visible label |
| Value hint | `aria-describedby` optional → current scale badge id for “Text larger/smaller” |

### 3.9 Exclusive setting — Phase A: native `<select>`

| Attribute | Value |
|-----------|--------|
| `<label for>` | matches `select.id` |
| `select` | implicit `combobox` behavior in SR — acceptable for Phase A |

### 3.10 Exclusive setting — Phase B: **radio group**

| Attribute | Value |
|-----------|--------|
| Container | `role="radiogroup"` `aria-labelledby` = group label id |
| Each option | `role="radio"` `aria-checked` true/false |
| Name | group label + option label |

**Roving tabindex:** one radio in group has `tabindex="0"`, others `-1`; arrows move focus + select per APG.

### 3.11 Links

| Attribute | Value |
|-----------|--------|
| Visible text | statement / report copy |
| External | `rel` / `target` as today |

---

## 4. Keyboard behavior — by control type

Global (non-modal panel):

| Key | Behavior |
|-----|----------|
| `Tab` / `Shift+Tab` | Normal tab order — **through** panel controls and **into/out of** the rest of the page (no trap). |
| `Escape` | **Only when focus is inside the panel** — close panel, return focus to launcher (`stopPropagation` on handler). |
| `Escape` (focus in page) | Widget does not intercept. |

### 4.1 Switch (`role="switch"`)

| Key | Behavior |
|-----|----------|
| `Space` | Toggle |
| `Enter` | Toggle (optional for button; Space is primary) |

### 4.2 `button` (profile, command, reset, close)

| Key | Behavior |
|-----|----------|
| `Space` / `Enter` | Activate |

### 4.3 Native `<select>` (Phase A only)

| Key | Behavior |
|-----|----------|
| `Space` / `Enter` / `Alt+↓` | Open (browser default) |
| Arrows | Change selection per OS |

### 4.4 Radio group (Phase B)

| Key | Behavior |
|-----|----------|
| `↓` / `→` | Move focus to next radio, **select** it |
| `↑` / `←` | Move focus to previous radio, **select** it |
| `Space` | Select focused radio |
| `Home` | Focus + select first |
| `End` | Focus + select last |

### 4.5 Horizontal profile strip

| Key | Behavior |
|-----|----------|
| `Tab` | Each pill is focusable in DOM order |
| Optional enhancement | `role="toolbar"` with home/end — **defer** unless time; not required for A+B minimum |

---

## 5. Live region — exact messages (English canonical)

Use a single function `announce(text)`. i18n: same keys in `i18n.*`.

### 5.0 Live region — deduping and batching (normative)

| Rule | Spec |
|------|------|
| **Identical string** re-sent within **300ms** | **Suppress** second send (debounce / coalesce). |
| **Same control, same value** (user or code sets value to what it already was) | **Suppress** announcement (idempotent). |
| **Preset apply** | **Exactly one** message: `Profile applied: {label}`. **No** per-field announcements in the same tick. |
| **Reset / clear profile** | **Exactly one** message: `Accessibility settings reset`. **No** per-control off announcements. |
| **Rapid text size clicks** | Announce **latest** scale after a **150ms** debounce (optional) or respect 300ms identical-string rule for same `n`. |
| **Panel open/close** | **Default:** no announcement (avoid noise), unless product later opts in. |

### 5.1 Toggles (after state change)

| State key | `true` message | `false` message |
|-----------|----------------|-----------------|
| `highContrast` | `High contrast on` | `High contrast off` |
| `readableFont` | `Readable font on` | `Readable font off` |
| `pauseAnimations` | `Animations paused` | `Animations playing` |
| `highlightLinks` | `Links highlighted` | `Link highlighting off` |
| `hideImages` | `Images hidden` | `Images shown` |
| `readingGuide` | `Reading guide on` | `Reading guide off` |
| `readingMask` | `Reading mask on` | `Reading mask off` |
| `bigCursor` | `Large cursor on` | `Large cursor off` |

### 5.2 Select / radio (exclusive)

Announce **value label** (user-facing), not internal enum:

| Setting | Message template |
|---------|------------------|
| `contrastMode` | `Contrast mode: {label}` |
| `textSpacing` | `Text spacing: {label}` |
| `lineHeight` | `Line height: {label}` |
| `textAlign` | `Text alignment: {label}` |
| `saturation` | `Saturation: {label}` |
| `language` | `Language: {label}` |

### 5.3 Commands

| Action | Message |
|--------|---------|
| Text larger (success) | `Text size {n} percent` |
| Text smaller (success) | `Text size {n} percent` |
| Text at min/max | `Text size already at minimum` / `… maximum` |
| Jump headings (found) | `Moved to first heading` |
| Jump headings (none) | `No headings found on this page` |
| Jump links (found) | `Moved to first link` |
| Jump links (none) | `No links found on this page` |

### 5c. Jump actions — success definition (normative)

| Item | Spec |
|------|------|
| **Selector** | Headings: `h1,h2,h3,h4,h5,h6`. Links: `a[href]`. |
| **Which match** | **First element in document order** (`NodeList[0]`). |
| **Scroll** | **Yes** — `scrollIntoView({ block: 'start', behavior: 'smooth' })` (or `auto` if `prefers-reduced-motion` honored later in C). |
| **Focus** | **Yes** — after scroll, set `tabindex="-1"` if needed and **`focus({ preventScroll: true })`** so keyboard flow continues from a sensible place. |
| **If focus fails** (element not focusable and cannot receive focus) | Still **scroll**; still announce **found** message (user + SR get “moved” semantics). |
| **If zero matches** | **Do not** scroll; announce **none** message. |
| **Live region** | Always **found** or **none** per table in §5.3 — no silent jumps. |
| **Multiple matches** | No “next/prev” in A+B; only first match. |
| **Panel state** | Panel **stays open**; focus moves to the page target so the user can continue browsing (non-modal contract). |

### 5.4 Presets

| Action | Message |
|--------|---------|
| Apply named preset | `Profile applied: {preset label}` |
| Clear profile | `Accessibility settings reset` |

### 5.5 Panel chrome

| Action | Message |
|--------|---------|
| Open panel | Optional: `Accessibility menu` (only if not noisy; **default skip** to avoid chatter) |
| Close panel | Optional skip |

### 5.6 Errors (minimal for A+B)

| Case | Message |
|------|---------|
| Save to `localStorage` fails | `Settings could not be saved on this device. Changes apply for this visit.` |

---

## 6. CSS — focus visibility (Phase A)

| Rule | Requirement |
|------|----------------|
| `:focus-visible` | Clear ring on `button`, `a`, `select`, radios — **≥ 3:1** against adjacent panel background |
| `outline-offset` | ≥ 2px where possible |
| Overflow | If focus ring clipped, add inner padding on scroll container or `scroll-margin` on focused items |

---

## 7. Acceptance criteria (must pass before Phase C)

### 7.1 Keyboard (no mouse)

- [ ] Open/close from launcher; **`Esc` closes only when focus is inside the panel**; **after any close path, focus is on the launcher** (explicit signoff check).
- [ ] **`Tab` moves through the panel and may continue into the page** (no trap); `Shift+Tab` likewise.
- [ ] Every control in §2 is reachable and operable with keyboard only.
- [ ] All switches toggle with **Space**.
- [ ] Phase A: every `<select>` changes value with keyboard and updates page + announcement.
- [ ] Phase B: every exclusive group uses radio pattern; arrows/Home/End work per §4.4.

### 7.2 Screen reader (pick one desktop + one mobile if possible)

- [ ] Launcher name includes purpose (“accessibility menu”).
- [ ] Panel announced as a **named region** (title association); not as a modal dialog.
- [ ] Switches expose **role** and **checked** state.
- [ ] After each change, **status** region announces message (NVDA/VoiceOver “polite” queue).

### 7.3 Mobile / touch (spot)

- [ ] Launcher and row targets ≥ **44×44** CSS px (verify; fix in C if needed — but no microscopic hit areas in A+B).

### 7.4 Engineering

- [ ] **No** `aria-modal` on panel; **no** focus trap — behavior matches non-modal **region** semantics.
- [ ] No duplicate verbose “On/Off” in both visual and `aria-checked`.
- [ ] `rerenderPanel()` does not strand focus: after rebuild, focus moves to **safe** element per **§1a** if active node was removed.

### 7.5 Jump actions (acceptance)

- [ ] With matching elements: **scroll + focus attempt** per **§5c**; status announces **found**.
- [ ] With no matches: **no scroll**; status announces **none**.
- [ ] First match only; deterministic order.

### 7.6 Live region (acceptance)

- [ ] Preset / reset: **single** announcement, no burst (§5.0, §1b).
- [ ] Idempotent value set does not announce.
- [ ] Duplicate string within 300ms suppressed.

---

## 8. Implementation order (practical PR sequence)

Build in this order; **keyboard-only check after each PR**.

1. **Launcher + panel shell** — `role="region"`, **no** `aria-modal`, labelledby/describedby, launcher `aria-expanded` + `aria-controls`, **§1a** open → **Close**, close → launcher.
2. **Non-modal keyboard model** — No trap; `Esc` on panel only; click-outside; jump moves focus to page; no stranded focus.
3. **Live region** — `announce()` + **§5.0** dedupe; wire panel open optional skip.
4. **Toggle semantics** — `role="switch"`, `aria-checked`, announcements §5.1.
5. **Command buttons** — text scale + **jumps** implementing **§5c** + announcements §5.3.
6. **Exclusive settings** — Phase A: labeled `<select>`s + §5.2 announcements; Phase B: **one PR** radiogroup swap per **§1c**.
7. **Presets + reset** — **§1b** single summary announcements; no per-field spam.
8. **Keyboard map polish** — comment block in IIFE; radiogroup arrows/Home/End.
9. **`:focus-visible` pass** — §6 shadow CSS.
10. **Acceptance pass** — full §7 checklists before any Phase C work.

---

## 9. Out of scope for A+B

- Focus enhancer on **page** (Phase C)
- `prefers-reduced-motion` (Phase C)
- Persistence split session/saved (Phase D)
- Contrast exclusions / image modes (Phase E)
- Preset summary UI / undo (Phase F)

---

*This document is the implementation contract for Phases A and B until revised by explicit change.*
