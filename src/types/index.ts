export type TreeCondition = 'healthy' | 'minor' | 'emergency' | 'not_assessed';

export interface DurianVariant {
  code: string; // Document ID in variants/{code}, e.g. "MK", "BT", "BW"
  name: string; // Variant name, e.g. "Musang King", "Bawor"
  description?: string;
  origin?: string;
  characteristics?: string;
  ripeningDays?: number | string;
  createdAt?: string;
  /** The document has no name; `name` then shows the description or code, and must not be saved back as the name. */
  nameMissing?: boolean;
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
  /** false = archived: kept for history, hidden from lists, closed to WhatsApp reports. Missing = active. The ID is never reused. */
  active?: boolean;
  archivedAt?: string | { seconds: number; nanoseconds: number } | any;
  archivedReason?: string;
  archivedNote?: string;
  dateCreated?: string | { seconds: number; nanoseconds: number } | any;
  dateUpdated?: string | { seconds: number; nanoseconds: number } | any;
  conditionUpdatedAt?: string | { seconds: number; nanoseconds: number } | any;
  lastReportAt?: string | { seconds: number; nanoseconds: number } | any;
  lastReportId?: string;
  /** Latest confirmed stage seen on the tree (farm scale code, src/shared/stages), from a reviewed report. */
  observedStage?: { code: string; date: string; reportId?: string };
  /** "Membaik" from a checked report; shown only while that report is still the tree's latest. */
  improving?: { reportId: string; date: string };
}

export interface ReportPhoto {
  /** Full size (1600px). Only loaded when a photo is opened full screen. */
  url: string;
  /** 320px, for blur-up placeholders and small strips. */
  thumb?: string;
  /** 900px, shown in the album. */
  medium?: string;
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
  /** Suggestion from the worker's words (or a photo model): see src/shared/triage.ts and docs/data-contract.md. */
  triage?: import('../shared').Triage;
  /** Set when a person has looked at the report in the review inbox. */
  review?: { decision: 'accepted' | 'corrected' | 'dismissed'; by?: string; at?: any };
  /** Confirmed by the review. */
  stage?: string;
  issues?: string[];
  health?: 'hijau' | 'kuning' | 'merah';
  /** "Membaik": the problem is getting better. */
  improving?: boolean;
  /** Who changed the tree's condition with this report: the worker's own choice (older Flow) or the urgent words. */
  conditionSource?: 'worker' | 'triage';
  /** The problems (cases) this report opened, treated or re-checked. */
  caseIds?: string[];
  /** Gemini's reading of the photos and words: done, still running, or failed (then `triage` is the word-only one). */
  ai?: { status: 'running' | 'done' | 'failed' | string; model?: string; error?: string };
}

/** One step in a problem's history: the report that saw, treated or re-checked it. */
export interface CaseEvent {
  date: string;
  /** The report; 'webapp' events (closed or reopened by hand) have none. */
  reportId?: string;
  type: import('../shared').CaseEventType;
  action?: string;
  product?: string;
  note?: string;
  photo?: number;
  by?: string;
}

/**
 * One problem on one tree, followed from the first report that showed it until it is solved (`cases/{id}`, written
 * by the bot; see docs/data-contract.md).
 */
export interface ProblemCase {
  id: string;
  treeId: string;
  block?: string;
  /** Issue code (src/shared/issues.ts). */
  issue: string;
  /** The specific pest or disease, when Gemini named it. */
  name?: string;
  status: import('../shared').CaseStatus;
  openedOn: string;
  openedReportId?: string;
  lastOn?: string;
  lastReportId?: string;
  lastAction?: string;
  /** Next photo check (YYYY-MM-DD); none once solved. */
  nextCheck?: string | null;
  closedOn?: string;
  events: CaseEvent[];
}
