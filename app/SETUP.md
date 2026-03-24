# Treasure Box — Setup Guide

## 1. Firebase Setup (Free Tier)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (disable Analytics if you want)
3. Enable these services:

### Authentication
- Go to **Authentication > Sign-in method**
- Enable **Google** provider

### Firestore
- Go to **Firestore Database**
- Create database in **production mode**
- Set these security rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Owner can read/write their box
    match /boxes/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;

      match /items/{itemId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### Storage
- Go to **Storage**
- Set these security rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /boxes/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Storage CORS (Required for images on Vercel)

Firebase Storage blocks cross-origin requests by default. You must set CORS headers so the deployed app can fetch images as blobs (needed for canvas rendering).

1. Install `gsutil` via the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. From the **repo root** (not `app/`), run:
   ```bash
   gsutil cors set cors.json gs://YOUR_BUCKET_NAME.appspot.com
   ```
   Replace `YOUR_BUCKET_NAME` with your Firebase project's storage bucket (found in Firebase Console > Storage).

3. If you deploy to a custom domain, update `cors.json` to include that origin.

### Firestore Composite Index (Required for junk shelf)

The junk shelf query requires a composite index on the `boxes` collection:
- Field 1: `isPublic` — Ascending
- Field 2: `updatedAt` — Descending

Firebase will auto-prompt the index creation URL in the browser console on first query failure. Click the link to create it, or create it manually in Firebase Console > Firestore > Indexes.

### Get Config Values
- Go to **Project Settings > General > Your apps**
- Click "Add app" > Web
- Copy the config values

## 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Firebase values:

```bash
cp .env.local.example .env.local
```

## 3. Google Cloud Vision (Optional — for background removal)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Cloud Vision API**
3. Create an API key
4. Add it to `.env.local` as `GOOGLE_CLOUD_VISION_API_KEY`

Free tier: 1,000 units/month

## 4. Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## 5. Deploy to Vercel

1. Push to GitHub
2. Import in [Vercel](https://vercel.com/new)
3. Set root directory to `app`
4. Add all environment variables from `.env.local`
5. Deploy

## 6. Embed on Your Website

After deploying, go to `/editor` → **embed** tab → copy the iframe or script code.

### iframe
```html
<iframe src="https://your-app.vercel.app/embed?box=YOUR_USER_ID"
  width="700" height="700" style="border:none"></iframe>
```

### Script
```html
<div id="treasure-box-embed"></div>
<script src="https://your-app.vercel.app/embed/widget.js"
  data-box-id="YOUR_USER_ID"></script>
```
