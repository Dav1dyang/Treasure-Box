# Treasure Box

An AI-powered, physics-driven interactive drawer widget. Upload photos of meaningful objects, attach stories and links, customize your drawer with Gemini-generated artwork, and embed it anywhere on the web.

## Features

- **AI-Generated Drawer Artwork** — Gemini creates 5-frame sprite sheets from 6 material presets (clay, metal, wood, pixel, paper, glass) with customizable styles, colors, and decorations
- **AI Style Suggestions** — Gemini 2.5 Flash dynamically generates unique aesthetic styles and decorative features for the drawer customizer
- **Physics-Driven Widget** — Matter.js powers realistic item tumbling with a 6-state drawer state machine, custom canvas rendering, and mobile accelerometer support
- **Embeddable Anywhere** — Drop your treasure box into any website via iframe or script tag, with configurable size, position, and overlay modes
- **Collision Sounds** — 6 synthesized audio presets (metallic, wooden, glass, paper, pixel, clay) built with the Web Audio API
- **Story Cards** — Long-press any item to reveal its story and external links in a modal overlay
- **Public Gallery** — Share your box on the community "junk shelf" for others to explore

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 + React 19 + TypeScript |
| AI | Gemini AI (`@google/genai`) — sprite generation + style suggestions |
| Physics | Matter.js — 2D physics engine |
| Backend | Firebase 12 — Auth (Google), Firestore, Storage |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Image Processing | Sharp (server-side), `@imgly/background-removal` (client-side) |
| Audio | Web Audio API — synthesized collision/open/close sounds |

## Gemini AI Integration

Treasure Box uses Google's Gemini AI in two ways:

**Drawer Artwork Generation** (`/api/generate-box`)
Gemini generates a 5-frame horizontal sprite sheet for the drawer based on user-selected material, style, color, and decoration preferences. The pipeline: prompt builder (`boxStyles.ts`) with 6 material presets and configurable styles → Gemini image generation → Sharp sprite slicing → background removal. Supports a green chroma key fallback. 120s server timeout.

**Dynamic Style Options** (`/api/generate-options`)
Gemini 2.5 Flash generates unique drawer aesthetic styles and decorative features on demand, keeping the customizer fresh with creative suggestions spanning different cultures, eras, and aesthetics.

## Quick Start

```bash
git clone <repo-url>
cd Treasure-Box/app
npm install
```

1. Set up Firebase and get your Gemini API key — see [Setup Guide](app/SETUP.md)
2. Copy environment variables:
   ```bash
   cp .env.local.example .env.local
   # Fill in Firebase config + GOOGLE_AI_STUDIO_KEY
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000

## Project Structure

```
app/                          ← Next.js root (Vercel root directory)
  src/
    app/                      ← App Router pages
      page.tsx                ← Landing page (hero demo + public gallery)
      editor/page.tsx         ← Authenticated editor (items, config, embed)
      embed/page.tsx          ← Embeddable viewer (iframe/script)
      box/[userId]/page.tsx   ← Public box viewer
      api/
        generate-box/         ← Gemini sprite sheet generation
        generate-options/     ← Gemini style/feature suggestions
    components/
      TreasureBox.tsx         ← Core widget (Matter.js physics + canvas)
      DrawerStylePicker.tsx   ← AI drawer customization UI
      EmbedConfigurator.tsx   ← Embed settings + code generation
    lib/
      boxStyles.ts            ← Gemini prompt builder
      sounds.ts               ← Web Audio collision engine
      firestore.ts            ← Firebase CRUD operations
  public/embed/widget.js      ← Vanilla JS embed loader
```

## Embedding

After deploying, go to `/editor` → **Embed** tab → copy the code.

**iframe:**
```html
<iframe src="https://your-app.vercel.app/embed?box=USER_ID"
  width="700" height="700" style="border:none"></iframe>
```

**Script tag:**
```html
<div id="treasure-box-embed"></div>
<script src="https://your-app.vercel.app/embed/widget.js"
  data-box-id="USER_ID"></script>
```

## Documentation

- [Setup Guide](app/SETUP.md) — Firebase, Gemini API key, deployment
- [Developer Guide](CLAUDE.md) — Architecture, data model, conventions
- [Tech Stack Audit](TECH_STACK.md) — Full file inventory, dependency graph, complexity analysis
