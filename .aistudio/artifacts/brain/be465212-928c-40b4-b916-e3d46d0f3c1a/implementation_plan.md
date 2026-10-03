# Sitewide UI/UX Enhancement Plan: Cilowong Durian Farm

A comprehensive UI/UX overhaul designed to transform the Cilowong Durian Farm management web app into an intuitive, tactile, field-optimized operational tool for orchard supervisors and agronomists.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed UI/UX Priorities**:
> - **Before & After Photo Comparison Slider**: Interactive split comparison slider allowing orchard supervisors to drag a divider between historical inspection photos and diagnose foliage changes, pest progression, or wound healing side-by-side.
> - **Consecutive Tree Stepper (Field Ergonomics)**: "← Previous Tree" and "Next Tree →" navigation controls directly inside the Tree Detail view (with keyboard arrow shortcut support) so field workers walking down orchard rows can record inspections seamlessly without returning to the table.
> - **Orchard Triage Alert Banner**: High-priority alert banner on the dashboard listing emergency trees requiring urgent pesticide swabbing, drainage, or quarantine with 1-click triage navigation.
> - **Tactile Mobile Quick-Filter Strip**: 1-tap filter chips on the Trees Inventory (`Emergency (N)`, `Minor (N)`, `Healthy`, `Block A/B/C/D`) optimized for gloved or outdoor mobile touch use.

---

## 1. Overview & Core Concept

- **What It Delivers**: An elevated field inspection experience combining visual diagnostics (split before/after photo slider), rapid sequential tree navigation, and high-visibility health triage while maintaining live real-time sync with your Firestore database (`duren-db`).
- **Target Audience**: Farm managers and field technicians inspecting trees outdoors under direct sunlight with mobile devices or reviewing orchard health at desktop stations.
- **Key Value**: Reduces tree inspection time by 50% through sequential row stepping and provides instant visual verification of disease progression through comparative photo inspection.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Before & After Visual Photo Inspection**:
   - In the Tree Detail view and Field Reports view, reports with condition changes (`conditionChanged: true` or multiple inspection photos) render an interactive **"Compare Inspection Photos"** tool.
   - Users drag a vertical split handle left and right across the photo to compare previous vs. current foliage condition.
   - Includes zoom toggle, full-screen expansion, and side-by-side view toggle.

2. **Sequential Tree Row Stepper (Field Navigation)**:
   - When viewing `TreeDetailView` (e.g. Tree `A2`), the top navigation displays:
     - `← A1 (Block A)` on the left.
     - `Tree #A2` in the center with condition badge.
     - `A3 (Block A) →` on the right.
   - Allows field workers walking physical orchard rows to save changes and instantly step to the next tree in one tap or by pressing Right Arrow (`→`).
   - Automatically remembers the current filter context (e.g., if filtered by Block B, stepping only cycles through Block B trees).

3. **Urgent Triage & Quick-Filter Strip**:
   - **Dashboard Triage Card**: Highlights any trees marked with `'emergency'` status, showing their tree ID, block, issue description, and time since last report.
   - **Quick Filter Strip on Trees Inventory**: Horizontal scrollable chips (`All`, `🚨 2 Emergencies`, `⚠️ 4 Minor`, `✅ Healthy`, `Block A`, `Block B`, `Block C`, `Block D`) for instant 1-tap filtering without opening dropdown menus.

4. **Yield & Harvest Intelligence KPI**:
   - Dashboard summary of total estimated fruits across the orchard (e.g. `245 developing fruits`) and top-bearing trees.
   - Cultivars page displays total fruit yield per cultivar and estimated harvest window based on bloom-to-harvest ripening days.

### Visual Styling & Tactile Ergonomics

- **High-Contrast Solar Visibility**: Crisp slate canvas (`#F8FAFC` to `#FFFFFF`) paired with high-contrast text and saturated semantic badges (Emerald Green `#059669`, Warm Amber `#D97706`, Vivid Crimson `#DC2626`).
- **Touch Targets**: Minimum $48\text{px}$ touch targets for all primary field buttons (Save, Stepper, Condition radio selectors).
- **Tabular Alignment**: Monospace figures (`tabular-nums font-mono`) for all biometric measurements (trunk girth, flowering clusters, fruit counts).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Side Interactive Photo Slider**:
  - *Approach*: Built using zero-dependency CSS clip-path and pointer-event drag handling, fully responsive across mobile touchscreens and desktop mice.
  - *Why*: Delivers instant 60fps comparison without heavy external library bloat.
- **Decision 2: Context-Aware Stepper Navigation**:
  - *Approach*: Stepper cycles through the active filtered list of trees (or natural alphanumeric order within the same block) rather than random IDs.
  - *Why*: Matches physical orchard geometry where workers systematically inspect Block A trees in order.
- **Decision 3: Non-Destructive Live Firestore Writes**:
  - *Approach*: All updates write directly to `trees/{id}` with optimistic UI feedback and toast confirmation. Field reports remain strictly read-only for audit integrity.
  - *Why*: Preserves historical fidelity while ensuring snappy real-time UI.

---

## 4. Technical Architecture & Component Structure

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Cilowong Durian Farm                            │
│                 Elevated Field UX Architecture                         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌──────────────┐          ┌──────────────────┐         ┌────────────────┐
│  Dashboard   │          │   Trees View     │         │ Cultivars View │
│ - KPI Stats  │          │ - Quick Chips    │         │ - Harvest Math │
│ - Triage Box │          │ - Filter/Search  │         │ - Yield Est.   │
│ - Block Tab  │          │ - CSV Export     │         │ - Add/Edit     │
└──────────────┘          └────────┬─────────┘         └────────────────┘
                                   │
                                   ▼
                      ┌────────────────────────────┐
                      │      TreeDetailView        │
                      ├────────────────────────────┤
                      │ - Row Stepper (Prev/Next)  │
                      │ - Editable Biometrics Form │
                      │ - Photo Comparison Slider  │
                      │ - Inspection Timeline Log  │
                      └────────────────────────────┘
```
