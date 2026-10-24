# Assessment Question-Type Expansion Plan

## Status and boundary

**Status:** planning only. This document does not authorize or include product-code, schema, route, or data changes.

**Goal:** add these assessment capabilities wherever the application presents teacher-created, imported, generated, or student-completed quizzes, without breaking existing attempts, answer keys, reports, or MAP Practice imports:

1. Multiple select — choose all correct answers.
2. Fill in the blank — words, phrases, or numbers.
3. Numeric response — auto-graded exact, tolerant, ranged, fractional/decimal answers with optional units.
4. Matching — pair terms with definitions, events, images, or examples.
5. Passage-based questions — several independently scored questions linked to one shared reading/source passage.

This is an **assessment-platform capability**, not a Standards-only feature. Standards assessments, current CSV MAP Practice, and legacy MAP Test Prep must reach the same capability set. Other quiz producers must either use the shared contract or explicitly expose a narrower type list; no flow may advertise a type it cannot render and grade.

## Verified current state

| Surface | Current persisted types | Verified implementation facts | Expansion implication |
| --- | --- | --- | --- |
| Standards assessment/practice | `multiple_choice`, `true_false`, `short_answer` | Server/client constants contain these three. `StandardQuestionPool` and `PracticeAttempt` store a string key/answer and an option array. Services, controller, pool editor/importer, student practice, analytics, and translations branch on them. | Needs all five capabilities and a structured key/response path. |
| Legacy MAP Test Prep | `true_false`, `multiple_choice`, `short_answer` | `MapPrepQuiz` has this enum; `mapPrepController` generates and grades these types directly. | Needs all five without reshaping historic `MapPrep*` data. |
| CSV MAP Practice | `mcq`, `multi_select`, `short_text`, `matching` | `MapPracticeQuestion` already has passages, matching pairs, points, and deterministic multi-select/matching grading. The student player renders multi-select/matching. | Reuse its working interaction/grading patterns; add fill blank and numeric, formalize shared passages, and bridge names safely. |
| Other specialized quiz flows | varies | Grammar, Academic Excellence, reading, social studies, vocabulary, and similar flows have independent type allow-lists/branches. | Inventory before enabling a type; migrate one flow at a time through an adapter. |

Primary files establishing this audit:

- `constants/practiceQuestionTypes.js`, `client/src/constants/practiceQuestionTypes.js`
- `models/StandardQuestionPool.js`, `models/PracticeAttempt.js`, `models/StandardAssignment.js`
- `services/standardAssignmentService.js`, `services/standardsPracticeAIService.js`, `controllers/standardsPracticeController.js`
- `client/src/pages/standards/StandardAssignPage/**`, `client/src/pages/student/practice/**`
- `models/MapPrepQuiz.js`, `controllers/mapPrepController.js`
- `models/MapPracticeQuestion.js`, `validators/mapPracticeValidators.js`, `services/mapPracticeGradingService.js`
- `client/src/pages/student/mapTestPrep/StudentMapTestPrepPage.jsx`

## Decisions to lock before coding

1. **Canonical types:** `multiple_choice`, `multiple_select`, `true_false`, `short_answer`, `fill_in_blank`, `numeric_response`, and `matching`. A passage is shared context, not an answer type.
2. **Compatibility aliases:** retain MAP CSV values `mcq`, `multi_select`, and `short_text` (`mcq -> multiple_choice`, `short_text -> short_answer`). Existing records are not bulk-rewritten merely to rename a type.
3. **Deterministic objective grading:** multiple select, fill blank, numeric, and matching never use AI to decide correctness. Existing conceptual/teacher-reviewed short answer behavior remains available.
4. **Explicit partial credit:** off by default for multiple select; available per blank and per matching pair. Each result exposes earned points, maximum points, state, and rule summary.
5. **Immutable attempt snapshots:** question, passage, answer definition, grading configuration, and point value are frozen for each attempt. Later edits cannot alter what a student saw.
6. **Server-authoritative capabilities:** every flow returns its supported types/type-metadata version from the server. The browser is never the validation authority.
7. **Safe content only:** continue limited, sanitized inline markup. Image/media support is a separate future capability with its own storage, accessibility, and permission design.

