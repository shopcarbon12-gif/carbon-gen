# Image Studio (OpenAI / Gemini Generator) — Hard Locks, Prompts & Poses

Reference for all hard locks, prompts, and pose definitions used in the Image Studio generator (`/studio/images`). Used by both `studio-workspace.tsx` (OpenAI) and `gemini-workspace.tsx` (Gemini).

---

## 1. Panel ↔ Pose Mapping

### Male Panel Mapping
| Panel | Left Frame | Right Frame |
|-------|------------|-------------|
| 1 | Pose 1 | Pose 2 |
| 2 | Pose 3 | Pose 4 |
| 3 | Pose 5 | Pose 6 |
| 4 | Pose 7 | Pose 8 |

### Female Panel Mapping
| Panel | Left Frame | Right Frame |
|-------|------------|-------------|
| 1 | Pose 1 | Pose 2 |
| 2 | Pose 3 | Pose 4 |
| 3 | Pose 7 | Pose 5 (Lower Body + Close-Up) |
| 4 | Pose 6 | Pose 8 (Relaxed Full Body + Creative) |

---

## 2. Hard Locks (from code)

### Global / Non-Sexual Ecommerce
```
NON-SEXUAL ECOMMERCE CATALOG HARD LOCK:
- This is a neutral product catalog photo for an online fashion store.
- No lingerie/pornographic styling, no provocative framing, no suggestive mood.
- Camera framing must avoid erotic emphasis: no intentional cleavage/breast focus, no underboob, no see-through focus.
- No explicit nudity, no implied nudity, no wet look, no bedroom setting, no intimate context.
```

### Sensitive Item Safety Mode (when item is sensitive)
```
- SENSITIVE ITEM SAFETY MODE: keep posture neutral and upright; avoid bent-over or exaggerated hip/arch poses; keep camera at neutral catalog height.
- If the garment is revealing by design (e.g., mini dress), keep it strictly catalog: flat lighting, neutral expression, no sexualized styling.
```

### Age Lock
```
- HARD AGE LOCK: the model is over 25+.
```

### Footwear
- **Standard:** `Footwear hard lock: both full-body frames must show shoes. Barefoot is forbidden.`
- **Swimwear:** `Swimwear footwear lock: full-body frames may use flip-flops/water-shoes, or naturally uncovered feet.`

### Close-Up Locks (by category)
- **TOP:** Category lock: close-up must focus on TOP details only. Close-up safety lock: do not emphasize cleavage/breasts or sexualized framing.
- **BOTTOM:** Category lock: close-up must focus on BOTTOM details only.
- **FOOTWEAR:** Category lock: close-up must focus on FOOTWEAR details only.
- **OUTERWEAR:** Category lock: close-up must focus on OUTERWEAR details only.
- **ACCESSORY:** Category lock: close-up must focus on ACCESSORY details only.
- **FULL-LOOK:** Choose highest-detail hero component; Close-up safety lock: keep crop product-only (fabric/hardware/branding/seams), avoid nude-skin emphasis.

### Back Surface Lock (Male Panel 4)
```
- LEFT Pose 7 back-surface lock: keep the back clean. Do not invent or add any back print/graphic/logo design.
- Only show a back design if that exact design is clearly present in the locked item references.
```

### Identity & Outfit Locks
```
- Run-level identity lock: preserve the same exact model face identity across all panels.
- Hard identity lock: this must be the exact same person across all panels.
- Face-geometry lock: keep same eye shape/spacing, nose, lip contour, jawline, cheek structure, brow shape.
- Skin-tone lock: preserve exact model skin tone. Never lighten, darken, recolor.
- Outfit continuity lock: both frames must represent the same selected outfit/look.
- Fail-closed lock: if exact locked model identity and exact locked item look cannot both be shown, do not output an image.
```

### Pose & Framing
```
- Pose execution hard lock: LEFT frame must execute only LEFT active pose. RIGHT frame must execute only RIGHT active pose.
- Full-body framing lock: whenever an active pose is full-body, include full head and both feet entirely in frame.
- 3:4 split centering hard lock: each panel half is center-cropped to a final 3:4 portrait.
- No-crop mapping lock: in any full-body panel, frame top-of-hair to bottom-of-shoes with visible white margin.
```

### Background
```
- Background hard lock: keep sharp, clean studio white background (no gray cast, gradient, vignette, texture).
- Background hard lock: use seamless pure white cyclorama look (#FFFFFF), no horizon line, no color tint.
```

---

## 3. App Policy Blocks (blocked categories)

