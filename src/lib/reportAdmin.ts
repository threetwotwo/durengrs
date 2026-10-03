import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from './firebase';
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

  // ---- tree: point "last report" at the newest remaining one, revert the condition this report set ----
  const batch = writeBatch(db);
  const treeId: string = data.treeId;
  if (treeId) {
    const treeRef = doc(db, 'trees', treeId);
    const treeSnap = await getDoc(treeRef);
    if (treeSnap.exists() && treeSnap.data().lastReportId === reportId) {
      const others = await getDocs(query(collection(db, 'reports'), where('treeId', '==', treeId)));
      const remaining = others.docs
        .filter((d) => d.id !== reportId)
        .sort((a, b) => normalizeTimestamp(b.data().createdAt) - normalizeTimestamp(a.data().createdAt));
      const latest = remaining[0];
      const update: Record<string, unknown> = latest
        ? { lastReportId: latest.id, lastReportAt: latest.data().createdAt }
        : { lastReportId: deleteField(), lastReportAt: deleteField() };

      // Only undo the condition if this report is what set it (it may have been edited by hand since).
      const tree = treeSnap.data();
      if (data.conditionChanged && tree.condition === data.conditionAfter) {
        const restored = latest ? latest.data().conditionAfter : data.conditionBefore;
        if (restored && restored !== tree.condition) {
          update.condition = restored;
          update.conditionNotes = null; // that note was this report's description
        }
      }
      batch.update(treeRef, update);
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
