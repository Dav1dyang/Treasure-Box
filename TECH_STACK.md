# Treasure Box — Tech Stack & File Audit

> **Purpose:** Reference document for UI/UX simplification. Catalogs every file, dependency, and architectural detail. Identifies dead code, complexity hotspots, and actionable cleanup opportunities.
>
> **Last updated:** 2026-03-21

## Project Snapshot

Treasure Box is a Next.js 16 web app where users create physics-driven "treasure boxes" — upload photos, attach stories, and embed an interactive drawer widget anywhere on the web. Items tumble inside a Matter.js-powered drawer with collision sounds and AI-generated artwork via Gemini.

- **Stack:** Next.js 16 + React 19 + Tailwind CSS 4 + Firebase 12 + Matter.js
- **Source files:** 25 files, ~7,959 lines (excluding CSS/config)
- **Styling:** Tailwind v4 + CSS custom properties (`--tb-*`) for dark/light theming
- **Font:** IBM Plex Mono (300/400/500/600)
- **Tests:** None (no test runner configured)
- **All pages are client-side** (`'use client'`). Firebase security rules enforce auth at the database level.

---

## Dependencies

### Core Framework

| Package | Version | Purpose | Used by |
|---------|---------|---------|---------|
| `next` | ^16.2.0 | App Router, SSR, API routes | All pages and layouts |
| `react` | ^19.2.4 | UI rendering | All components |
| `react-dom` | ^19.2.4 | DOM rendering | All components |
| `typescript` | ^5.9.3 | Type safety | All files |

### Physics & Rendering

| Package | Version | Purpose | Used by |
|---------|---------|---------|---------|
| `matter-js` | ^0.20.0 | 2D physics engine (dynamic import, SSR disabled) | TreasureBox.tsx, LoadingAnimation.tsx |
| `@types/matter-js` | ^0.20.2 | TypeScript definitions for Matter.js | TreasureBox.tsx, LoadingAnimation.tsx |

### AI & Image Processing

| Package | Version | Purpose | Used by |
|---------|---------|---------|---------|
| `@google/generative-ai` | ^0.24.1 | Gemini API client for sprite generation | api/generate-box/route.ts |
| `sharp` | ^0.34.5 | Server-side image processing (sprite slicing) | api/generate-box/route.ts |
| `@imgly/background-removal` | ^1.7.0 | Client-side WASM background removal | editor/page.tsx |

### Backend

| Package | Version | Purpose | Used by |
|---------|---------|---------|---------|
| `firebase` | ^12.10.0 | Auth (Google), Firestore, Storage — client SDK | firebase.ts, firestore.ts, AuthProvider.tsx |

### Build Tools

| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^4.2.2 | Utility-first CSS framework |
| `@tailwindcss/postcss` | ^4.2.2 | Tailwind PostCSS plugin |
| `postcss` | ^8.5.8 | CSS transformation pipeline |
| `@types/node` | ^25.5.0 | Node.js type definitions |
| `@types/react` | ^19.2.14 | React type definitions |

### Environment Variables