- **Intimates:** underwear, briefs, boxers, lingerie, thong, bra, intimates → **BLOCKED**
- **Swimwear:** Can be blocked by app policy; otherwise allowed with medium sensitivity.

---

## 4. Pose Library — MALE (Pose 1–8)

**Source:** `lib/panelPoseLibraries.ts` → `MALE_POSE_LIBRARY`

| Pose | Name | Description |
|------|------|-------------|
| 1 | Full Body Front (Neutral Hero) | Full body straight-on; arms relaxed 1–2" from torso; hands visible; feet parallel |
| 2 | Full Body Lifestyle | Full body; subtle weight shift; controlled stance; head small angle or off-camera gaze |
| 3 | Torso + Head (Front) | Crop mid-thigh to head; upright posture; arms relaxed; neckline/branding unobstructed |
| 4 | Full Body Back View | Full body back; arms relaxed; neck neutral; hands visible |
| 5 | Lower Body / Legs | Crop waist to feet; neutral stance; emphasize fit, drape, taper, hem |
| 6 | Single Close-Up | ONE close-up image; governed by CLOSE-UP ITEM TYPE LOCK; branding/hardware/construction hero |
| 7 | Torso Back (Over-the-Shoulder) | Crop mid-thigh to head back-facing; head turn 20–30° over shoulder; collar pop or shoulder tap |
| 8 | Natural Variation (Creative) | ONE creative image; seated/lean/walk options; TOPS default B, BOTTOMS default E, OUTERWEAR default C |

---

## 5. Pose Library — FEMALE (Pose 1–8)

**Source:** `lib/panelPoseLibraries.ts` → `FEMALE_POSE_LIBRARY`

| Pose | Name | Description |
|------|------|-------------|
| 1 | Front Hero (Main) | Full body straight-on; small hip shift; arms 1–2" from torso; feet parallel |
| 2 | Back View (Face Visible) | Full body back; head turned 30–45° over shoulder; face visible |
| 3 | 3/4 Front Angle | Full body rotated 25–35°; subtle weight shift; arms relaxed |
| 4 | Upper Body (With Face) | Crop mid-thigh to head or waist-up; upright; neckline/unobstructed |
| 5 | Single Close-Up | ONE close-up; governed by CLOSE-UP ITEM TYPE LOCK; branding/hardware/construction hero |
| 6 | Relaxed Front Variation | Full body front; softer stance; face always visible; one hand on thigh allowed (no occlusion) |
| 7 | Lower Body / Legs | Crop waist to feet; neutral stance; waistband + closure + pockets visible |
| 8 | Natural Variation (Creative) | ONE creative; TOPS default B, BOTTOMS default E, DRESSES default B, OUTERWEAR default C |

---

## 6. Panel Critical Lock Lines (per panel)

### Female
- **Panel 1:** Pose 1 full-body front hero; Pose 2 full-body back with face; footwear lock; same identity
- **Panel 2:** Pose 3 full-body 3/4; Pose 4 upper-body with face; no side swaps
- **Panel 3:** Pose 7 lower body; Pose 5 close-up; close-up subject + category rule; no identity/outfit change
- **Panel 4:** Pose 6 relaxed full-body; Pose 8 creative; footwear when full-body; identity/outfit locked

### Male
- **Panel 1:** Pose 1 full-body front; Pose 2 full-body lifestyle; both full head + feet; footwear lock
- **Panel 2:** Pose 3 torso + head; Pose 4 full-body back; Pose 4 footwear lock; same identity
- **Panel 3:** Pose 5 lower body; Pose 6 close-up; close-up subject + category rule; no outfit change
- **Panel 4:** Pose 7 torso-back over-shoulder; back-surface lock; Pose 8 creative; identity/item locked

---

## 7. Code Locations

| Item | File |
|------|------|
| Pose libraries (full text) | `lib/panelPoseLibraries.ts` |
| `getPanelPosePair` | `components/studio-workspace.tsx`, `components/gemini-workspace.tsx` |
| `getPanelCriticalLockLines` | Same |
| `getCloseUpCategoryRule` | Same |
| `buildMasterPanelPrompt` | Same |
| `getNonSuggestiveCatalogLines` | `components/gemini-workspace.tsx` |
| Image Studio page | `app/studio/images/page.tsx` → `StudioWorkspace mode="images"` |

---

## 8. Default Prompt (simple generate page)

**File:** `app/generate/page.tsx`

```text
a clean studio product photo of a black hoodie on a mannequin
```

This is the initial prompt for the basic `/generate` page (DALL·E-style), not the Image Studio panels.
