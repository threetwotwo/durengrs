import { deleteDoc, deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Form, MarketPrice } from './market';

/** Corrects a price the bot read (vendor, variety, grade, price per kg). */
export async function updateMarketPrice(id: string, patch: Partial<Pick<MarketPrice, 'vendor' | 'varietyCode' | 'form' | 'grade' | 'pricePerKg'>>): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(patch)) data[k] = v === undefined || v === '' ? deleteField() : v;
  await updateDoc(doc(db, 'marketPrices', id), data);
}

export async function removeMarketPrice(id: string): Promise<void> {
  await deleteDoc(doc(db, 'marketPrices', id));
}

/** The store's own price per kg for a variety, whole (pricePerKg) or peeled (kupasPerKg); null takes it away. */
export async function setStorePrice(code: string, form: Form, perKg: number | null): Promise<void> {
  const field = form === 'kupas' ? 'kupasPerKg' : 'pricePerKg';
  await setDoc(doc(db, 'storePrices', code), { [field]: perKg === null ? deleteField() : perKg, updatedAt: serverTimestamp() }, { merge: true });
}
