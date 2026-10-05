import { translate, locale } from '../i18n';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { DurianTree, DurianVariant, TreeReport, TreeCondition } from '../types';
import {
  db,
  activeProjectId,
  saveTreeChanges,
  saveVariantToFirestore,
  deleteVariantFromFirestore,
  getReportsCount,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { HarvestCycle } from '../lib/insights';
import { TreatmentPlan, Treatment, ScheduleTask, computeTasks, rebuildLastDone, addDays, todayStr } from '../lib/treatments';
import type { CropCount, Harvest, LabResult, RainDay, SeasonTaskDone, TreeBloom } from '../lib/fieldData';

import { AppTab, useRoute } from '../lib/router';
export type { AppTab };

interface FarmContextType {
  blocks: string[];
  plans: TreatmentPlan[];
  harvestCycles: HarvestCycle[];
  treatments: Treatment[];
  scheduleTasks: ScheduleTask[];
  /** Set when Firestore refuses the treatments collections (rules not published yet). */
  scheduleError: string | null;
  /** Active trees only: every list, count and forecast uses these. */
  trees: DurianTree[];
  /** Archived trees (history kept, ID reserved forever). */
  archivedTrees: DurianTree[];
  /** Active and archived: for looking an ID up or checking it is free. */
  allTrees: DurianTree[];
  variants: DurianVariant[];
  totalReportsCount: number;
  refreshReportsCount: () => Promise<void>;
  unreadReportsCount: number;
  loading: boolean;
  currentProjectId: string;
  error: string | null;
  activeTab: AppTab;
  updateTree: (originalTree: DurianTree, updatedFields: Partial<DurianTree>) => Promise<boolean>;
  saveVariant: (variant: DurianVariant) => Promise<void>;
  /** Deletes a variant; trees using it are moved to `reassignTo` first. */
  deleteVariant: (code: string, reassignTo?: string) => Promise<void>;
  totalFruits: number;
  /** Farm records for the Guide (see lib/fieldData.ts). */
  harvests: Harvest[];
  seasonTasksDone: SeasonTaskDone[];
  /** Trees (or branches) that flowered apart from their block's bloom date. */
  treeBlooms: TreeBloom[];
  /** Per-tree crop counts of the current and last season. */
  cropCounts: CropCount[];
  rain: RainDay[];
  labResults: LabResult[];
  /** YYYY-MM-DD of the last weekly farm check, if any. */
  weeklyReviewDate: string | null;
  /** Set when Firestore refuses the farm-record collections (rules not published yet). */
  recordsError: string | null;
  /** Still loading after 10 s: probably a weak signal. */
  slowConnection: boolean;
}

// One context object for the whole page life. A hot reload re-runs this module; with a fresh context object the
// already-mounted Provider and the re-imported useFarm would disagree ("useFarm must be used within a FarmProvider").
const FARM_CTX_KEY = '__cilowongFarmContext';
const FarmContext: React.Context<FarmContextType | null> = ((globalThis as any)[FARM_CTX_KEY] ??= createContext<FarmContextType | null>(null));

export const FarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allTrees, setAllTrees] = useState<DurianTree[]>([]);
  const trees = useMemo(() => allTrees.filter((t) => t.active !== false), [allTrees]);
  const archivedTrees = useMemo(() => allTrees.filter((t) => t.active === false), [allTrees]);
  const [variants, setVariants] = useState<DurianVariant[]>([]);
  const [totalReportsCount, setTotalReportsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const activeTab = useRoute().tab; // the URL decides; see lib/router.ts

  // Unread = reports newer than the last time this browser opened the Reports tab.
  // One live query that only returns new docs, so it costs almost nothing.
  const SEEN_KEY = 'reportsLastSeenAt';
  const [lastSeenAt, setLastSeenAt] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(SEEN_KEY));
      if (saved > 0) return saved;
      localStorage.setItem(SEEN_KEY, String(Date.now())); // first visit: nothing is "new"
    } catch {}
    return Date.now();
  });
  const [unreadReportsCount, setUnreadReportsCount] = useState<number>(0);

  useEffect(() => {
    const q = query(
      collection(db, 'reports'),
      where('createdAt', '>', Timestamp.fromMillis(lastSeenAt)),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setUnreadReportsCount(snap.size),
      (err) => console.error('Unread reports listener failed:', err)
    );
    return () => unsub();
  }, [lastSeenAt]);

  useEffect(() => {
    if (activeTab !== 'reports') return;
    const now = Date.now();
    try { localStorage.setItem(SEEN_KEY, String(now)); } catch {}
    setLastSeenAt(now);
  }, [activeTab]);

  // Treatment routines and the log of what was applied. Both are small collections.
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [harvestCycles, setHarvestCycles] = useState<HarvestCycle[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    const onErr = (err: any) => {
      console.error('Schedule listener failed:', err);
      setScheduleError(
        err?.code === 'permission-denied'
          ? translate('err.rules')
          : String(err?.message || err)
      );
    };
    const unsubPlans = onSnapshot(
      collection(db, 'treatmentPlans'),
      (snap) => {
        setScheduleError(null);
        setPlans(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as TreatmentPlan));
      },
      onErr
    );
    const unsubTreatments = onSnapshot(
      query(collection(db, 'treatments'), orderBy('date', 'desc'), limit(500)),
      (snap) => setTreatments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Treatment)),
      onErr
    );
    const unsubCycles = onSnapshot(
      collection(db, 'harvestCycles'),
      (snap) => setHarvestCycles(snap.docs.map((d) => ({ block: d.id, ...(d.data() as any) }) as HarvestCycle)),
      onErr
    );
    return () => {
      unsubCycles();
      unsubPlans();
      unsubTreatments();
    };
  }, []);

  // Farm records the Guide reads: harvests, season tasks, rain (last 120 days), lab results, weekly review.
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [seasonTasksDone, setSeasonTasksDone] = useState<SeasonTaskDone[]>([]);
  const [rain, setRain] = useState<RainDay[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [weeklyReviewDate, setWeeklyReviewDate] = useState<string | null>(null);
  const [treeBlooms, setTreeBlooms] = useState<TreeBloom[]>([]);
  const [cropCounts, setCropCounts] = useState<CropCount[]>([]);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  useEffect(() => {
    const onErr = (what: string) => (err: any) => {
      console.error(`${what} listener failed:`, err);
      setRecordsError(err?.code === 'permission-denied' ? translate('err.rulesRecords') : String(err?.message || err));
    };
    const since = addDays(todayStr(), -120);
    const seasonsSince = addDays(todayStr(), -400);
    const subs = [
      onSnapshot(
        query(collection(db, 'harvests'), orderBy('date', 'desc'), limit(1000)),
        (s) => setHarvests(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Harvest)),
        onErr('Harvests')
      ),
      onSnapshot(
        query(collection(db, 'seasonTasks'), where('season', '>=', seasonsSince)),
        (s) => setSeasonTasksDone(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as SeasonTaskDone)),
        onErr('Season tasks')
      ),
      onSnapshot(
        query(collection(db, 'weather'), where('date', '>=', since)),
        (s) =>
          setRain(
            s.docs
              .map((d) => d.data() as RainDay)
              .filter((d) => typeof d.rainMm === 'number' && typeof d.date === 'string')
          ),
        onErr('Rain')
      ),
      onSnapshot(
        query(collection(db, 'labResults'), orderBy('date', 'desc'), limit(300)),
        (s) => setLabResults(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as LabResult)),
        onErr('Lab results')
      ),
      onSnapshot(
        query(collection(db, 'bloomWaves'), where('date', '>=', seasonsSince)),
        (s) => setTreeBlooms(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as TreeBloom)),
        onErr('Tree bloom')
      ),
      onSnapshot(
        query(collection(db, 'cropCounts'), where('season', '>=', seasonsSince)),
        (s) => setCropCounts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as CropCount)),
        onErr('Crop counts')
      ),
      onSnapshot(
        doc(db, 'farmMeta', 'weeklyReview'),
        (s) => setWeeklyReviewDate(s.exists() ? (s.data().date as string) || null : null),
        onErr('Weekly review')
      ),
    ];
    return () => subs.forEach((u) => u());
  }, []);

  // Routines saved before plans kept their own last-done dates: rebuild those once from the full history.
  const rebuilt = useRef(new Set<string>());
  useEffect(() => {
    for (const p of plans) {
      if (p.lastDone || rebuilt.current.has(p.id)) continue;
      rebuilt.current.add(p.id);
      rebuildLastDone(p.id).catch((e) => console.error('Rebuilding last-done failed:', e));
    }
  }, [plans]);

  // Weak signal: say so instead of an endless spinner (data still appears when it arrives).
  const [slowConnection, setSlowConnection] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlowConnection(false);
      return;
    }
    const id = setTimeout(() => setSlowConnection(true), 10000);
    return () => clearTimeout(id);
  }, [loading]);

  const blocks = useMemo(
    () => Array.from(new Set(trees.map((t) => t.block).filter(Boolean))).sort(),
    [trees]
  );
  const scheduleTasks = useMemo(
    () => computeTasks(plans, treatments, blocks),
    [plans, treatments, blocks]
  );

  const refreshReportsCount = useCallback(async () => {
    try {
      const count = await getReportsCount();
      setTotalReportsCount(count);
    } catch (e) {
      console.error('Error refreshing reports count:', e);
    }
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);

    let unsubscribeTrees = () => {};
    let unsubscribeVariants = () => {};

    try {
      // 1. Subscribe to 'trees'
      const treesCol = collection(db, 'trees');
      unsubscribeTrees = onSnapshot(
        treesCol,
        (snapshot) => {
          const list: DurianTree[] = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();

            // Data correctness: Keep missing numbers as undefined (do not use Number(x) || 0)
            const parseNum = (val: any): number | undefined => {
              if (val === undefined || val === null || val === '') return undefined;
              const n = Number(val);
              return isNaN(n) ? undefined : n;
            };

            // Never default missing condition to 'healthy' -> 'not_assessed'
            let condition: TreeCondition = 'not_assessed';
            if (data.condition) {
              const c = String(data.condition).toLowerCase().trim();
              if (c === 'healthy') condition = 'healthy';
              else if (c === 'minor' || c === 'minor_issue') condition = 'minor';
              else if (c === 'emergency') condition = 'emergency';
            }

            return {
              id: docSnap.id,
              variant: data.variant || '',
              block: data.block || '',
              condition,
              conditionNotes: data.conditionNotes || '',
              canopySize: data.canopySize !== undefined && data.canopySize !== null ? data.canopySize : undefined,
              trunkSize: parseNum(data.trunkSize),
              floweringBranches: parseNum(data.floweringBranches),
              floweringClusters: parseNum(data.floweringClusters),
              estimatedFruitCount: parseNum(data.estimatedFruitCount),
              notes: data.notes || '',
              supplier: data.supplier || '',
              datePlanted: data.datePlanted,
              treeNumber: parseNum(data.treeNumber),
              active: data.active,
              archivedAt: data.archivedAt,
              archivedReason: data.archivedReason,
              archivedNote: data.archivedNote,
              dateCreated: data.dateCreated,
              dateUpdated: data.dateUpdated,
              conditionUpdatedAt: data.conditionUpdatedAt,
              lastReportAt: data.lastReportAt,
              lastReportId: data.lastReportId,
            };
          });

          // Sort naturally by block then ID
          list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
          setAllTrees(list);
          setLoading(false);
        },
        (err) => {
          console.error('Firestore trees error:', err);
          setError(translate('err.trees', { msg: err.message }));
          setLoading(false);
          try {
            handleFirestoreError(err, OperationType.LIST, 'trees');
          } catch {}
        }
      );

      // 2. Subscribe to 'variants'
      const variantsCol = collection(db, 'variants');
      unsubscribeVariants = onSnapshot(
        variantsCol,
        (snapshot) => {
          const list: DurianVariant[] = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            // Display name uses "name", fall back to "description", then code
            const displayName = data.name || data.description || docSnap.id;
            return {
              code: docSnap.id,
              name: displayName,
              description: data.description || '',
              origin: data.origin || '',
              characteristics: data.characteristics || '',
              ripeningDays: data.ripeningDays,
              nameMissing: !data.name,
            };
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          setVariants(list);
        },
        (err) => {
          console.error('Firestore variants error:', err);
          try {
            handleFirestoreError(err, OperationType.LIST, 'variants');
          } catch {}
        }
      );

      // 3. Fetch initial report count via server aggregation
      refreshReportsCount();
    } catch (e: any) {
      console.error('Failed to attach listeners:', e);
      setError(translate('err.listeners', { msg: e.message }));
      setLoading(false);
    }

    return () => {
      unsubscribeTrees();
      unsubscribeVariants();
    };
  }, [refreshReportsCount]);

  useEffect(() => {
    const unsub = loadData();
    return () => unsub?.();
  }, [loadData]);

  const updateTree = async (originalTree: DurianTree, updatedFields: Partial<DurianTree>): Promise<boolean> => {
    const success = await saveTreeChanges(originalTree, updatedFields);
    if (success) {
      setAllTrees((prev) =>
        prev.map((t) => (t.id === originalTree.id ? { ...t, ...updatedFields } : t))
      );
    }
    return success;
  };

  const saveVariant = async (variant: DurianVariant) => {
    await saveVariantToFirestore(variant);
    setVariants((prev) => {
      const idx = prev.findIndex((v) => v.code === variant.code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...variant, nameMissing: false };
        return next;
      }
      return [{ ...variant, nameMissing: false }, ...prev];
    });
  };

  const deleteVariant = async (code: string, reassignTo?: string) => {
    await deleteVariantFromFirestore(code, allTrees.filter((t) => t.variant === code), reassignTo);
  };

  const totalFruits = trees.reduce((acc, t) => acc + (t.estimatedFruitCount || 0), 0);

  return (
    <FarmContext.Provider
      value={{
        trees,
        archivedTrees,
        allTrees,
        variants,
        totalReportsCount,
        refreshReportsCount,
        unreadReportsCount,
        blocks,
        plans,
        harvestCycles,
        treatments,
        scheduleTasks,
        scheduleError,
        loading,
        currentProjectId: activeProjectId,
        error,
        activeTab,
        updateTree,
        saveVariant,
        deleteVariant,
        harvests,
        seasonTasksDone,
        treeBlooms,
        cropCounts,
        rain,
        labResults,
        weeklyReviewDate,
        recordsError,
        slowConnection,
        totalFruits,
      }}
    >
      {children}
    </FarmContext.Provider>
  );
};

export function useFarm() {
  const ctx = useContext(FarmContext);
  if (!ctx) {
    throw new Error('useFarm must be used within a FarmProvider');
  }
  return ctx;
}

export function normalizeTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (val.seconds) return val.seconds * 1000;
  const d = new Date(val);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function formatDateTime(val: any): string {
  const ts = normalizeTimestamp(val);
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(val: any): string {
  const ts = normalizeTimestamp(val);
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeAgo(val: any): string {
  const ts = normalizeTimestamp(val);
  if (!ts) return translate('date.none');
  const diffMs = Date.now() - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours <= 0) return translate('common.today');
    return translate('time.hAgo', { n: diffHours });
  }
  if (diffDays === 1) return translate('common.yesterday');
  return translate('time.dAgo', { n: diffDays });
}