**Required (Firebase):**
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`

**Required (AI):**
`GOOGLE_AI_STUDIO_KEY` — Gemini API for sprite generation

**Optional:**
`GOOGLE_CLOUD_VISION_API_KEY` — Vision API for object contour detection (falls back to chroma key)

---

## File Inventory

### Library Layer (8 files, 1,715 lines)

| File | Lines | Role | Imports from | Imported by |
|------|------:|------|-------------|-------------|
| `src/lib/types.ts` | 150 | Shared type definitions (BoxConfig, TreasureItem, DrawerStyle, EmbedSettings, etc.) | — | Nearly every file |
| `src/lib/config.ts` | 163 | Default values, preset arrays, tunable constants | types | Nearly every file |
| `src/lib/firebase.ts` | 75 | Lazy Firebase init (Auth, Firestore, Storage) | — | firestore, AuthProvider |
| `src/lib/firestore.ts` | 200 | All Firestore/Storage CRUD (boxes, items, images, drawer sprites) | firebase, types | DrawerStylePicker, EmbedConfigurator, editor, embed, landing |
| `src/lib/sounds.ts` | 548 | Web Audio API collision/open/close sound engine, 6 presets | — | TreasureBox |
| `src/lib/boxStyles.ts` | 290 | Gemini prompt builder for 5-frame sprite sheet generation | types | generate-box/route, DrawerStylePicker |
| `src/lib/contour.ts` | 180 | Alpha-channel contour extraction for physics shapes | — | TreasureBox, editor |
| `src/lib/embedPosition.ts` | 109 | Overlay positioning math (anchor corners, viewport scaling) | types | TreasureBox, editor, embed |

### Components (8 files, 3,777 lines)

| File | Lines | Role | Imports from | Imported by |
|------|------:|------|-------------|-------------|
| `src/components/TreasureBox.tsx` | 1,573 | Core widget: Matter.js physics, 5-state drawer state machine, canvas rendering, sprite + ASCII modes, long-press stories, frame sync | sounds, contour, embedPosition, config, types, StoryCard | landing, editor, embed (dynamic import) |
| `src/components/DrawerStylePicker.tsx` | 666 | AI drawer generation UI: material/style/color/decor pickers, ASCII preview, generation trigger | firestore, config, types | editor |
| `src/components/EmbedConfigurator.tsx` | 468 | Embed settings UI: mode toggle, size presets, position drag, preview background, code generation | firestore, config, types | editor |
| `src/components/LoadingAnimation.tsx` | 463 | Matter.js loading animation: spawning/draining colored boxes | — (matter-js only) | editor, ~~prototype/loading~~ |
| `src/components/BoxDimensionEditor.tsx` | 407 | Box shape editor: dimensions, handle/corner styles, ASCII preview | types, config | **NONE (ORPHAN)** |
| `src/components/StoryCard.tsx` | 88 | Modal overlay for item story display (image, label, story, link) | types | TreasureBox |
| `src/components/AuthProvider.tsx` | 57 | Firebase auth context (Google sign-in/out, auth state) | firebase | providers, landing, editor |
| `src/components/ThemeProvider.tsx` | 55 | Dark/light theme context (localStorage, system preference) | — | providers, landing, editor |

### Pages & Layouts (7 files, 1,696 lines)

| File | Lines | Role | Key imports |
|------|------:|------|-------------|
| `src/app/page.tsx` | 284 | Landing: hero demo box, junk shelf, auth UI | TreasureBox (dynamic), firestore, AuthProvider, ThemeProvider |
| `src/app/editor/page.tsx` | 1,048 | Authenticated editor: 3 tabs (items, config, embed), autosave | TreasureBox (dynamic), DrawerStylePicker, EmbedConfigurator, LoadingAnimation, firestore, contour, config |
| `src/app/embed/page.tsx` | 187 | Embeddable viewer: loads public box, postMessage frame sync | TreasureBox (dynamic), firestore, embedPosition |
| `src/app/layout.tsx` | 40 | Root layout: fonts, meta, theme flash-prevention script | providers, globals.css |
| `src/app/providers.tsx` | 12 | Wraps AuthProvider + ThemeProvider | AuthProvider, ThemeProvider |
| `src/app/editor/layout.tsx` | 5 | Editor route layout (auth wrapper) | AuthProvider |
| `src/app/embed/layout.tsx` | 17 | Embed layout: transparent body for iframes | globals.css |
| `src/app/prototype/loading/page.tsx` | 111 | Dev playground for LoadingAnimation | LoadingAnimation |

### API Routes (1 file, 359 lines)

| File | Lines | Role | Pipeline |
|------|------:|------|----------|
| `src/app/api/generate-box/route.ts` | 359 | Gemini sprite generation + Sharp processing + bg removal | Build prompt (boxStyles) -> Gemini API -> validate ratio -> remove bg (Vision API or chroma fallback) -> compute activeArea -> return base64 |

### Public Assets (1 file, 310 lines)

| File | Lines | Role |
|------|------:|------|
| `public/embed/widget.js` | 310 | Vanilla JS embed loader: creates iframe or fixed overlay, handles postMessage frame sync, pointer event management, DOM collision opt-in |

### Styling (1 file, 94 lines)

| File | Lines | Role |
|------|------:|------|
| `src/app/globals.css` | 94 | Tailwind v4 import, `--tb-*` CSS variables (dark/light), slider styling, transitions |

---

## Dependency Graph

```
layout.tsx
  └── providers.tsx
        ├── AuthProvider.tsx ── firebase.ts
        └── ThemeProvider.tsx

