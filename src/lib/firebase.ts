import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  writeBatch,
  deleteField,
  serverTimestamp,
  collection,
  getCountFromServer,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  DocumentSnapshot,
  startAfter,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { DurianTree, DurianVariant, ReportPhoto, TreeCondition, TreeReport } from '../types';
import rawConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initialize Firebase App
export const app: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(rawConfig);

// Connect to default Firestore database
export const db: Firestore = getFirestore(app);

/** Cloud Storage (report photos). */
export const storage: FirebaseStorage = getStorage(app);
// Give up quickly on a bad connection instead of retrying for 2 minutes with a spinner on screen.
storage.maxOperationRetryTime = 15000;

export const activeProjectId = rawConfig.projectId || 'duren-db';

/**
 * Normalizes photo representations from WhatsApp bot submissions.
 * Automatically wraps raw base64 strings into valid data: URIs and preserves public URLs.
 */
export function normalizePhotos(raw: any): ReportPhoto[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const results: ReportPhoto[] = [];

  for (const item of list) {
    if (!item) continue;

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
        results.push({ url: trimmed, thumb: trimmed });
      } else {
        const mime = trimmed.startsWith('iVBORw') ? 'image/png' : 'image/jpeg';
        const dataUri = `data:${mime};base64,${trimmed}`;
        results.push({ url: dataUri, thumb: dataUri });
      }
    } else if (typeof item === 'object') {
      const mime = item.mimeType || 'image/jpeg';
      let resolvedThumb = '';
      let resolvedUrl = '';

      if (item.base64 && typeof item.base64 === 'string') {
        const b64 = item.base64.trim();
        resolvedThumb = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
      } else if (item.thumb && typeof item.thumb === 'string') {
        const th = item.thumb.trim();
        if (th.startsWith('http://') || th.startsWith('https://') || th.startsWith('data:')) {
          resolvedThumb = th;
        } else if (th.length > 50) {
          resolvedThumb = `data:${mime};base64,${th}`;
        }
      }

      const directUrl =
        item.url ||
        item.downloadUrl ||
        item.downloadURL ||
        item.src ||
        item.link ||
        item.path ||
        '';

      if (directUrl && typeof directUrl === 'string') {
        const u = directUrl.trim();
        if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')) {
          resolvedUrl = u;
        }
      }

      if (!resolvedThumb && resolvedUrl) resolvedThumb = resolvedUrl;
      if (!resolvedUrl && resolvedThumb) resolvedUrl = resolvedThumb;

      const m = typeof item.medium === 'string' ? item.medium.trim() : '';
      const resolvedMedium = m.startsWith('http://') || m.startsWith('https://') ? m : '';

      if (resolvedThumb || resolvedUrl) {
        results.push({
          url: resolvedUrl || resolvedThumb,
          thumb: resolvedThumb || resolvedUrl,
          ...(resolvedMedium ? { medium: resolvedMedium } : {}),
        });
      }
    }
  }

  return results;
}

export function parseReportDoc(docSnap: DocumentSnapshot): TreeReport {
  const data = docSnap.data() || {};
  const rawPhotos =
    data.photos ||
    data.photoUrls ||
    data.images ||
    data.image ||
    data.photo ||
    data.media ||
    [];

  return {
    id: docSnap.id,
    treeId: data.treeId || '',
    block: data.block || '',
    workerPhone: data.workerPhone || '',
    description: data.description || '',
    photos: normalizePhotos(rawPhotos),
    conditionBefore: data.conditionBefore,
    conditionAfter: data.conditionAfter,
    conditionChanged: Boolean(data.conditionChanged),
    createdAt: data.createdAt,
  };
}

/**
 * Get total reports count using lightweight count aggregation query on the server.
 */
export async function getReportsCount(): Promise<number> {
  try {
    const colRef = collection(db, 'reports');
    const snapshot = await getCountFromServer(colRef);
    return snapshot.data().count;
  } catch (error) {
    console.error('Failed to get reports count:', error);
    return 0;
  }
}

/**
 * Fetch latest N reports (used for Dashboard).
 */
