import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, query, where, orderBy, updateDoc, limit,
  deleteField, increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getDb, getStorageInstance } from './firebase';
import type { TreasureItem, BoxConfig, BoxState, DrawerImages, GeneratedSounds } from './types';
// Note: Firestore composite index needed: isPublic ASC + updatedAt DESC
// Firebase will auto-prompt the index creation URL on first query

// ===== Box Config =====

export async function getBoxConfig(userId: string): Promise<BoxConfig | null> {
  const snap = await getDoc(doc(getDb(), 'boxes', userId));
  return snap.exists() ? (snap.data() as BoxConfig) : null;
}

export async function saveBoxConfig(config: BoxConfig): Promise<void> {
  await setDoc(doc(getDb(), 'boxes', config.ownerId), {
    ...config,
    updatedAt: Date.now(),
  }, { merge: true });
}

// ===== Items =====

export async function getItems(boxId: string): Promise<TreasureItem[]> {
  const q = query(
    collection(getDb(), 'boxes', boxId, 'items'),
    orderBy('order', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TreasureItem));
}

export async function saveItem(boxId: string, item: TreasureItem, isNew = false): Promise<void> {
  await setDoc(doc(getDb(), 'boxes', boxId, 'items', item.id), item);
  if (isNew) {
    await updateDoc(doc(getDb(), 'boxes', boxId), {
      itemCount: increment(1),
      updatedAt: Date.now(),
    });
  }
}

export async function deleteItem(boxId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'boxes', boxId, 'items', itemId));
}

export async function deleteItemWithCleanup(userId: string, itemId: string): Promise<void> {
  // Delete both storage images (original + processed), tolerating missing files
  await Promise.allSettled([
    deleteImage(`boxes/${userId}/${itemId}_original`),
    deleteImage(`boxes/${userId}/processed_${itemId}`),
  ]);
  await deleteDoc(doc(getDb(), 'boxes', userId, 'items', itemId));
  // Decrement itemCount on the box document
  await updateDoc(doc(getDb(), 'boxes', userId), {
    itemCount: increment(-1),
    updatedAt: Date.now(),
  });
}

// ===== Image Upload =====