## Shared assessment contract

Create a small, versioned question contract for all migrated flows. It must be validated server-side and serialized differently for teachers and students.

### Common fields

```text
questionType                 canonical type or accepted legacy alias
contentVersion               integer, initially 1
instruction                  optional student-facing directions
prompt                       question stem
passageRef                   optional { id, title }
passageSnapshot              populated only where immutable snapshot is needed
options                      [{ id, label, text }] for selection questions
answerDefinition             type-specific server-only key
gradingConfig                type-specific deterministic policy
explanation                  released only when feedback policy allows
points                       positive number, default 1
accessibility                optional text alternatives/read-aloud-safe text
```

Legacy `questionText`, `correctAnswer`, `options`, `matchingPairs`, `passageText`, and string `studentAnswer` fields stay readable. New structured fields are additive. Serializers translate both versions to a single student-safe shape.

### Type contract

| Type | Authoring/key definition | Student response | Deterministic scoring |
| --- | --- | --- | --- |
| Multiple select | 2–6 unique options and 2+ valid `correctOptionIds`; optional partial-credit configuration | Array of option IDs | Exact set equality by default. Configured partial credit uses a documented capped formula and records omissions/incorrect picks. |
| Fill in the blank | Prompt contains stable tokens such as `{{blank:1}}`; each token has accepted normalized variants, optional case sensitivity, and weight | Object keyed by blank ID | Normalize each value by its declared rule and score blanks independently. Empty blanks score zero; no AI semantic matching. |
| Numeric response | Exact value, inclusive range, absolute/relative tolerance, equivalent fraction/decimal rules, optional normalized unit/significant-figure rule | Raw text plus optional unit | Parse with decimal/rational arithmetic, not floating-point equality; compare to the authored rule. |
| Matching | 2–8 stable-ID pairs, optional distractors, one allowed right side per left side | Array of `{ leftId, rightId }` | Score valid pairs independently; full correctness requires every pair; partial score is matched pairs/total × points. |
| Passage-based | Shared `Passage` object plus child questions with `passageRef` | Uses the child type response | Passage affects presentation/snapshotting only. Each child keeps its own standard/skill, score, and feedback. |

### Numeric policy

- Accept integers, decimals, signed values, and fractions only when enabled by the authored rule. Do not evaluate arbitrary expressions.
- Preserve raw input and store a parsed normalized value for grading diagnostics.
- Use a decimal/rational library or equivalent exact parser; never compare JavaScript `Number` values directly for tolerance.
- Use an approved unit family/list. Unsupported or missing required units are incorrect with clear feedback, never silently coerced.
- Define locale format explicitly instead of guessing whether a comma is decimal/thousands punctuation.
- Show the final tolerance/range/unit policy clearly to teachers and snapshot it with the attempt.

### Fill-blank policy

- Blank IDs are stable identifiers, never positional array indexes.
- The editor validates that every token has one definition and every definition appears exactly once.
- Per blank: trim/collapse-space policy, optional case sensitivity, punctuation policy, accepted variants, and weight.
- Numeric blanks use `numeric_response` rules whenever mathematical equivalence is expected.

## Architecture and compatibility approach

### Shared modules

Add a dedicated server-side assessment layer instead of expanding scattered arrays and conditional branches:

```text
constants/assessmentQuestionTypes.js
schemas/assessmentQuestionSchemas.js
services/assessmentQuestionNormalizationService.js
services/assessmentGradingService.js
services/assessmentQuestionSerializer.js
services/assessmentPassageService.js
```

Responsibilities: canonical constants/aliases/metadata; authoring and response validation; normalization; deterministic grading dispatch; student-safe serialization; and adapters for Standards, legacy MAP Prep, and CSV MAP Practice. Flow-specific authorization, timing, gradebook integration, and reporting remain in their existing services/controllers.

Clients can hold labels/icons but obtain capabilities from their authenticated flow endpoint. The server rejects unsupported or malformed types even when submitted by a stale/modified browser.

### Shared client assessment UI

Build one reusable, data-driven assessment UI layer before adding the new types to individual pages. It should live in a shared client location such as `client/src/components/assessment/` (or an existing shared-component area that fits the repository convention), not inside either Standards or MAP pages.

