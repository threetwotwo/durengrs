import { deleteDoc, deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { MarketPrice } from './market';

/** Corrects a price the bot read (vendor, variety, grade, price per kg). */
export async function updateMarketPrice(id: string, patch: Partial<Pick<MarketPrice, 'vendor' | 'varietyCode' | 'grade' | 'pricePerKg'>>): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(patch)) data[k] = v === undefined || v === '' ? deleteField() : v;
  await updateDoc(doc(db, 'marketPrices', id), data);
}

export async function removeMarketPrice(id: string): Promise<void> {
  await deleteDoc(doc(db, 'marketPrices', id));
}

/** The store's own price per kg for a variety (null: none). */
export async function setStorePrice(code: string, pricePerKg: number | null): Promise<void> {
  if (pricePerKg === null) return void (await deleteDoc(doc(db, 'storePrices', code)));
  await setDoc(doc(db, 'storePrices', code), { pricePerKg, updatedAt: serverTimestamp() });
}
