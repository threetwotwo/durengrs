import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { DurianTree, DurianVariant, TreeReport, TreeCondition } from '../types';
import {
  db,
  activeProjectId,
  saveTreeChanges,
  saveVariantToFirestore,
  getReportsCount,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';

interface FarmContextType {
  trees: DurianTree[];
  variants: DurianVariant[];
  totalReportsCount: number;
  refreshReportsCount: () => Promise<void>;
  loading: boolean;
  currentProjectId: string;
  error: string | null;
  selectedTreeId: string | null;
  setSelectedTreeId: (id: string | null) => void;
  activeTab: 'dashboard' | 'trees' | 'variants' | 'reports';
  setActiveTab: (tab: 'dashboard' | 'trees' | 'variants' | 'reports') => void;
  updateTree: (originalTree: DurianTree, updatedFields: Partial<DurianTree>) => Promise<boolean>;
  saveVariant: (variant: DurianVariant) => Promise<void>;
  filterBlock: string;
  setFilterBlock: (block: string) => void;
  filterCondition: string;
  setFilterCondition: (cond: string) => void;
  quickFilter: string;
  setQuickFilter: (filter: string) => void;
  totalFruits: number;
}

const FarmContext = createContext<FarmContextType | null>(null);

export const FarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trees, setTrees] = useState<DurianTree[]>([]);
  const [variants, setVariants] = useState<DurianVariant[]>([]);
  const [totalReportsCount, setTotalReportsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trees' | 'variants' | 'reports'>('dashboard');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<string>('all');

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
              dateCreated: data.dateCreated,
              dateUpdated: data.dateUpdated,
              conditionUpdatedAt: data.conditionUpdatedAt,
              lastReportAt: data.lastReportAt,
              lastReportId: data.lastReportId,
            };
          });

          // Sort naturally by block then ID
          list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
          setTrees(list);
          setLoading(false);
        },
        (err) => {
          console.error('Firestore trees error:', err);
          setError(`Firestore error reading 'trees': ${err.message}`);
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
      setError(`Failed to attach Firestore listeners: ${e.message}`);
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
      setTrees((prev) =>
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
        next[idx] = variant;
        return next;
      }
      return [variant, ...prev];
    });
  };

  const totalFruits = trees.reduce((acc, t) => acc + (t.estimatedFruitCount || 0), 0);

  return (
    <FarmContext.Provider
      value={{
        trees,
        variants,
        totalReportsCount,
        refreshReportsCount,
        loading,
        currentProjectId: activeProjectId,
        error,
        selectedTreeId,
        setSelectedTreeId,
        activeTab,
        setActiveTab,
        updateTree,
        saveVariant,
        filterBlock,
        setFilterBlock,
        filterCondition,
        setFilterCondition,
        quickFilter,
        setQuickFilter,
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
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "02 Oct 2026 · 7h ago"
export function formatDateWithAgo(val: any): string {
  const ts = normalizeTimestamp(val);
  if (!ts) return '—';
  const date = new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  let ago: string;
  if (mins < 1) ago = 'just now';
  else if (mins < 60) ago = `${mins}m ago`;
  else if (mins < 60 * 24) ago = `${Math.floor(mins / 60)}h ago`;
  else if (mins < 60 * 24 * 30) ago = `${Math.floor(mins / 1440)}d ago`;
  else ago = `${Math.floor(mins / 43200)}mo ago`;
  return `${date} · ${ago}`;
}

export function formatDate(val: any): string {
  const ts = normalizeTimestamp(val);
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeAgo(val: any): string {
  const ts = normalizeTimestamp(val);
  if (!ts) return 'No reports';
  const diffMs = Date.now() - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours <= 0) return 'Today';
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}