Suggested components and responsibilities:

```text
AssessmentQuestionRenderer      chooses the correct answer control from normalized question data
AssessmentQuestionCard          prompt, instructions, points, status, and consistent accessibility labels
MultipleSelectAnswer            checkbox group and keyboard behavior
FillInBlankAnswer               tokenized prompt and stable blank-ID inputs
NumericResponseAnswer           numeric input, optional unit selector, format feedback
MatchingAnswer                  dropdown/keyboard pairing interface; no drag-only requirement
PassagePanel                    responsive/collapsible passage, source, read-aloud hooks, focus management
AssessmentReviewAnswer          student response, correct response, partial-score, and feedback display
AssessmentQuestionPreview       teacher preview using the same renderer in a teacher-safe mode
assessmentQuestionPresentation  labels, guidance, type icons, response adapters, and display helpers
```

Each feature page remains responsible only for its container and orchestration: loading its own assignment/quiz, authorization state, navigation/progress, autosave endpoint, feedback timing, and feature-specific surrounding layout. It passes a normalized question and callbacks into the shared components. This gives Standards, CSV MAP Practice, legacy MAP Test Prep, and later quiz flows the same behavior, accessibility, and visual semantics while allowing their pages to retain different dashboards, headers, progress treatment, and teacher workflows.

Do not duplicate type-specific markup in `PracticeAnswerForm`, `StudentMapTestPrepPage`, or a legacy MAP renderer. During migration, those components become thin adapters around the shared renderer. The shared UI must support a `mode`/capability configuration (`student`, `student-review`, `teacher-preview`, `teacher-review`; read-only/disabled; feedback visibility; available interaction types) so it never exposes teacher answer data in a student context.

### Additive schemas and lazy compatibility

Do not destructively migrate historic content. Instead:

- Add optional structured key/config/passage fields to active question schemas.
- Add structured `response`, `gradingDetail`, earned/max points, and snapshot fields to attempt/answer schemas while retaining old string fields.
- Read historic documents through a `contentVersion: 0` adapter; create new content as `contentVersion: 1`.
- Snapshot normalized question/passage/key/config/points when a student starts or submits, using the owning flow's established consistency boundary.
- Consider a resumable metadata-only backfill only after read compatibility is shipped and observed; it must never rewrite historic answers or keys.

`Mixed` fields, where needed for structured responses, remain bounded by strict API schema validation; arbitrary JSON is not accepted.

### Shared passages

For new records, introduce a passage entity or embedded shared passage contract:

```text
Passage: school, context owner, passageId, title, text, source/citation, language,
         accessibilityText, contentHash, active, timestamps
Question: passageRef { id, title } or null
Attempt: passage snapshot { id, title, text, source, contentHash } or null
```

Current MAP Practice duplicates `passageText` on questions. Leave old rows readable. On new CSV imports, resolve identical `passage_id`/content rows to a shared passage and reject conflicting content. Preserve the current passage-left/question-right student layout as the baseline responsive design.

### Import/export versions

Existing Standards and MAP CSV templates cannot encode all structures safely. Keep V1 working and add documented V2 templates.

- **Standards V2:** common columns plus `question_type`, `answer_definition_json`, `grading_config_json`, `passage_id`, `passage_title`, `passage_text`, and `points`; use a guided JSON-aware preview.
- **MAP Practice V2:** preserve current headers and aliases, adding `fill_blank_definition`, `numeric_rule`, and optional passage-source metadata. Retain current `matching_pairs` and pipe-separated multi-select keys for V1.
- **Export:** teacher-authorized V2 export may contain keys; student exports never do.
- **Preview:** validate type-specific structure, IDs, options, blank/pair definitions, numeric rules, passage consistency, row/character limits, then return row/column errors without writing data.

#### Required CSV template, sample, and documentation updates

The implementation must update the downloadable examples at the same time as parser support; a new question type is not complete if teachers cannot see a working import row for it.

