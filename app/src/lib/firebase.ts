import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// Must use literal process.env.NEXT_PUBLIC_* references — Next.js inlines these
// at build time and does NOT support dynamic process.env[key] lookups.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

function hasValidConfig(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId &&
    firebaseConfig.apiKey !== 'placeholder'
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let initWarned = false;
const googleProvider = new GoogleAuthProvider();

function getFirebaseApp() {
  if (app) return { app, auth: auth!, db: db!, storage: storage! };

  if (!hasValidConfig()) {
    if (!initWarned) {
      initWarned = true;
      console.warn(
        'Firebase: missing or placeholder env vars — Firebase features will be unavailable. ' +
        'Set NEXT_PUBLIC_FIREBASE_* environment variables to enable Firebase.'
      );
    }
    return null;
  }

  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  return { app, auth, db, storage };
}

const MISSING_CONFIG_ERROR =
  'Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.';

// Lazy init — only fails when actually used, not at import time
export { googleProvider };

// Nullable accessor for Auth — AuthProvider handles null gracefully
export const getAuthInstance = (): Auth | null => getFirebaseApp()?.auth ?? null;

// Throwing accessors for Firestore/Storage — produce a clear error instead of
// the cryptic "Cannot read properties of undefined (reading 'payload')"
export function getDb(): Firestore {
  const result = getFirebaseApp();
  if (!result) throw new Error(MISSING_CONFIG_ERROR);
  return result.db;
}

export function getStorageInstance(): FirebaseStorage {
  const result = getFirebaseApp();
  if (!result) throw new Error(MISSING_CONFIG_ERROR);
  return result.storage;
}
