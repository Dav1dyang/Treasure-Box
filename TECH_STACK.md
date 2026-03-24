# Treasure Box — Tech Stack & File Audit

> **Purpose:** Reference document for UI/UX simplification. Catalogs every file, dependency, and architectural detail. Identifies complexity hotspots and actionable cleanup opportunities.
>
> **Last updated:** 2026-03-24

## Project Snapshot

Treasure Box is a Next.js 16 web app where users create physics-driven "treasure boxes" — upload photos, attach stories, and embed an interactive drawer widget anywhere on the web. Items tumble inside a Matter.js-powered drawer with collision sounds and AI-generated artwork via Gemini.

- **Stack:** Next.js 16 + React 19 + Tailwind CSS 4 + Firebase 12 + Matter.js + Gemini AI
- **Source files:** 25 files (.ts/.tsx), ~7,911 lines (excluding CSS/config)
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

### AI & Image Processing

| Package | Version | Purpose | Used by |
|---------|---------|---------|---------|
| `@google/genai` | ^1.46.0 | Gemini API client (sprite generation + style suggestions) | api/generate-box/route.ts, api/generate-options/route.ts |
| `sharp` | ^0.34.5 | Server-side image processing (sprite slicing) | api/generate-box/route.ts |
| `@imgly/background-removal` | ^1.7.0 | Client-side WASM background removal | editor/page.tsx |

### Physics & Rendering

| Package | Version | Purpose | Used by |
|---------|---------|---------|---------|
| `matter-js` | ^0.20.0 | 2D physics engine (dynamic import, SSR disabled) | TreasureBox.tsx, LoadingAnimation.tsx |
| `@types/matter-js` | ^0.20.2 | TypeScript definitions for Matter.js | TreasureBox.tsx, LoadingAnimation.tsx |
| `chroma-js` | ^3.2.0 | Color manipulation (OKLab mixing for animations) | LoadingAnimation.tsx |

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
`GOOGLE_AI_STUDIO_KEY` — Gemini API for sprite generation and style suggestions

**Optional:**
`GOOGLE_CLOUD_VISION_API_KEY` — Vision API for object contour detection (falls back to chroma key)

---

## File Inventory

### Library Layer (8 files, 1,524 lines)

| File | Lines | Role | Imports from | Imported by |
|------|------:|------|-------------|-------------|
| `src/lib/types.ts` | 156 | Shared type definitions (BoxConfig, TreasureItem, DrawerStyle, EmbedSettings, etc.) | — | Nearly every file |
| `src/lib/config.ts` | 135 | Default values, preset arrays, tunable constants | types | Nearly every file |
| `src/lib/firebase.ts` | 75 | Lazy Firebase init (Auth, Firestore, Storage) | — | firestore, AuthProvider |
| `src/lib/firestore.ts` | 239 | All Firestore/Storage CRUD (boxes, items, images, drawer sprites) | firebase, types | DrawerStylePicker, EmbedConfigurator, editor, embed, landing, box/[userId] |
| `src/lib/sounds.ts` | 516 | Web Audio API collision/open/close sound engine, 6 presets | — | TreasureBox |
| `src/lib/boxStyles.ts` | 152 | Gemini prompt builder: 6 material presets, style map, decoration options | types, config | generate-box/route, DrawerStylePicker |
| `src/lib/contour.ts` | 180 | Alpha-channel contour extraction for physics shapes | — | TreasureBox, editor |
| `src/lib/embedPosition.ts` | 71 | Overlay positioning math (anchor corners, viewport scaling) | types | TreasureBox, editor, embed |

### Components (7 files, 3,969 lines)