| Artifact | Required update |
| --- | --- |
| `client/public/map_practice_template.csv` | Publish a V2 template with all required/optional columns and concise inline/documented guidance for `multi_select`, `matching`, `fill_in_blank`, `numeric_response`, and passage references. Preserve a clearly labelled V1 template or compatibility download while V1 remains accepted. |
| `client/public/map_practice_example_student_1.csv` and `client/public/map_practice_example_student_2.csv` | Add realistic, valid examples covering multiple select, matching, fill blank, numeric response, and at least two questions sharing one passage. Use example-only student IDs; never ship production student data. |
| Standards template/download help in `client/src/pages/standards/StandardAssignPage/utils/questionImportCsv.js` and its import UI | Update the generated template, type aliases, column instructions, validation messages, and examples for every new type. Include a full `answer_definition_json` and `grading_config_json` example for fill blank, numeric, matching, and passage-linked questions. |
| CSV parser/validator test fixtures | Add valid V2 files, valid V1 regression files, and invalid fixtures for malformed JSON, invalid numeric policies, missing blank definitions, bad pair/option IDs, and conflicting passage rows. |
| Teacher-facing help/README/import guidance | Explain V1 versus V2, accepted aliases, exact response/key format, partial-credit behavior, passage repetition/reference rules, and how to download an error report. |

### AI generation

AI is an opt-in producer after manual/imported content works. It must produce one requested type at a time and pass the same normalization/schema validation as all other content.

- Strict structured output; validate all options, token/key correspondence, numeric rules, matching IDs, passage constraints, and explanations.
- Models cannot invent permissive tolerances or accepted variants outside constrained rules.
- Bounded retries may retry the requested type; failure leaves a visible empty pool slot, never silently downgrades to another type.
- Passage generation/selection is distinct so multiple questions intentionally share one passage.

## Surface delivery plan

### A. Standards assessments and practice

**Server/model work**

- Expand practice type constants only after shared validation exists.
- Extend `StandardQuestionPool` question subdocuments with contract fields and passage reference.
- Extend `PracticeAttempt` with structured response, question/passage/key snapshots, earned/max points, grading detail, and `unanswered`/`auto_graded`/`pending_teacher_review`/`teacher_overridden` state; preserve `studentAnswer` for legacy reads.
- Extend `StandardAssignment` configuration with allowed types, feedback timing, partial-credit policy, and passage/point behavior.
- Replace type-specific branches in `standardAssignmentService`, `standardsPracticeAIService`, and `standardsPracticeController` with shared validation/serialization/grading calls.
- Update remediation, history, analytics, and gradebook math to use earned/max points while preserving legacy percentage behavior.

**Teacher UI**

- Update `StandardAssignPage` type selectors, assignment rules, pool editor, preview, and import panel.
- Provide specialized editor panels: checkbox options; blank-token composer; numeric-rule builder; matching pair editor; passage attachment/library picker.
- Preview exactly the student-safe UI and show field-level validation errors.
- Update CSV templates, help text, and error reporting for V1/V2.

**Student UI**

- Refactor `PracticeAnswerForm` into a thin adapter around the shared assessment renderer.
- Use the shared checkbox, inline blank, numeric/unit, keyboard-accessible matching, and passage components rather than a Standards-only implementation.
- Preserve keyboard navigation, focus, 44px touch targets, and answers while navigating.
- Never include keys, variants, tolerance, matching map, or explanations before permitted feedback release.

### B. CSV MAP Practice

CSV MAP Practice is the reference implementation for multi-select, matching, shared-passage display, and partial matching scores. Preserve its routes and `MapPractice*` collection boundary.

- Add fill blank/numeric to `mapPracticeQuestionTypes`, model, parser/validator, player, attempt serializer, results/review, and shared grading adapter.
- Keep `mcq`, `multi_select`, `short_text`, and `matching` as accepted import values; map them through adapters rather than a bulk enum rewrite.
- Turn new repeated passages into shared passages; continue reading old repeated `passageText` unchanged.
- Replace the type-specific question markup in the MAP student player with the shared renderer, retaining MAP-only navigation, autosave, text-size/read-aloud settings, and review shell.
- Preserve deterministic/no-AI CSV import and grading, existing review queue rules, partial matching behavior, multi-select policy, autosave/resume, text-size/read-aloud, and answer-key secrecy.

### C. Legacy MAP Test Prep

