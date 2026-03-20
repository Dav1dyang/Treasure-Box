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