| File | Lines | Role | Imports from | Imported by |
|------|------:|------|-------------|-------------|
| `src/components/TreasureBox.tsx` | 2,185 | Core widget: Matter.js physics, 6-state drawer state machine, canvas rendering, sprite + ASCII modes, long-press stories, frame sync | sounds, contour, embedPosition, config, types, StoryCard | landing, editor, embed, box/[userId] (dynamic import) |
| `src/components/DrawerStylePicker.tsx` | 706 | AI drawer generation UI: material/style/color/decor pickers, ASCII preview, generation trigger | firestore, config, types | editor |
| `src/components/LoadingAnimation.tsx` | 473 | Matter.js loading animation: spawning/draining colored boxes | matter-js, chroma-js | editor |
| `src/components/EmbedConfigurator.tsx` | 352 | Embed settings UI: mode toggle, size presets, position drag, preview background, code generation | firestore, config, types | editor |
| `src/components/StoryCard.tsx` | 135 | Modal overlay for item story display (image, label, story, link) | types | TreasureBox |
| `src/components/AuthProvider.tsx` | 63 | Firebase auth context (Google sign-in/out, auth state) | firebase | providers, landing, editor |
| `src/components/ThemeProvider.tsx` | 55 | Dark/light theme context (localStorage, system preference) | — | providers, landing, editor |

### Pages & Layouts (8 files, 1,946 lines)

| File | Lines | Role | Key imports |
|------|------:|------|-------------|
| `src/app/page.tsx` | 444 | Landing: hero demo box, junk shelf, auth UI | TreasureBox (dynamic), firestore, AuthProvider, ThemeProvider |
| `src/app/editor/page.tsx` | 936 | Authenticated editor: 3 tabs (items, config, embed), autosave | TreasureBox (dynamic), DrawerStylePicker, EmbedConfigurator, LoadingAnimation, firestore, contour, config |
| `src/app/box/[userId]/page.tsx` | 298 | Public box viewer: loads any user's public box | TreasureBox (dynamic), firestore, ThemeProvider |
| `src/app/embed/page.tsx` | 202 | Embeddable viewer: loads public box, postMessage frame sync | TreasureBox (dynamic), firestore, embedPosition |
| `src/app/layout.tsx` | 42 | Root layout: fonts, meta, theme flash-prevention script | providers, globals.css |
| `src/app/providers.tsx` | 12 | Wraps AuthProvider + ThemeProvider | AuthProvider, ThemeProvider |
| `src/app/editor/layout.tsx` | 5 | Editor route layout (auth wrapper) | AuthProvider |
| `src/app/embed/layout.tsx` | 7 | Embed layout: transparent body for iframes | globals.css |

### API Routes (2 files, 472 lines)

| File | Lines | Role | Pipeline |
|------|------:|------|----------|
| `src/app/api/generate-box/route.ts` | 386 | Gemini sprite generation + Sharp processing + bg removal | Build prompt (boxStyles) → Gemini API → validate ratio → remove bg (chroma key or Vision API fallback) → compute activeArea → return base64 |
| `src/app/api/generate-options/route.ts` | 86 | Gemini 2.5 Flash style/feature suggestions | Seed-based prompt → Gemini API → JSON parse → return styles + features |

### Public Assets (1 file, 1,037 lines)

| File | Lines | Role |
|------|------:|------|
| `public/embed/widget.js` | 1,037 | Vanilla JS embed loader: creates iframe or fixed overlay, handles postMessage frame sync, pointer event management, DOM collision opt-in |

### Styling (1 file, 142 lines)

| File | Lines | Role |
|------|------:|------|
| `src/app/globals.css` | 142 | Tailwind v4 import, `--tb-*` CSS variables (dark/light), slider styling, transitions |

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
box/[userId]/page.tsx             │
  ├── TreasureBox.tsx (dynamic) ──┤
  ├── firestore.ts                │
  └── ThemeProvider.tsx            │
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
  └── boxStyles.ts ── types.ts, config.ts

api/generate-options/route.ts
  └── (standalone — @google/genai only)