page.tsx (landing)
  ├── TreasureBox.tsx (dynamic) ──┐
  ├── firestore.ts ── firebase.ts │
  ├── useAuth (AuthProvider)      │
  └── useTheme (ThemeProvider)    │
                                  │
editor/page.tsx (hub: 8 imports)  │
  ├── TreasureBox.tsx (dynamic) ──┤
  ├── DrawerStylePicker.tsx       │
  │     ├── firestore.ts          │
  │     ├── config.ts ── types.ts │
  │     └── boxStyles.ts          │
  ├── EmbedConfigurator.tsx       │
  │     ├── firestore.ts          │
  │     └── config.ts             │
  ├── LoadingAnimation.tsx        │
  ├── firestore.ts                │
  ├── contour.ts                  │
  ├── config.ts                   │
  └── embedPosition.ts            │
                                  │
embed/page.tsx                    │
  ├── TreasureBox.tsx (dynamic) ──┘
  ├── firestore.ts          TreasureBox.tsx (hub: 5 imports)
  ├── embedPosition.ts        ├── sounds.ts (singleton)
  └── types.ts                 ├── contour.ts
                               ├── embedPosition.ts
                               ├── config.ts ── types.ts
                               └── StoryCard.tsx ── types.ts

api/generate-box/route.ts
  └── boxStyles.ts ── types.ts

ORPHAN (never imported):
  └── BoxDimensionEditor.tsx ── types.ts, config.ts

MARKED FOR REMOVAL:
  └── prototype/loading/page.tsx ── LoadingAnimation.tsx
```

---

## Complexity Hotspots

Ranked by simplification potential:

### 1. TreasureBox.tsx — 1,573 lines
The architectural core. Contains:
- 6-state drawer state machine (`IDLE -> HOVER_PEEK -> OPEN -> HOVER_CLOSE -> CLOSING -> SLAMMING`)
- Matter.js physics engine setup + custom canvas renderer (not Matter's built-in)
- Image preloading via blob URLs (CORS avoidance)
- Two rendering modes: AI sprite sheet OR dynamic ASCII art fallback
- Mobile accelerometer gravity support
- Long-press story overlay trigger
- Frame sync postMessage streaming for overlay embeds
- Item spawn animation with timed physics addition

**Extractable sub-modules:**
- ASCII drawer renderer -> separate file
- Drawer state machine -> custom hook (`useDrawerStateMachine`)
- Image preloader/blob management -> custom hook (`useImagePreloader`)
- Physics engine setup/teardown -> custom hook (`usePhysicsEngine`)

### 2. editor/page.tsx — 1,048 lines
Central editor with 3 tabs and 10 inline UI components:
- `VolumeBar`, `Slider`, `CfgGroup`, `CfgSection`, `CfgLabel`, `CfgHint`, `CfgToggle` — generic UI primitives defined inline
- `UnifiedPreview`, `MockWebsitePlaceholder` — preview rendering inline
- 15+ `useState` hooks in the main component
- Autosave logic with 1500ms debounce

**Known issues:**
- Line 990: `// TODO: Duplicates overlay widget-size slider from EmbedConfigurator — unify later`
- Lines 543, 547: Two "coming soon" placeholder labels for ambient/item-drop sounds

### 3. DrawerStylePicker.tsx — 666 lines
AI generation UI with many control groups: material (6), style pattern (5), colors (2 pickers), decorations (5 toggles + custom text), size (2 sliders), angle (3 options), ASCII preview, generation trigger, sprite preview, debug panel.

### 4. sounds.ts — 548 lines
18 private synthesis methods (6 presets x 3 sound types: collision, open, close). Each method manually creates oscillators, filters, envelopes using Web Audio API. Highly repetitive structure — prime candidate for data-driven refactoring.

### 5. EmbedConfigurator.tsx — 468 lines
Embed mode picker, size presets (S/M/L/Wide + custom), aspect ratio lock, overlay drag positioning, preview background (URL or screenshot upload), padding editor, embed code generation.

