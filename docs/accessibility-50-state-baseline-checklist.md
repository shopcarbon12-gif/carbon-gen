# Accessibility 50-State Baseline Checklist

This checklist is the implementation baseline for a U.S.-wide ecommerce site:

- Federal ADA Title III obligations (nationwide)
- State-level add-ons handled through stronger technical conformance and process
- Technical target: WCAG 2.1 AA minimum (2.2 AA preferred where feasible)

## 1) Governance and public-facing process

- [ ] Publish an Accessibility Statement page on storefront
- [ ] Include contact/feedback channel for accessibility issues
- [ ] Define response SLA for reported issues
- [ ] Keep remediation log (date, issue, fix, retest)
- [ ] Name an internal accessibility owner

## 2) Widget runtime (supporting controls, not full compliance by itself)

- [x] Keyboard operable launcher and panel controls
- [x] ARIA state wiring (`aria-expanded`, `aria-controls`, **non-modal `role="region"`** panel — **no** `aria-modal`, **no** dialog semantics, **no** focus trap; `Tab` may move into page content)
- [x] **Close / dismiss:** Close button and outside click close the panel and **return focus to the launcher**. **Escape** closes and returns focus to the launcher **only while focus is inside the panel** (expected for non-modal — Esc is not a global dismiss when focus is in the page, e.g. after jump-to-heading)
- [x] Statement link rendered from configuration
- [x] Issue-report link rendered from configuration URL/email
- [x] Feature controls for text scale, contrast, link highlight, readable font, pause motion

## 3) Storefront-level WCAG requirements (must be remediated in templates/content)

- [ ] Semantic headings and landmarks are valid and consistent
- [ ] Focus order is logical on all interactive pages
- [ ] All controls are keyboard accessible (no traps)
- [ ] Visible focus indicator on all interactive elements
- [ ] Color contrast meets WCAG AA thresholds
- [ ] Color is never the only way to convey meaning
- [ ] Meaningful images have accurate alt text
- [ ] Decorative images are marked correctly
- [ ] Form inputs have programmatic labels and instructions
- [ ] Form errors are announced and clearly described
- [ ] Video includes captions (and transcripts where needed)
- [ ] Dynamic UI updates are announced appropriately when necessary

## 4) Critical commerce journey checks

- [ ] Homepage navigation and promo modules
- [ ] Collection pages (filters, sorting, pagination)
- [ ] Product pages (variant selectors, media, add-to-cart)
- [ ] Cart drawer/page (quantity, remove, totals, checkout CTA)
- [ ] Checkout handoff and validation behavior
- [ ] Account/login/reset flows
- [ ] Search results and zero-state behavior

## 5) Evidence and defensibility

- [ ] Automated scan report for key templates
- [ ] Manual keyboard-only test notes
- [ ] Manual screen-reader test notes (at least one SR/browser pair)
- [ ] Before/after evidence for each fixed defect
- [ ] Re-test evidence after fixes

## 6) Current status in this side workspace

Implemented in code:

- `app/accessibility/page.tsx`
  - compliance config fields and coverage snapshot
- `app/accessibility/widget/route.ts`
  - keyboard/focus/ARIA aligned with **non-modal region** toolbar (see `docs/accessibility-widget-phase-a-b-spec.md` §1)
  - statement/reporting links driven by config

Pending:

- full storefront remediation and QA evidence collection
- statement/reporting pages final content and operational process

