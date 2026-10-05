import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeTimestamp } from '../context/FarmContext';
import { DEFAULT_LABEL_RULES, mergeLabelRules, type LabelRules } from '../shared';

/**
 * The owner's label and dose rules, stored in `farmMeta/labelRules` (the bot reads the same document through
 * `mergeLabelRules`). Missing document = the values found in his sheet.
 */
const REF = () => doc(db, 'farmMeta', 'labelRules');

export interface StoredLabelRules {
  rules: LabelRules;
  /** A saved document exists (otherwise the sheet's values are in use). */
  saved: boolean;
  updatedBy?: string;
  updatedAt?: number;
  loading: boolean;
}

export function useLabelRules(): StoredLabelRules {
  const [state, setState] = useState<StoredLabelRules>({ rules: DEFAULT_LABEL_RULES, saved: false, loading: true });
  useEffect(
    () =>
      onSnapshot(
        REF(),
        (snap) => {
          const data = snap.exists() ? snap.data() : null;
          setState({
            rules: mergeLabelRules(data),
            saved: !!data,
            updatedBy: typeof data?.updatedBy === 'string' ? data.updatedBy : undefined,
            updatedAt: data?.updatedAt ? normalizeTimestamp(data.updatedAt) || undefined : undefined,
            loading: false,
          });
        },
        (err) => {
          console.error('Label rules load failed:', err);
          setState((s) => ({ ...s, loading: false }));
        }
      ),
    []
  );
  return state;
}

/** Save the whole rule set; the values it replaces are kept in `previous`, so one change can be undone by hand. */
export async function saveLabelRules(rules: LabelRules, previous: LabelRules, by?: string) {
  await setDoc(REF(), { ...rules, previous, updatedAt: serverTimestamp(), ...(by ? { updatedBy: by } : {}) });
}
