# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Treasure Box is an interactive web app where users create personalized "treasure boxes" — upload photos of meaningful objects, attach stories and links, and embed a physics-driven drawer widget anywhere on the web. Items tumble realistically inside a drawer powered by Matter.js, with collision sounds and AI-generated drawer artwork via Gemini.

## Repository Structure

The Next.js app lives in the `app/` subdirectory (not the repo root). All commands must be run from `app/`.

```
app/                        ← Next.js root (set as Vercel root directory)
  src/
    app/                    ← App Router pages
      page.tsx              ← Landing page with hero demo box + public gallery
      editor/page.tsx       ← Authenticated editor (items, config, embed codes)
      embed/page.tsx        ← Embeddable viewer (loaded via iframe/script)
      api/
        generate-box/       ← Gemini AI sprite sheet generation + bg removal
        remove-bg/          ← Server-side background removal + Vision API contours
    components/
      TreasureBox.tsx       ← Core widget: Matter.js physics, canvas rendering, drawer state machine
      DrawerStylePicker.tsx ← AI drawer style configuration UI
      StoryCard.tsx         ← Long-press story overlay
      AuthProvider.tsx      ← Firebase Google Auth context
      ThemeProvider.tsx      ← Dark/light theme context
    lib/
      firebase.ts           ← Firebase lazy init (Auth, Firestore, Storage)
      firestore.ts          ← All Firestore/Storage CRUD operations
      types.ts              ← Shared types (BoxConfig, TreasureItem, DrawerStyle, etc.)
      boxStyles.ts          ← Gemini prompt builder for sprite sheet generation
      contour.ts            ← Alpha-channel contour extraction for physics shapes
      sounds.ts             ← Web Audio API collision sound engine
  public/embed/widget.js    ← Embeddable script tag loader
  prototypes/               ← Static HTML design explorations (not part of the app)
```

## Development Commands

```bash
cd app
npm install
npm run dev          # Next.js dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint
```

## Architecture Notes

**All pages are client-side** (`'use client'`). The app uses Firebase client SDK directly from components — there is no server-side data fetching layer for reads. Firestore security rules enforce auth at the database level.

**TreasureBox component** is the centerpiece — a ~790-line component containing:
- A 5-state drawer state machine: `IDLE → HOVER_PEEK → OPEN → HOVER_CLOSE → SLAMMING`
- Matter.js physics engine with custom canvas rendering (not Matter's built-in renderer)
- Image preloading via blob URLs to avoid CORS canvas tainting
- Mobile accelerometer support for gravity changes
- Two drawer renderers: AI-generated image sprites OR dynamic ASCII art fallback (`DynamicASCIIBox`)

**AI drawer generation** (`/api/generate-box`) generates a 5-frame horizontal sprite sheet via Gemini, splits it with Sharp, and removes backgrounds with `@imgly/background-removal-node`. The `maxDuration` is set to 120s.

**Data model**: Each user has one box (`boxes/{userId}`) with a subcollection of items (`boxes/{userId}/items/{itemId}`). Box configs store drawer images as base64-uploaded PNGs in Firebase Storage.

**Theming** uses CSS custom properties (`--tb-*`) toggled via `data-theme` attribute on `<html>`, with a flash-prevention inline script in the root layout.

## Environment Variables

Required Firebase config (see `.env.local.example`):
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`

Server-side API keys:
- `GOOGLE_AI_STUDIO_KEY` — Gemini API for drawer sprite generation
- `GOOGLE_CLOUD_VISION_API_KEY` — (optional) object contour detection for physics shapes

## Key Dependencies

- **Matter.js** — 2D physics engine (dynamically imported, SSR disabled)
- **Sharp** — server-side image processing (sprite sheet slicing)
- **@imgly/background-removal-node** — ML-based bg removal (WASM, server-side)
- **@google/generative-ai** — Gemini API client
- **Firebase** v12 — Auth (Google), Firestore, Storage

## Firestore Index

A composite index is needed: `isPublic ASC + updatedAt DESC` on the `boxes` collection. Firebase auto-prompts the creation URL on first query.