export async function fetchLatestReports(limitCount = 8): Promise<TreeReport[]> {
  const path = 'reports';
  try {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(parseReportDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Fetch reports for a specific tree with limit.
 */
export async function fetchTreeReports(treeId: string, limitCount = 20): Promise<TreeReport[]> {
  const path = `reports?treeId=${treeId}`;
  try {
    const q = query(
      collection(db, 'reports'),
      where('treeId', '==', treeId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(parseReportDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Save tree to Firestore strictly writing ONLY modified fields.
 * Empty numeric fields are removed with deleteField(), not set to 0.
 * Writes audit record to treeEdits collection without touching reports.
 */
export async function saveTreeChanges(
  originalTree: DurianTree,
  draft: Partial<DurianTree>
): Promise<boolean> {
  const treeId = originalTree.id;
  const path = `trees/${treeId}`;

  const changes: Record<string, { from: any; to: any }> = {};
  const payload: Record<string, any> = {};

  // Numeric fields comparison
  const numericFields: Array<'trunkSize' | 'floweringBranches' | 'floweringClusters' | 'estimatedFruitCount'> = [
    'trunkSize',
    'floweringBranches',
    'floweringClusters',
    'estimatedFruitCount',
  ];

  for (const field of numericFields) {
    const originalVal = originalTree[field];
    const draftVal = draft[field];

    const hasNewVal = draftVal !== undefined && draftVal !== null && String(draftVal) !== '' && !isNaN(Number(draftVal));
    const normalizedNew = hasNewVal ? Number(draftVal) : undefined;

    if (normalizedNew !== undefined) {
      if (originalVal !== normalizedNew) {
        changes[field] = { from: originalVal ?? null, to: normalizedNew };
        payload[field] = normalizedNew;
      }
    } else {
      // Empty input
      if (originalVal !== undefined && originalVal !== null) {
        changes[field] = { from: originalVal, to: null };
        payload[field] = deleteField();
      }
    }
  }

  // Canopy Size (string / number or deleted if empty)
  const origCanopy = originalTree.canopySize;
  const draftCanopy = draft.canopySize;
  const hasCanopy = draftCanopy !== undefined && draftCanopy !== null && String(draftCanopy).trim() !== '';
  if (hasCanopy) {
    const trimmed = typeof draftCanopy === 'number' ? draftCanopy : String(draftCanopy).trim();
    // Compare as text: the form always sends a string, while Firestore may hold a number (500 vs "500").
    const origText = origCanopy !== undefined && origCanopy !== null ? String(origCanopy).trim() : '';
    if (origText !== String(trimmed)) {
      changes.canopySize = { from: origCanopy ?? null, to: trimmed };
      payload.canopySize = trimmed;
    }
  } else {
    if (origCanopy !== undefined && origCanopy !== null && origCanopy !== '') {
      changes.canopySize = { from: origCanopy, to: null };
      payload.canopySize = deleteField();
    }
  }

  // String fields: variant, block, conditionNotes, notes, supplier
  const stringFields: Array<'variant' | 'block' | 'conditionNotes' | 'notes' | 'supplier'> = [
    'variant',
    'block',
    'conditionNotes',
    'notes',
    'supplier',
  ];

  for (const field of stringFields) {
    const origVal = (originalTree[field] || '').trim();
    const draftVal = (draft[field] || '').trim();

    if (origVal !== draftVal) {
      changes[field] = { from: originalTree[field] || '', to: draftVal };
      if (draftVal === '') {
        payload[field] = deleteField();
      } else {
        payload[field] = draftVal;
      }
    }
  }

  // Condition
  const origCondition = originalTree.condition || 'not_assessed';
  const draftCondition = draft.condition || 'not_assessed';
  let conditionDidUpdate = false;

  if (origCondition !== draftCondition) {
    changes.condition = { from: origCondition, to: draftCondition };
    payload.condition = draftCondition;
    payload.conditionUpdatedAt = serverTimestamp();
    conditionDidUpdate = true;
  }

  // If no fields changed, exit early
  if (Object.keys(changes).length === 0) {
    return false;
  }

  // Set dateUpdated if any changes occurred
  payload.dateUpdated = serverTimestamp();

  try {
    // Tree update and its audit record in one batch, so an edit is never saved without its log entry.
    const batch = writeBatch(db);
    batch.update(doc(db, 'trees', treeId), payload);
    batch.set(doc(collection(db, 'treeEdits')), {
      treeId,
      changes,
      at: serverTimestamp(),
      source: 'webapp',
    });
    await batch.commit();

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
}

/**
 * Save variant writing name, description, origin, characteristics, ripeningDays separately.
 * Never copies one into the other so edits to the name actually stick.
 */
export async function saveVariantToFirestore(variant: DurianVariant): Promise<void> {
  const path = `variants/${variant.code}`;
  try {
    const docRef = doc(db, 'variants', variant.code);
    const dataToSave: Record<string, any> = {
      name: variant.name || '',
      description: variant.description || '',
      origin: variant.origin || '',
      characteristics: variant.characteristics || '',
    };
    // Cleared field = remove it (merge would otherwise keep the old value). Never store text.
    const days = Number(variant.ripeningDays);
    dataToSave.ripeningDays =
      variant.ripeningDays !== undefined && variant.ripeningDays !== null && variant.ripeningDays !== '' && Number.isFinite(days)
        ? days
        : deleteField();
    await setDoc(docRef, dataToSave, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
