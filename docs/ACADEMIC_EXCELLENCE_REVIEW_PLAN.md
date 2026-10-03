# Academic Excellence Feature Review Plan

**Review basis:** source inspection of the server, feature routes, client hook, model, and the two feature-named test files. Findings below are code-verified; no production data or runtime smoke tests were used. No code was changed.

## 1. Scope and current behavior

Academic Excellence (AE) tracks student mastery against objectives/standards and supports teacher intervention.

- **Student:** the dashboard syncs objectives from learning-trace lesson and gap-analysis data, calculates mastery using school/class/subject thresholds, displays at-risk/focus/mastered objectives, and lists pending practice tasks. See `services/academicExcellenceService.js` and `controllers/academicExcellenceStudentController.js`.
- **Teacher:** class summary, objective/standard lists, mastery heatmap, task assignment/review, AI practice assignment, exclusions, objective rename/soft-delete, and notification preferences. Tracking mode defaults to `objectives`; `standards` mode shows assigned standards. See `controllers/academicExcellenceTeacherController.js` and `routes/academicExcellenceRoutes.js`.
- **Admin/school:** settings and thresholds, analytics, at-risk student lists, and CSV export. AE APIs are protected by authentication, school context, permission/role checks, and the `academicIntelligence` feature gate.
- **Automation:** gradebook saves intend to trigger mastery sync; the nightly job intends to alert schools about at-risk students. Both have defects detailed below.
- **Data model:** objective mastery values are `not_started`, `at_risk`, `developing`, and `mastered`; settings default to 70% weak and 85% mastery thresholds. Objective records have an optional `academicYear`, but the trace-sync create path does not populate it.
- **Test coverage observed:** the feature-named tests exercise standard resolution and AI-practice payload/text validation. They do not cover grade-save sync, analytics aggregation, or export output.

## 2. Verified risks / bugs

| Priority | Finding | Evidence and impact |
|---|---|---|
| **P1** | Grade-save mastery sync receives the wrong school argument. | `jobs/academicExcellenceSyncJob.js` passes `{ schoolId }` to `syncStudentObjectiveMastery`, which reads `school._id`. Gradebook controllers call this wrapper; its catch logs and returns `null`. Thus the intended grade-triggered sync exits before updating mastery. |
| **P2** | Alert and class analytics status labels do not match the model. | The model only permits `at_risk`/`developing`; the nightly job filters for `not_met`, and class analytics count `not_met`/`progressing`. Current-model records therefore do not contribute to those counts, leaving nightly alerts and portions of class breakdowns ineffective. |
| **P2** | Trace-synced objectives lack the selected academic year. | `AcademicExcellenceObjective.academicYear` defaults to `null`, and the sync create path omits it. Teacher views filter on the selected year, so these records can disappear from year-filtered class views and analytics. |
| **P2** | CSV export reads fields absent from the objective schema. | `exportAcademicExcellenceReport` emits `objectiveDescription` and `currentScore`; the model stores `objectiveName` and `masteryScore`. Description and score columns can consequently be blank. The export also applies a semester filter although the model has no semester field. |
| **P2** | Semester filtering is not implemented for mastery records. | Teacher and school analytics explicitly discard `semester`; users passing that filter receive unfiltered results. The record schema has no semester field, so the UI/API contract needs a clear decision. |

## 3. Improvement backlog

| Priority | Improvement | Effort |
|---|---|---|
| P1 | Align the grade-save wrapper/service input contract; preserve structured error reporting and add a regression test proving a saved grade updates the expected objective. | M |
| P2 | Standardize mastery status vocabulary across model, nightly job, analytics, and UI; test each status in counts and alerts. | M |
| P2 | Define academic-year ownership for objective records; populate it consistently and verify legacy/null records and year-scoped queries. | M |
| P2 | Map CSV columns to canonical model fields; define/remove unsupported semester filtering and test CSV header and row contents. | S |
| P2 | Add integration coverage for grade-save sync, student dashboard, teacher class summary, school analytics, and CSV export. | M |
| P3 | Clarify canonical objective/standard identity and deduplicate display/reporting across tracking modes, building on `docs/ACADEMIC_EXCELLENCE_OBJECTIVES_STANDARDS_UNIFICATION_PLAN.md`. | L |
| P3 | Review task assignment/completion lifecycle and notification delivery for duplicate assignments, retry behavior, and auditable outcomes. | M |

## 4. Phased execution and validation checklist

### Phase 1 — Confirm contracts and establish baselines
- [ ] Confirm expected mastery status terms and whether semester-level reporting is required.
- [ ] Check representative records for missing `academicYear`, duplicate objective identities, and task linkage.
- [ ] Capture current grade-save, dashboard, class-summary, analytics, and CSV responses for a test school.

### Phase 2 — Restore core synchronization and consistent mastery reporting
- [ ] Correct the grade-save sync contract and verify the wrapper reports failures without swallowing them as success.
- [ ] Align nightly alert criteria and class analytics buckets with the persisted mastery enum.
- [ ] Validate score thresholds at below-weak, weak/developing, and mastery boundaries.

### Phase 3 — Fix year scope and exports
- [ ] Decide how existing/null-year objectives are migrated or presented; ensure new records carry the intended year.
- [ ] Verify current-year and prior-year isolation in teacher and school views.
- [ ] Verify exported CSV values against source records; reject or clearly omit unsupported filters.

### Phase 4 — End-to-end regression and rollout
- [ ] Test grade entry and bulk/homework grading through to updated student mastery.
- [ ] Test student and teacher flows, both tracking modes, exclusions, and task assignment/completion.
- [ ] Test analytics counts and at-risk alerts with fixtures for every persisted mastery state.
- [ ] Test CSV escaping, headers, score/name values, pagination/filter behavior, and empty results.
- [ ] Run the focused AE test suite, then relevant server tests; smoke-test with a school-scoped account before rollout.
- [ ] Monitor sync errors, alert volumes, and year-filtered record counts after release.
