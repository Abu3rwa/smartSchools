# Curriculum Maps + Pacing Guides (End-to-End)

## What Changed
- Added a new backend vertical slice with separated models/routes/controllers/services/validators:
  - `CurriculumMap` with versioning and workflow (`draft -> in_review -> published`)
  - `PacingGuide` with map-version link and sync status (`in_sync`, `out_of_sync`, `reconciled`)
  - `PacingOverrideRequest` with approval decisions
- Added new API groups:
  - `/api/curriculum-maps`
  - `/api/pacing-guides`
  - `/api/pacing-overrides`
  - `/api/curriculum-settings`
- Added school-level flexible curriculum settings under `School.settings.curriculum`.
- Added curriculum/pacing permissions across backend/frontend permission catalogs and user enum.
- Added notification hooks for submit/review/publish/override decisions.
- Added export support (CSV and minimal PDF) for maps and guides.
- Added frontend UX in `CurriculumPage` with tabs for maps, guides, overrides, and settings.
- Added navigation and route wiring in portal + sidebar.
- Updated ownership model for maps:
  - teachers create and edit maps for their assigned `class + subject`,
  - admins/permissioned reviewers approve or reject with notes,
  - publish remains role/permission controlled.
- Map scope and uniqueness now use `school + academicYear + classId + subject + isCurrent`.
- Unit schema now supports sample-curriculum columns: `standards`, `skills`, `studentOutcomes`, `performanceTask`.

## Why
- Schools need both curriculum maps and pacing guides as separate artifacts with configurable governance.
- The flow now supports:
  - teacher-authored class-subject map creation and versioning,
  - template-assisted guide generation,
  - teacher override requests with approval/rejection notes,
  - settings-driven control over approvals/exports/override policy.

## Maintainability and Quality Gates
New scripts in `server/package.json`:
- `test:maintainability:curriculum`
- `lint:maintainability:curriculum`
- `dup:maintainability:curriculum`
- `coverage:maintainability:curriculum`
- `coverage:maintainability:curriculum:check`
- `quality:maintainability:curriculum`
- Updated `quality:maintainability:all` to include curriculum gates.

Run:
```bash
npm run quality:maintainability:curriculum
npm run quality:maintainability:all
```

## Before / After Indicators
- **Before**
  - No dedicated curriculum/pacing module.
  - No dedicated curriculum maintainability gates.
  - No curriculum/pacing contract and service tests.
- **After**
  - New curriculum and pacing API slice implemented and wired to UI.
  - Curriculum quality gate passes:
    - complexity max rule: `<= 10` (lint target set)
    - function length max rule: `<= 40` (lint target set)
    - duplication threshold: `<= 2%` (current run: `1.27%`)
    - coverage gate: lines/statements/functions `>= 70`, branches `>= 60`
      - current gate result: statements `96.74%`, lines `96.74%`, functions `100%`, branches `77.14%`
- **File length snapshot (new slice)**
  - `server/services/curriculum/curriculumMapService.js`: `284` lines
  - `server/services/curriculum/pacingGuideService.js`: `268` lines
  - `server/services/curriculum/curriculumMapServiceHelpers.js`: `128` lines
  - `server/services/curriculum/pacingGuideServiceHelpers.js`: `96` lines
  - `server/client/src/pages/curriculum/CurriculumPage/CurriculumPage.jsx`: `522` lines (documented exception; candidate split)

## Security and Scope Guardrails
- Tenant isolation remains enforced by existing tenant plugin + school context middleware.
- Department scoping is applied using existing department scope middleware.
- Teacher visibility constraints:
  - map access constrained to assigned class-subject scope
  - teachers can view/edit their own drafts and view published maps in assigned scope
  - guides remain published-only for non-editing teachers
  - assigned class/subject checks for override request submission
- Optimistic concurrency checks available on draft update operations via `expectedUpdatedAt`.

## Tests Added
- `tests/curriculumValidators.test.js`
- `tests/curriculumControllers.contract.test.js`
- `tests/curriculumMapService.test.js`
- `tests/pacingGuideService.test.js`
- `tests/pacingOverrideService.test.js`
- `tests/curriculumSettingsService.test.js`

## Follow-Up Hotspot Queue
1. Split `CurriculumPage.jsx` into tab-specific components and hooks to remove current file-size exception.
2. Expand coverage scope to include `curriculumMapService`, `pacingGuideService`, helper modules, and repository-level branches.
3. Add stronger policy tests around permission scope expiration (`permissionScopes`) for curriculum permissions.
4. Consider replacing minimal PDF generator with a dedicated PDF renderer for richer formatting fidelity.