- Add contract fields additively to `MapPrepQuiz` questions and related attempt/answer data.
- Replace direct three-type generation and comparisons in `mapPrepController` with the shared capability/validator/grader adapter.
- Add teacher controls and the shared student renderer only after serializers protect keys for every feedback mode.
- Historic `MapPrep*` content runs through the version-0 adapter; new sets opt into expanded types; old sets remain playable.
- Test rollback as disabling selection/generation, never deleting stored content.

### D. Other quiz flows

Create and maintain a capability registry:

```text
featureKey, creationMode, questionModel, attemptModel, teacherEditor,
studentRenderer, importer, generator, grader, resultsView, reporting,
supportedTypes, owner, migrationStatus
```

Seed it from grammar, Academic Excellence, reading, social studies, vocabulary, and every flow with `questionType`/`allowedQuestionTypes`. For each flow: adopt shared validation; add renderer/adapter; use secure serializer and grader; verify review/results/reporting/translations; then expose the type. This is the required gate for app-wide support.

## API, security, and reporting

### Capability discovery

Teacher-facing configuration APIs return supported types and policy metadata, for example:

```json
{
  "supportedQuestionTypes": ["multiple_choice", "multiple_select", "fill_in_blank", "numeric_response", "matching"],
  "typeMetadataVersion": 1,
  "gradingPolicies": {
    "multiple_select": { "partialCreditAllowed": true },
    "matching": { "partialCredit": "per_pair" }
  }
}
```

### Endpoint rules

- Authoring accepts versioned definitions and returns normalized content/field-level errors.
- Teacher preview uses the same student serializer, with an explicit teacher-only answer-key preview option.
- Student save/submit validates against the assigned snapshot, not the mutable current question.
- Autosave stores response/timing/flags only; submit freezes snapshot and grades server-side.
- Results/review split student-safe feedback from teacher-only keys and diagnostics.

### Security

- Enforce current school tenant, role/class, and student ownership checks everywhere.
- Students receive only their assigned content; MAP students never receive another student's content/snapshot.
- Withhold answer keys, fill variants, numeric tolerance/range, matching maps, and explanation until feedback release.
- Bound payload sizes for passages/options/blanks/pairs and sanitize rendered markup.
- Audit teacher edits, overrides, import commits, and key changes with actor/timestamp/version/scope.

### Reporting/gradebook

1. Store per-item and per-attempt `earnedPoints`/`maxPoints`; calculate percent explicitly with zero-point safety.
2. Preserve legacy binary display, add partial-correct presentation when points fall between zero and maximum.
3. Attribute each passage child to its own standard/skill; passages are not scored.
4. Include type, content version, grading source, and override in teacher drill-down; do not retroactively change historic totals.
5. Retain pair/option detail only as supplementary analytics, not inflated question-attempt counts.
6. Recalculate aggregates idempotently after teacher overrides.

## Localization, accessibility, and UX requirements

- Add English/Arabic labels, errors, help text, grading messages, import instructions, and screen-reader labels.
- Explicitly test right-to-left/mixed Arabic-English passage, number, label, and matching layouts.
- Every interaction is keyboard-operable with semantic controls; matching has a non-drag fallback (current dropdown-per-term is valid).
- Passage is readable on phones/tablets in a sticky/collapsible region without focus traps and shows title/source when present.
- Preserve responses across validation errors, retries, navigation, refresh, and resume; explain numeric-format errors clearly.
- Never rely on color alone for correct/partial/pending/incorrect state.

## Implementation sequence and gates

### Phase 0 — Inventory and sign-off

- Build the full capability registry and identify model, attempt, reporting, and localization owners.
- Finalize aliases, numeric grammar, scoring formulas, snapshot/response schemas, and V2 CSV examples.

**Gate:** written examples for every type, approved partial-credit/numeric rules, and no unsupported flow claiming a capability.

### Phase 1 — Shared foundation, no UI exposure

- Implement constants, schemas, normalizer, grader, serializer, capability endpoint, unit tests, additive model fields, and version-0 adapters.

**Gate:** legacy attempts deserialize/display as before; malformed structured responses fail; objective-grade fixtures are deterministic; key secrecy tests pass.

### Phase 2 — CSV MAP Practice completion

