/**
 * Who is using the webapp: Google sign-in (Firebase Auth), and their role from users/{email} (lower case):
 *   admin   everything
 *   shop    the shop team's grading page (#/qc) only: reads trees, varieties, harvests; reads and writes gradings
 * Anyone else signed in has no access. firestore.rules and storage.rules enforce the same; the WhatsApp bot and the
 * GitHub workflows use the service account, which the rules don't apply to. Admins add people on #/access.
 */
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type User } from 'firebase/auth';
import { clearIndexedDbPersistence, doc, onSnapshot, terminate } from 'firebase/firestore';
import { app, db } from './firebase';

export type Role = 'admin' | 'shop';
export const ROLES: Role[] = ['admin', 'shop'];

export const auth = getAuth(app);

export interface Session {
  status: 'loading' | 'signedOut' | 'signedIn';
  user?: User;
  /** Null when signed in without access. */
  role?: Role | null;
}

export const emailKey = (email: string) => email.trim().toLowerCase();

/** Signs in with Google: a popup, or a full-page redirect where popups are blocked (some phone browsers). */
export async function signIn(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e: any) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

/** Signs out and clears the farm data kept on this device, so the next person on it sees nothing of it. */
export async function signOut(): Promise<void> {
  await fbSignOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.error('Clearing the offline copy failed:', e);
  }
  location.hash = '#/';
  location.reload();
}

/** The signed-in person and their role, live (a role given or taken away applies at once). */
export function useSession(): Session {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);
  useEffect(() => {
    if (!user?.email) {
      setRole(user === null ? null : undefined);
      return;
    }
    setRole(undefined);
    return onSnapshot(
      doc(db, 'users', emailKey(user.email)),
      (s) => {
        const r = s.exists() ? s.data().role : null;
        setRole(ROLES.includes(r) && s.data()?.disabled !== true ? r : null);
      },
      (e) => {
        console.error('Role read failed:', e);
        setRole(null);
      }
    );
  }, [user]);
  if (user === undefined || (user && role === undefined)) return { status: 'loading' };
  if (!user) return { status: 'signedOut' };
  return { status: 'signedIn', user, role: role ?? null };
}