### 6. LoadingAnimation.tsx — 463 lines
Standalone Matter.js animation (independent physics engine). 3-state cycle: SPAWNING -> DRAINING -> RESETTING. Used as loading overlay during AI drawer generation.

### 7. BoxDimensionEditor.tsx — 407 lines (ORPHAN)
Exported but **never imported anywhere**. Edits box dimensions with live ASCII preview, handle/corner style selectors, rivet/keyhole toggles, per-state pullout sliders. This is confirmed dead code — `grep "BoxDimensionEditor"` returns only its own definition.

---

## Simplification Opportunities

### Phase 1: Dead Code Removal (zero risk, ~520 lines)

| Action | File | Lines | Detail |
|--------|------|------:|--------|
| Delete orphan component | `src/components/BoxDimensionEditor.tsx` | 407 | Never imported. Grep confirms zero references outside its own file. |
| Delete dev prototype | `src/app/prototype/loading/page.tsx` | 111 | Dev playground, not user-facing. `LoadingAnimation` stays (used by editor). |
| Remove "coming soon" stubs | `src/app/editor/page.tsx` lines 543, 547 | 2 | Placeholder labels for unimplemented ambient/item-drop sound features. |

### Phase 2: Sound System Simplification (~400 lines saved)

**Current:** 548 lines, 18 hand-coded synthesis methods (6 presets x 3 sound types).

**Proposed:** Refactor to data-driven preset configs. Define each preset as a config object (oscillator type, frequency range, duration, attack/decay envelope, filter) and use a single generic `playSynth(ctx, volume, config)` method.

- Could reduce from ~548 to ~150 lines
- Consider reducing presets: 6 + silent -> 3 + silent (e.g., metallic/wooden/pixel/silent) if the goal is UX simplification
- Update `SoundPreset` type in `types.ts` if presets are removed

### Phase 3: Editor Component Extraction

**Extract shared UI primitives** from `editor/page.tsx`:
- `CfgGroup`, `CfgSection`, `CfgLabel`, `CfgHint`, `CfgToggle` -> `src/components/ui/ConfigControls.tsx`
- `Slider`, `VolumeBar` -> `src/components/ui/Slider.tsx`

**Fix duplicated slider:**
- Line 990 TODO: overlay widget-size slider duplicates `EmbedConfigurator`. Unify into `EmbedConfigurator` only.

**Optional: extract tab content** into sub-components:
- Items tab (~125 lines) -> `src/components/editor/ItemsTab.tsx`
- Config tab (~240 lines) -> `src/components/editor/ConfigTab.tsx`
- Embed tab (~70 lines wrapper) -> keep inline (too small)

### Phase 4: TreasureBox Decomposition (optional, higher risk)

Only pursue after Phases 1-3 are complete and stable:
- Extract ASCII drawer renderer to `src/components/ASCIIDrawer.tsx`
- Extract state machine to `src/hooks/useDrawerStateMachine.ts`
- Extract image preloader to `src/hooks/useImagePreloader.ts`
- Extract physics setup to `src/hooks/usePhysicsEngine.ts`

### Phase 5: Config/Feature Consolidation

- Merge "item style" (brightness/contrast/tint) and "box identity" (label, owner name, background, visibility) into a single "Appearance" config section
- If any BoxDimensionEditor features are still wanted, absorb them as a collapsible "Advanced" section within DrawerStylePicker rather than restoring the separate component

---

## Cleanup Checklist

### Phase 1: Dead Code Removal
- [ ] Delete `src/components/BoxDimensionEditor.tsx`
- [ ] Delete `src/app/prototype/loading/page.tsx`
- [ ] Remove "coming soon" labels from editor (lines 543, 547)
- [ ] Verify build passes: `npm run build`

### Phase 2: Sound Simplification
- [ ] Refactor `sounds.ts` to data-driven preset configs
- [ ] Decide on preset count (keep 6 or reduce to 3)
- [ ] Update `SoundPreset` type in `types.ts` if presets removed
- [ ] Update sound preset selector in `editor/page.tsx`
- [ ] Test all remaining presets play correctly

