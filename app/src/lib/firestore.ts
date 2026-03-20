import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, query, where, orderBy, updateDoc, limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getDb, getStorageInstance } from './firebase';
import type { TreasureItem, BoxConfig, BoxState, DrawerImages } from './types';
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
  });
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

export async function saveItem(boxId: string, item: TreasureItem): Promise<void> {
  await setDoc(doc(getDb(), 'boxes', boxId, 'items', item.id), item);
}

export async function deleteItem(boxId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'boxes', boxId, 'items', itemId));
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
  // Firestore doesn't support deleting fields with updateDoc easily,
  // so we set it to null (treated as undefined on read)
  await updateDoc(doc(getDb(), 'boxes', userId), {
    drawerImages: null,
    updatedAt: Date.now(),
  });
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
  const boxes = await getPublicBoxes();
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
