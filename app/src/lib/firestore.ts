import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, query, where, orderBy, updateDoc, limit,
  deleteField, increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getDb, getStorageInstance } from './firebase';
import type { TreasureItem, BoxConfig, BoxState, DrawerImages } from './types';
// Note: Firestore composite index needed: isPublic ASC + updatedAt DESC
// Firebase will auto-prompt the index creation URL on first query

// ===== Box Config =====

export async function getBoxConfig(userId: string): Promise<BoxConfig | null> {
  const snap = await getDoc(doc(getDb(), 'boxes', userId));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  // Backward compat: migrate old contentScale field name → boxScale
  if ('contentScale' in data && !('boxScale' in data)) {
    data.boxScale = data.contentScale;
    delete data.contentScale;
  }
  return data as BoxConfig;
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

export async function getPublicBoxesWithItems(limitCount = 20): Promise<{ config: BoxConfig; items: TreasureItem[] }[]> {
  const boxes = await getPublicBoxes(limitCount);
  const results = await Promise.all(
    boxes.map(async (config) => ({
      config,
      items: await getPublicItems(config.ownerId),
    }))
  );
  return results;
}

// ===== Public read (for embed) =====

export async function getPublicBoxConfig(boxId: string): Promise<BoxConfig | null> {
  const snap = await getDoc(doc(getDb(), 'boxes', boxId));
  return snap.exists() ? (snap.data() as BoxConfig) : null;
}

export async function getPublicItems(boxId: string): Promise<TreasureItem[]> {
  return getItems(boxId);
}