- Deliver fill blank/numeric through import, preview, player, autosave, results, review, and reports; bridge its existing types/passages to the contract; publish V2 templates.

**Gate:** one MAP set uses all five capabilities, resumes correctly, protects keys, scores points correctly, and leaves historic imports/playback intact.

### Phase 3 — Standards end-to-end

- Deliver type selector, editors, pool import, preview, player, grading, results/review, and gradebook updates. Enable AI only after manual/imported content passes.

**Gate:** one Standards assignment mixes all five capabilities and a shared passage; manual/imported/generated content validates identically; legacy assignments/attempts work.

### Phase 4 — Legacy MAP Test Prep

- Deliver adapter, controlled type rollout, UI, result/review, and historic-record compatibility tests.

**Gate:** historic and new MAP quizzes play, submit, score, and report without conversion or new routes/navigation.

### Phase 5 — Specialized flows

- Migrate one capability-registry flow at a time. Keep selectors restricted until authoring, rendering, grading, review, results, reporting, and localization all pass.

**Gate:** every advertised type has a complete path in that flow.

### Phase 6 — Observability and rollout

- Add metrics for validation/grading/serializer failures, numeric parse failures, review overrides, and key-exposure attempts.
- Feature-flag types per school/flow with server enforcement. Decide later on a metadata-only backfill.

**Gate:** pilot approval, no key-secrecy regression, no unexplained grading errors, and rollback that disables selection/generation without deleting content.

## Test plan

### Shared unit coverage

- Alias normalization/unsupported-type rejection.
- Multiple-select exact/partial scoring, duplicates, no selections, invalid IDs, and rounding.
- Fill-token parsing, missing/duplicate definitions, variants, case/punctuation/space policies, multiple blanks, partial score.
- Numeric integers/decimals/fractions, signs, tolerance/range boundaries, invalid syntax, unit normalization, rounding/precision, locale policy.
- Matching duplicate/unknown IDs, missing selections, shuffled choices, one-to-one rule, partial score, punctuation/Unicode.
- Passage conflicts/content hashes/long text/safe markup/snapshot immutability.
- Serializer answer-key/explanation secrecy for every type and feedback timing.

### API/integration coverage

- Tenant/teacher-class/student ownership for author, preview, save, submit, review, import, export.
- Standards manual and CSV V1/V2 pool creation, AI schema rejection, assignment delivery, gradebook, legacy retrieval.
- MAP Practice V1/V2 parsing, idempotent repeat import, all types, review queue, passage behavior, legacy compatibility.
- Legacy MAP Prep old/new quiz creation, submission, score/results, historic playback.
- Snapshots remain unchanged after later question/passage edits/deactivation.

### Client/manual QA

- Renderer tests for every type on each migrated student surface.
- Shared-component tests for mode boundaries, response adapters/legacy aliases, keyboard behavior, disabled/read-only states, and answer-key secrecy.
- Keyboard-only, screen reader, tablet/phone, reduced-motion, text-size, Arabic/right-to-left mixed-content QA.
- Teacher-editor validation/preview and long-passage/invalid-numeric recovery.
- Student answer preservation after navigation, autosave failure/retry, refresh/resume, feedback-release changes.

## Completion criteria

The project is complete only when:

1. All five capabilities work in Standards assessments, CSV MAP Practice, and legacy MAP Test Prep.
2. Every flow advertising a type provides secure server validation, accessible student rendering, deterministic or explicitly reviewed grading, results/review, and correct reporting.
3. Existing assignments, CSV imports, MAP records, attempts, gradebook entries, and routes work without destructive migration.
4. Teachers can create/preview/import/edit/assign/review; students can save/resume/submit and understand permitted feedback.
5. Automated tests cover validation, grading edges, authorization, key secrecy, compatibility, and aggregation; manual QA covers accessibility/responsiveness.

## Explicit non-goals

- Essay/AI scoring, file upload answers, handwriting recognition, diagram hotspots, and drag-only interaction.
- Replacing all feature-specific quiz models with one collection in the first release.
- Rewriting old answer keys/attempts to canonical types.
- AI grading for objective question types.
- Changing current MAP navigation/routes or putting legacy MAP AI into the deterministic CSV MAP Practice path.