```

---

## Complexity Hotspots

Ranked by size:

### 1. TreasureBox.tsx — 2,185 lines
The architectural core. Contains:
- 6-state drawer state machine (`IDLE → HOVER_PEEK → OPEN → HOVER_CLOSE → CLOSING → SLAMMING`)
- Matter.js physics engine setup + custom canvas renderer (not Matter's built-in)
- Image preloading via blob URLs (CORS avoidance)
- Two rendering modes: AI sprite sheet OR dynamic ASCII art fallback
- Mobile accelerometer gravity support
- Long-press story overlay trigger
- Frame sync postMessage streaming for overlay embeds
- Item spawn animation with timed physics addition

**Extractable sub-modules:**
- ASCII drawer renderer → separate file
- Drawer state machine → custom hook (`useDrawerStateMachine`)
- Image preloader/blob management → custom hook (`useImagePreloader`)
- Physics engine setup/teardown → custom hook (`usePhysicsEngine`)

### 2. editor/page.tsx — 936 lines
Central editor with 3 tabs and inline UI components:
- `VolumeBar`, `Slider`, `CfgGroup`, `CfgSection`, `CfgLabel`, `CfgHint`, `CfgToggle` — generic UI primitives defined inline
- `UnifiedPreview`, `MockWebsitePlaceholder` — preview rendering inline
- 15+ `useState` hooks in the main component
- Autosave logic with 1500ms debounce

### 3. DrawerStylePicker.tsx — 706 lines
AI generation UI with many control groups: material (6), style pattern (5+), colors (2 pickers), decorations (5 toggles + custom text), size (2 sliders), angle (3 options), ASCII preview, generation trigger, sprite preview, debug panel.

### 4. sounds.ts — 516 lines
18 private synthesis methods (6 presets x 3 sound types: collision, open, close). Each method manually creates oscillators, filters, envelopes using Web Audio API. Highly repetitive structure — prime candidate for data-driven refactoring.

### 5. LoadingAnimation.tsx — 473 lines
Standalone Matter.js animation (independent physics engine). 3-state cycle: SPAWNING → DRAINING → RESETTING. Used as loading overlay during AI drawer generation.

### 6. EmbedConfigurator.tsx — 352 lines
Embed mode picker, size presets (S/M/L/Wide + custom), aspect ratio lock, overlay drag positioning, preview background (URL or screenshot upload), padding editor, embed code generation.

---

## Simplification Opportunities

### Phase 1: Dead Code Removal (done)

- [x] Delete `src/components/BoxDimensionEditor.tsx` (was 407 lines, orphan — never imported)
- [x] Delete `src/app/prototype/loading/page.tsx` (was 111 lines, dev playground)

### Phase 2: Sound System Simplification (~350 lines saved)

**Current:** 516 lines, 18 hand-coded synthesis methods (6 presets x 3 sound types).

**Proposed:** Refactor to data-driven preset configs. Define each preset as a config object (oscillator type, frequency range, duration, attack/decay envelope, filter) and use a single generic `playSynth(ctx, volume, config)` method.

- Could reduce from ~516 to ~150 lines
- Consider reducing presets: 6 + silent → 3 + silent (e.g., metallic/wooden/pixel/silent) if the goal is UX simplification
- Update `SoundPreset` type in `types.ts` if presets removed

### Phase 3: Editor Component Extraction

**Extract shared UI primitives** from `editor/page.tsx`:
- `CfgGroup`, `CfgSection`, `CfgLabel`, `CfgHint`, `CfgToggle` → `src/components/ui/ConfigControls.tsx`
- `Slider`, `VolumeBar` → `src/components/ui/Slider.tsx`

**Optional: extract tab content** into sub-components:
- Items tab → `src/components/editor/ItemsTab.tsx`
- Config tab → `src/components/editor/ConfigTab.tsx`
- Embed tab → keep inline (too small)

### Phase 4: TreasureBox Decomposition (optional, higher risk)

Only pursue after Phases 2-3 are complete and stable:
- Extract ASCII drawer renderer to `src/components/ASCIIDrawer.tsx`
- Extract state machine to `src/hooks/useDrawerStateMachine.ts`
- Extract image preloader to `src/hooks/useImagePreloader.ts`
- Extract physics setup to `src/hooks/usePhysicsEngine.ts`

### Phase 5: Config/Feature Consolidation

- Merge "item style" (brightness/contrast/tint) and "box identity" (label, owner name, background, visibility) into a single "Appearance" config section

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
| `spriteUrl` | string? | Single sprite sheet URL |
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
| `app/tsconfig.json` | Strict mode, ES2017 target, `@/*` → `src/*` path alias |
| `app/next.config.ts` | Remote image patterns (Firebase Storage, Google Storage) |
| `app/postcss.config.mjs` | Tailwind CSS v4 PostCSS plugin |
| `app/.env.local.example` | Environment variable placeholders |
| `cors.json` | Firebase Storage CORS rules (Vercel + localhost origins) |
