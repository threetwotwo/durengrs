import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { deleteObject, getStorage, ref } from 'firebase/storage';
import type { ReportPhoto } from '../types';
import { app, db } from './firebase';

// Cloud Storage (report photos) is only needed here, so it loads with the Reports page, not on every visit.
const storage = getStorage(app);
// Give up quickly on a bad connection instead of retrying for 2 minutes with a spinner on screen.
storage.maxOperationRetryTime = 15000;
import { normalizeTimestamp } from '../context/FarmContext';

/** "https://firebasestorage.googleapis.com/v0/b/bucket/o/report-photos%2FA1%2Fx.jpg?alt=media&token=..." -> "report-photos/A1/x.jpg" */
function pathFromUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const m = u.match(/\/o\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export interface DeleteReportResult {
  /** Photo files that could not be removed (the report itself is gone either way). */
  filesFailed: number;
  filesTotal: number;
}

/**
 * Deletes one report completely: the Firestore document, every photo file (full, 900px, thumbnail)
 * and the collage in Cloud Storage, and repairs the tree if this was its latest report.
 * Firestore goes first (source of truth); photo files are removed afterwards so a failure there never
 * leaves a report pointing at missing photos.
 */
export async function deleteReport(reportId: string): Promise<DeleteReportResult> {
  const reportRef = doc(db, 'reports', reportId);
  const snap = await getDoc(reportRef);
  if (!snap.exists()) return { filesFailed: 0, filesTotal: 0 };
  const data = snap.data();

  // ---- every file that belongs to this report ----
  const paths = new Set<string>();
  const add = (v: unknown) => {
    const p = pathFromUrl(v);
    if (p) paths.add(p);
  };
  const photos: any[] = Array.isArray(data.photos) ? data.photos : [];
  for (const p of photos) {
    if (!p) continue;
    if (typeof p === 'string') add(p);
    else {
      if (typeof p.path === 'string' && !p.path.startsWith('http')) paths.add(p.path);
      add(p.url);
      add(p.thumb);
      add(p.medium);
    }
  }
  add(data.collageUrl);

  // ---- tree: point "last report" at the newest remaining one, revert the condition this report set, and drop the
  // stage or "membaik" that came from this report ----
  const batch = writeBatch(db);
  const treeId: string = data.treeId;
  if (treeId) {
    const treeRef = doc(db, 'trees', treeId);
    const treeSnap = await getDoc(treeRef);
    const tree = treeSnap.exists() ? treeSnap.data() : null;
    const update: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (tree && tree.lastReportId === reportId) {
      const others = await getDocs(query(collection(db, 'reports'), where('treeId', '==', treeId)));
      const remaining = others.docs
        .filter((d) => d.id !== reportId)
        .sort((a, b) => normalizeTimestamp(b.data().createdAt) - normalizeTimestamp(a.data().createdAt));
      const latest = remaining[0];
      Object.assign(update, latest ? { lastReportId: latest.id, lastReportAt: latest.data().createdAt } : { lastReportId: deleteField(), lastReportAt: deleteField() });

      // Only undo the condition if this report is what set it (it may have been edited by hand since).
      if (data.conditionChanged && tree.condition === data.conditionAfter) {
        // The condition right before this report; older reports only as a fallback (a report that did
        // not change the condition may have no conditionAfter).
        const restored =
          data.conditionBefore ||
          (latest ? latest.data().conditionAfter || latest.data().conditionBefore : undefined);
        if (restored && restored !== tree.condition) {
          update.condition = restored;
          update.conditionNotes = deleteField(); // that note was this report's description
          changes.condition = { from: tree.condition, to: restored };
        }
      }
    }
    if (tree?.observedStage?.reportId === reportId) {
      update.observedStage = deleteField();
      changes.observedStage = { from: tree.observedStage.code ?? null, to: null };
    }
    if (tree?.improving?.reportId === reportId) {
      update.improving = deleteField();
      changes.improving = { from: true, to: false };
    }
    if (Object.keys(update).length) batch.update(treeRef, update);
    if (Object.keys(changes).length) {
      batch.set(doc(collection(db, 'treeEdits')), { treeId, changes, at: serverTimestamp(), source: 'webapp', reason: 'report-deleted', reportId });
    }
  }
  batch.delete(reportRef);
  await batch.commit();

  // ---- photo files ----
  const results = await Promise.allSettled(
    [...paths].map((p) => deleteObject(ref(storage, p)))
  );
  const filesFailed = results.filter(
    (r) => r.status === 'rejected' && (r.reason as any)?.code !== 'storage/object-not-found'
  ).length;
  return { filesFailed, filesTotal: paths.size };
}

/** Deletes a record and the photo files sent with it (full, 900px and thumbnail). The record goes first. */
export async function deleteRecordWithPhotos(collectionName: 'harvests' | 'cropCounts' | 'bloomWaves', h: { id: string; photos?: ReportPhoto[] }): Promise<DeleteReportResult> {
  const paths = new Set<string>();
  for (const p of h.photos || []) for (const u of [p.url, p.medium, p.thumb]) {
    const path = pathFromUrl(u);
    if (path) paths.add(path);
  }
  await deleteDoc(doc(db, collectionName, h.id));
  const results = await Promise.allSettled([...paths].map((p) => deleteObject(ref(storage, p))));
  const filesFailed = results.filter((r) => r.status === 'rejected' && (r.reason as any)?.code !== 'storage/object-not-found').length;
  return { filesFailed, filesTotal: paths.size };
}

export const deleteHarvest = (h: { id: string; photos?: ReportPhoto[] }) => deleteRecordWithPhotos('harvests', h);