export async function uploadImage(
  userId: string,
  file: File,
  filename: string
): Promise<string> {
  const storageRef = ref(getStorageInstance(), `boxes/${userId}/${filename}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadProcessedImage(
  userId: string,
  blob: Blob,
  filename: string
): Promise<string> {
  const storageRef = ref(getStorageInstance(), `boxes/${userId}/processed_${filename}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function deleteImage(path: string): Promise<void> {
  try {
    const storageRef = ref(getStorageInstance(), path);
    await deleteObject(storageRef);
  } catch {
    // Image may already be deleted
  }
}

// ===== Drawer Image Upload =====

export async function uploadDrawerImage(
  userId: string,
  state: BoxState,
  base64Data: string,
): Promise<string> {
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' });
  const storageRef = ref(getStorageInstance(), `boxes/${userId}/drawer/${state}.png`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function uploadSpriteSheet(
  userId: string,
  base64Data: string,
): Promise<string> {
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' });
  const storageRef = ref(getStorageInstance(), `boxes/${userId}/drawer/sprite.png`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function saveDrawerImages(
  userId: string,
  drawerImages: DrawerImages,
): Promise<void> {
  await updateDoc(doc(getDb(), 'boxes', userId), {
    drawerImages,
    updatedAt: Date.now(),
  });
}

export async function clearDrawerImages(userId: string): Promise<void> {
  // Clean up drawer images from Storage
  const drawerStates: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];
  await Promise.allSettled([
    deleteImage(`boxes/${userId}/drawer/sprite.png`),
    ...drawerStates.map(s => deleteImage(`boxes/${userId}/drawer/${s}.png`)),
  ]);
  // Remove the field entirely from Firestore (not just null)
  await updateDoc(doc(getDb(), 'boxes', userId), {
    drawerImages: deleteField(),
    updatedAt: Date.now(),
  });
}

// ===== Generated Sound Upload =====

export async function uploadGeneratedSound(
  userId: string,
  soundType: string,
  base64Data: string,
  mimeType: string,
): Promise<string> {
  const ext = mimeType.includes('wav') ? 'wav' : 'bin';
  // Gemini may return raw PCM (audio/L16) — wrap it in a WAV container for browser playback
  let bytes: Uint8Array;
  if (mimeType.startsWith('audio/L16') || mimeType.startsWith('audio/pcm')) {
    const rateMatch = mimeType.match(/rate=(\d+)/);
    const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
    const raw = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    bytes = wrapPcmAsWav(raw, sampleRate);
  } else {
    bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  }
  const blob = new Blob([new Uint8Array(bytes) as BlobPart], { type: 'audio/wav' });
  const storageRef = ref(getStorageInstance(), `boxes/${userId}/sounds/${soundType}.${ext}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/** Wrap raw PCM 16-bit LE mono samples in a minimal WAV header */
function wrapPcmAsWav(pcmData: Uint8Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // sub-chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmData, headerSize);
  return wavBytes;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export async function saveGeneratedSounds(
  userId: string,
  sounds: GeneratedSounds,
): Promise<void> {
  await updateDoc(doc(getDb(), 'boxes', userId), {
    generatedSounds: sounds,
    updatedAt: Date.now(),
  });
}

export async function clearGeneratedSounds(userId: string): Promise<void> {
  await Promise.allSettled([
    deleteImage(`boxes/${userId}/sounds/collision.wav`),
    deleteImage(`boxes/${userId}/sounds/collision.bin`),
    deleteImage(`boxes/${userId}/sounds/drawer-open.wav`),
    deleteImage(`boxes/${userId}/sounds/drawer-open.bin`),
    deleteImage(`boxes/${userId}/sounds/drawer-close.wav`),
    deleteImage(`boxes/${userId}/sounds/drawer-close.bin`),
  ]);
  await updateDoc(doc(getDb(), 'boxes', userId), {
    generatedSounds: deleteField(),
    updatedAt: Date.now(),
  });
}

// ===== Box Deletion =====

export async function deleteBox(userId: string): Promise<void> {
  // 1. Fetch all items and delete their Storage files
  const allItems = await getItems(userId);
  await Promise.allSettled(
    allItems.flatMap(item => [
      deleteImage(`boxes/${userId}/${item.id}_original`),
      deleteImage(`boxes/${userId}/processed_${item.id}`),
    ])
  );
  // 2. Delete drawer Storage files
  const drawerStates: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];
  await Promise.allSettled([
    deleteImage(`boxes/${userId}/drawer/sprite.png`),
    ...drawerStates.map(s => deleteImage(`boxes/${userId}/drawer/${s}.png`)),
  ]);
  // 3. Delete all item subcollection docs
  await Promise.allSettled(
    allItems.map(item => deleteDoc(doc(getDb(), 'boxes', userId, 'items', item.id)))
  );
  // 4. Delete the box document itself
  await deleteDoc(doc(getDb(), 'boxes', userId));
}

// ===== Public Gallery =====

export async function getPublicBoxes(limitCount = 50): Promise<BoxConfig[]> {
  const q = query(
    collection(getDb(), 'boxes'),
    where('isPublic', '==', true),
    orderBy('updatedAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as BoxConfig);
}

export async function getRandomPublicBox(): Promise<{ config: BoxConfig; items: TreasureItem[] } | null> {
  const boxes = await getPublicBoxes(10);
  if (boxes.length === 0) return null;
  const config = boxes[Math.floor(Math.random() * boxes.length)];
  const items = await getPublicItems(config.ownerId);
  return { config, items };
}

// ===== Public read (for embed) =====

export async function getPublicBoxConfig(boxId: string): Promise<BoxConfig | null> {
  const snap = await getDoc(doc(getDb(), 'boxes', boxId));
  return snap.exists() ? (snap.data() as BoxConfig) : null;
}

export async function getPublicItems(boxId: string): Promise<TreasureItem[]> {
  return getItems(boxId);
}
