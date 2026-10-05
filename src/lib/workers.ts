import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/** A field worker: the WhatsApp number the bot sees, and the name the owner knows them by. */
export interface Worker {
  /** Digits only, international form as WhatsApp sends it (e.g. 628111886551). Also the document id. */
  phone: string;
  name: string;
}

export const WORKER_NAME_MAX = 40;

/** "0811-188-6551", "+62 811 188 6551" or "8111886551" -> "628111886551" (Indonesian numbers by default). */
export function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8') && d.length <= 12) d = '62' + d;
  return d;
}

export function checkWorker(v: { phone: string; name: string }, existing: Worker[], editing?: string) {
  const errors: Partial<Record<'phone' | 'name', string>> = {};
  const phone = normalizePhone(v.phone);
  if (phone.length < 10 || phone.length > 15) errors.phone = 'wk.e.phone';
  else if (phone !== editing && existing.some((w) => w.phone === phone)) errors.phone = 'wk.e.exists';
  const name = v.name.trim();
  if (!name) errors.name = 'wk.e.name';
  else if (name.length > WORKER_NAME_MAX) errors.name = 'wk.e.nameLong';
  return { phone, name, errors };
}

export async function saveWorker(w: Worker): Promise<void> {
  await setDoc(doc(db, 'workers', w.phone), { phone: w.phone, name: w.name.trim(), updatedAt: serverTimestamp() });
}

export async function removeWorker(phone: string): Promise<void> {
  await deleteDoc(doc(db, 'workers', phone));
}

/** "••••6551" for a number nobody has named yet. */
export const maskDigits = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : phone;
};

/** The worker's name when known, otherwise the masked number (or the text as given, e.g. a name typed in the webapp). */
export function workerLabel(byPhone: Map<string, string>, who?: string): string {
  if (!who) return '';
  const digits = who.replace(/\D/g, '');
  if (digits.length < 8) return who; // a name typed by hand, not a phone number
  return byPhone.get(digits) || maskDigits(who);
}