### Phase 3: Editor Extraction
- [ ] Extract `CfgGroup`/`CfgSection`/`CfgLabel`/`CfgHint`/`CfgToggle` to shared file
- [ ] Extract `Slider` and `VolumeBar` to shared file
- [ ] Unify duplicated overlay widget-size slider (line 990 TODO)
- [ ] Optionally extract Items/Config tab content into sub-components
- [ ] Verify editor functionality end-to-end

### Phase 4: TreasureBox Decomposition (optional)
- [ ] Extract ASCII drawer renderer
- [ ] Extract state machine hook
- [ ] Extract image preloader hook
- [ ] Extract physics engine hook
- [ ] Full regression test of all drawer states + embed modes

### Phase 5: Config Consolidation
- [ ] Merge "item style" + "box identity" config groups
- [ ] Absorb needed dimension controls into DrawerStylePicker
- [ ] Remove deprecated `customPrompt` field handling (if old Firestore docs migrated)

---

## Data Model Reference

### BoxConfig (`boxes/{userId}`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | string | — | Same as userId |
| `ownerId` | string | — | Firebase Auth UID |
| `title` | string | `"my treasure box"` | Display title |
| `backgroundColor` | string | `"#1a1a18"` | Canvas background hex |
| `drawerLabel` | string | `""` | Text label on drawer |
| `maxItems` | number | `20` | Max items allowed |
| `soundEnabled` | boolean | `true` | Toggle collision sounds |
| `soundVolume` | number | `0.5` | 0-1 volume |
| `soundPreset` | SoundPreset | `"wooden"` | One of: metallic, wooden, glass, paper, pixel, clay, silent |
| `isPublic` | boolean | `false` | Show on junk shelf |
| `ownerName` | string? | — | Display name on box |
| `drawerImages` | DrawerImages? | — | AI-generated sprites (undefined = ASCII fallback) |
| `boxDimensions` | BoxDimensions? | — | Custom box proportions |
| `embedSettings` | EmbedSettings? | — | Embed mode, size, position |
| `itemCount` | number? | — | Cached item count |
| `drawerDisplaySize` | {w,h}? | `420x420` | Drawer frame pixel size |
| `contentScale` | number? | `1.0` | 0.5-2.0, scales drawer + items |
| `itemBrightness` | number? | `1.0` | 0.5-1.5 |
| `itemContrast` | number? | `1.0` | 0.5-1.5 |
| `itemTint` | string? | — | Hex color overlay |
| `createdAt` | number | — | Epoch ms |
| `updatedAt` | number | — | Epoch ms |

### TreasureItem (`boxes/{userId}/items/{itemId}`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `imageUrl` | string | Processed image (bg removed) |
| `originalImageUrl` | string | Original upload |
| `label` | string | Item name |
| `story` | string? | Story text (shown on long-press) |
| `link` | string? | External URL |
| `order` | number | Sort order |
| `rotation` | number? | Initial rotation degrees (-25 to 25) |
| `scale` | number? | Size multiplier (0.5-3.0, default 1) |
| `contourPoints` | {x,y}[]? | Normalized physics shape vertices |
| `createdAt` | number | Epoch ms |

### DrawerImages (embedded in BoxConfig)

| Field | Type | Notes |
|-------|------|-------|
| `urls` | Record<BoxState, string> | Legacy per-state URLs (old boxes) |
| `spriteUrl` | string? | New: single sprite sheet URL |
| `style` | DrawerStyle | Generation config for change detection |
| `generatedAt` | number | Epoch ms |
| `activeArea` | SpriteActiveArea? | Normalized bounding box of non-transparent content |

### Firestore Index Required
- Collection: `boxes`
- Fields: `isPublic ASC` + `updatedAt DESC`
- Firebase auto-prompts creation URL on first query

---

## Config Files Reference

| File | Purpose |
|------|---------|
| `app/tsconfig.json` | Strict mode, ES2017 target, `@/*` -> `src/*` path alias |
| `app/next.config.ts` | Remote image patterns (Firebase Storage, Google Storage) |
| `app/postcss.config.mjs` | Tailwind CSS v4 PostCSS plugin |
| `app/.env.local.example` | Environment variable placeholders |
| `cors.json` | Firebase Storage CORS rules (Vercel + localhost origins) |
