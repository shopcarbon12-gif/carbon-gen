# Accessibility widget — implementation roadmap

**Status: FROZEN** — Phase order and v1 bar are set. **Do not expand scope** without revisiting the v1 sentence below. Implementation detail for Phases **A + B** lives in **`docs/accessibility-widget-phase-a-b-spec.md`** (roles, keyboard, live messages, acceptance tests).

**Goal:** Move from “feature-rich overlay” to **keyboard-complete, AT-honest, site-safe** tooling with clear persistence and ops.

**Primary code surface:** `app/accessibility/widget/route.ts` (runtime), `app/accessibility/page.tsx` (builder/preview), `lib/accessibilityConfigRepository` + config schema (managed settings).

**Optimization default:** **WCAG operability + AT honesty first**, then Shopify merchant UX (collision, theme variance).

---

## “Finished v1” bar (one sentence)

The widget is **finished enough for v1** when it is:

**Semantically correct, fully keyboard-usable, announces state changes, respects motion/touch/system preferences, stores settings predictably, and applies visual overrides without breaking the site.**

Not required for v1: in-panel search, giant navigation tree, draggable launcher, debug dashboard, or endless advanced modes — those can follow.

---

## Guiding principles

1. **One pattern for the shell:** **Locked:** non-modal **named `region`** panel (no `aria-modal`, no focus trap). Jump actions may move focus into the page; `Esc` closes only when focus is inside the panel. `role`, focus, and “click outside” match that pattern everywhere.
2. **Name, role, value:** Every control exposes label + current value + state changes (including via `aria-live`).
3. **Precedence order (document in code):** e.g. `explicit user choice` > `saved prefs` > `session tools` > `system prefers-* hints` — never fight browser zoom or user stylesheet without an explicit “enhance” toggle.
4. **Schema version:** All persisted JSON gets `v` + migration on read.

---

## Phase A — Accessibility foundation

**Outcome:** SR + keyboard can use the panel without mouse; changes are announced; focus is never “lost.”

| # | Deliverable | Notes / acceptance |
|---|-------------|---------------------|
| A1 | **Launcher ARIA** | Stable accessible name; `aria-expanded`, `aria-controls` → panel (`aria-haspopup` omitted — not a dialog); icon decorative. |
| A2 | **Panel pattern** | **Non-modal `region`:** no `aria-modal`, no trap; **focus return** to launcher on close; `Esc` on panel only; document in phase spec. |
| A3 | **Section structure** | Regions / headings / grouped controls (`role="region"` + `aria-labelledby` or native headings in shadow). |
| A4 | **Tab order** | Logical **Tab / Shift+Tab** through panel **and** page (no trap); no dead ends after dynamic rerender. |
| A5 | **Live region** | Polite `aria-live`; central `announce(msg)` on toggle, control change, preset, reset, errors. |
| A6 | **Visible focus baseline** | `:focus-visible` on all interactives; sufficient contrast; not clipped by panel overflow without `scrollIntoView` / padding fix. |
| A7 | **Escape** | `Esc` closes **when focus is in the panel**; with focus in page, widget does not steal `Esc`; verify with SR. |

**Exit criteria:** Keyboard pass + NVDA/VoiceOver smoke; announcements on each action.

---

## Phase B — Control semantics

**Outcome:** No mystery cycles; **name, role, value** for AT; explicit keyboard behavior.

| # | Deliverable | Notes |
|---|-------------|--------|
| B1 | **Switches / checkboxes / radios** | Toggles: `role="switch"` + `aria-checked` (or checkbox). Exclusive options: `radiogroup` / `radio` or segmented `aria-pressed` tablist — **document one pattern**. |
| B2 | **Replace cycle-only controls** | Contrast, spacing, line height, align, saturation: **visible choices** (radios/segments), not only `<select>` or repeat-click cycles. |
| B3 | **Keyboard map** | Arrows within groups; **Home/End** where applicable; **Space/Enter**; short **keyboard map** comment in `route.ts`. |
| B4 | **Current value to AT** | Selected option and numeric levels exposed (e.g. `aria-valuenow` / labelled output where appropriate). |
| B5 | **Command rows** | Jump / steppers as buttons with **announced result** (“Text size 120 percent”). |

**Exit criteria:** SR announces group + value; roving tabindex / arrow behavior consistent.

---

## Phase C — Motion, touch, and focus enhancement

**Outcome:** Widget respects OS motion prefs, is usable on touch, and can **improve focus visibility on the page** (not only inside the panel).

| # | Deliverable | Notes |
|---|-------------|--------|
| C1 | **`prefers-reduced-motion`** | **`motionPreference`** (`system` \| `reduce` \| `allow`), persisted; **`effectiveReducedMotion()`** + **`shouldMinimizeMotion()`** (`pauseAnimations` **or** reduced); shell **`carbon-a11y-reduce-motion`** gates launcher/switch/tile/panel CSS; **`jumpToSelector`** uses `shouldMinimizeMotion()` for scroll; **reading guide/mask** pointer updates throttled (~48ms + rAF coalesce) when minimized motion; **PRM `change`** refreshes class when `motionPreference==='system'`. **Pause animations** = stronger explicit page-wide rule (still OR’d into `shouldMinimizeMotion` for widget + scroll). |
| C2 | **Touch targets** | **≥ 44×44 CSS px** for trigger and controls; optional **large controls** mode in config. |
| C3 | **Motion-safe panel** | Open/close respects PRM; no bounce/peek animations when PRM. |
| C4 | **Enhanced focus mode** | **Early priority:** thicker outline / **focused element highlight** / halo — page-level CSS injection, toggle in panel, works with reading tools. |
| C5 | **System contrast / color-scheme (optional hints)** | Non-blocking suggestion (e.g. banner or first-open tip) if `prefers-contrast` / `prefers-color-scheme` suggests it; never override explicit user off. |

