export type TreeCondition = 'healthy' | 'minor' | 'emergency' | 'not_assessed';

export interface DurianVariant {
  code: string; // Document ID in variants/{code}, e.g. "MK", "BT", "BW"
  name: string; // Variant name, e.g. "Musang King", "Bawor"
  description?: string;
  origin?: string;
  characteristics?: string;
  ripeningDays?: number | string;
  createdAt?: string;
}

export interface DurianTree {
  id: string; // Document ID in trees/{A1}
  variant: string; // variant code, e.g. "MK"
  block: string; // e.g. "A"
  condition: TreeCondition;
  conditionNotes?: string;
  canopySize?: number | string; // canopy spread in cm or text
  trunkSize?: number; // girth in cm
  floweringBranches?: number;
  floweringClusters?: number;
  estimatedFruitCount?: number;
  notes?: string;
  supplier?: string;
  datePlanted?: string | { seconds: number; nanoseconds: number } | any;
  treeNumber?: number;
  active?: boolean;
  dateCreated?: string | { seconds: number; nanoseconds: number } | any;
  dateUpdated?: string | { seconds: number; nanoseconds: number } | any;
  conditionUpdatedAt?: string | { seconds: number; nanoseconds: number } | any;
  lastReportAt?: string | { seconds: number; nanoseconds: number } | any;
  lastReportId?: string;
}

export interface ReportPhoto {
  url: string;
  thumb?: string;
}

export interface TreeReport {
  id: string; // Document ID in reports/{id}
  treeId: string;
  block: string;
  workerPhone?: string;
  description?: string;
  photos?: ReportPhoto[];
  conditionBefore?: TreeCondition | string;
  conditionAfter?: TreeCondition | string;
  conditionChanged?: boolean;
  createdAt?: string | { seconds: number; nanoseconds: number } | any;
}

export interface TreeEditAudit {
  treeId: string;
  changes: Record<string, { from: any; to: any }>;
  at: any;
  source: 'webapp';
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  databaseId?: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}