**Rationale:** Focus enhancement is a **high-value runtime tool**; it belongs with foundation-adjacent work (C), not late “product extras.”

---

## Phase D — State architecture

**Outcome:** Predictable persistence and recovery.

| # | Deliverable | Notes |
|---|-------------|--------|
| D1 | **Session vs saved prefs** | Clear split in state + storage shape. |
| D2 | **Precedence rules** | Document order: explicit user > saved > session > system hints. |
| D3 | **Per-feature persistence flags** | Config-driven (e.g. tools session-only, typography persists). |
| D4 | **Reset levels** | Session tools only / saved prefs / full + confirm when many active. |
| D5 | **Schema version + migration** | `settings.v`; merge defaults; corrupt → safe defaults + optional announce. |

---

## Phase E — Site-safe visual transforms

**Outcome:** Modes don’t wreck commerce UI, media, or focus.

| # | Deliverable | Notes |
|---|-------------|--------|
| E1 | **Scoped contrast** | Document application scope (`html` vs `main`). |
| E2 | **Invert protection** | Invert behind **Advanced** or soft default; separate “text contrast” from full inversion where possible. |
| E3 | **Exclusions** | `data-carbon-a11y-exclude` + optional `ignoreSelectors[]`; test focus under modes. |
| E4 | **Image modes** | Show all / reduce decorative / hide non-essential; **preserve functional media**; optional merchant selectors. |

---

## Phase F — Presets, help, quick actions

**Outcome:** Trust and clarity **before** heavy navigation features; basics for jumping.

**Rationale:** Presets already exist — **transparency and undo** should land **before** full landmark polish.

| # | Deliverable | Notes |
|---|-------------|--------|
| F1 | **Preset summaries** | What each preset changes (list); optional preview. |
| F2 | **Undo / restore prior** | After applying a preset, restore previous custom settings (session stack). |
| F3 | **Help copy** | Short descriptions / expandable “what this does.” |
| F4 | **i18n completeness** | All labels, announcements, preset text, help — including RTL/Hebrew layout review. |
| F5 | **Skip actions / quick nav basics** | “Skip to main,” headings/links jumps — **baseline** quick actions (richer landmarks in G). |

---

## Phase G — Launcher and navigation polish

**Outcome:** Works on real storefronts next to chat, cookies, sticky cart.

| # | Deliverable | Notes |
|---|-------------|--------|
| G1 | **Landmarks** | Jump to `main`, `nav`, `footer`, search; configurable selector map for common Shopify themes. |
| G2 | **Collision handling** | Offsets / stacking vs cookie bar, chat widgets; config overrides. |
| G3 | **Mobile placement** | Safe areas, thumb reach, no overlap with host CTAs. |

---

## Phase H — Product extras (late)

**Outcome:** Scale and ops — **only after** the panel is large/complex enough to need them.

| # | Deliverable | Notes |
|---|-------------|--------|
| H1 | **In-panel search** | Filter by label/help — **defer** until control count justifies it. |
| H2 | **Analytics hardening** | Neutral events, debounce, version/config id, no PII; fail open. |
| H3 | **Debug mode** | Query flag: active state, storage, last announcements (staff/dev). |
| H4 | **Public API** | `open()` / `close()` / `reset()`, hash/query — **very late** unless programmatic hooks are required; nice for your own store, not v1-critical. |
| H5 | **Reading-tool tuning** | Opacity, thickness, PRM-safe motion, snap-to-focus — advanced polish. |
| H6 | **Other advanced add-ons** | As needed — keep gated. |

---

## Suggested sequence (sprints)

| Sprint | Scope |
|--------|--------|
| **1** | A (full) |
| **2** | B (full) |
| **3** | C (incl. **focus enhancer C4**) |
| **4** | D |
| **5** | E |
| **6** | F (presets + help + basic skip/jump **before** deep G) |
| **7** | G |
| **8** | H (pick by need; **search H1** only when panel is crowded) |

---

## Explicitly deferred / “later”

- Full **page outline tree** UI.
- **Deep** color-blind modes separate from saturation.
- **Draggable launcher** + remember position.

---

## Testing checklist (each release)

- Keyboard-only full flow; SR spot-check (NVDA + VoiceOver).
- Zoom 200%: panel usable; no clipped focus.
- With `prefers-reduced-motion: reduce`: no offending motion.
- Storage corrupted: safe fallback + optional announce.

---

## File touchpoints (expected)

| Area | Files |
|------|--------|
| Runtime widget | `app/accessibility/widget/route.ts` |
| Builder / preview | `app/accessibility/page.tsx` |
| Config schema / persistence | `lib/accessibilityConfigRepository`, widget config types |
| Docs | This file, `docs/accessibility-widget-ops.md` |

---

*Last updated: refined phase order (focus enhancement in C; presets before full nav polish; API/search late).*
