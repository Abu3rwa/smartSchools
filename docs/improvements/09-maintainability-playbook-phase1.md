# Maintainability Phase 1: Communication Email Slice

## Scope
- Vertical slice: `communication-email` (messaging workflow)
- Goal: reduce change risk and complexity while preserving endpoint behavior

## What changed

### Metrics gates
- Added maintainability scripts in [`package.json`](../../package.json):
  - `lint:maintainability` (complexity + max-lines-per-function gate for slice files)
  - `dup:maintainability` (duplicate detection for slice files via `jscpd`)
  - `coverage:maintainability:check` (coverage threshold for touched maintainability modules via `c8`)
  - `quality:maintainability` (combined gate)
- Fixed cross-platform test script execution by changing:
  - `test: node --test tests`

### Refactor
- Split communication email send workflow into layered modules:
  - [`services/communicationEmailDispatchService.js`](../../services/communicationEmailDispatchService.js)
  - [`services/communicationEmail/dispatchFormatting.js`](../../services/communicationEmail/dispatchFormatting.js)
  - [`services/communicationEmail/dispatchPersistence.js`](../../services/communicationEmail/dispatchPersistence.js)
- Extracted attachment handlers to dedicated controller:
  - [`controllers/communicationEmailAttachmentController.js`](../../controllers/communicationEmailAttachmentController.js)
- Slimmed main communication email controller:
  - [`controllers/communicationEmailController.js`](../../controllers/communicationEmailController.js)
- Kept route handlers thin and moved validation to dedicated validator module:
  - [`routes/communicationEmailRoutes.js`](../../routes/communicationEmailRoutes.js)
  - [`validators/communicationEmailValidators.js`](../../validators/communicationEmailValidators.js)
- Introduced schema-first request validation middleware:
  - [`middleware/schemaValidator.js`](../../middleware/schemaValidator.js)
- Standardized middleware error payload support for validation details:
  - [`middleware/errorHandler.js`](../../middleware/errorHandler.js)

### Tests
- Added send-orchestration tests:
  - [`tests/communicationEmailDispatchService.test.js`](../../tests/communicationEmailDispatchService.test.js)
- Added validator and schema middleware tests:
  - [`tests/communicationEmailValidators.test.js`](../../tests/communicationEmailValidators.test.js)
  - [`tests/schemaValidator.test.js`](../../tests/schemaValidator.test.js)

## Before/After indicators

### File size (target: <= 300 lines)
- Before:
  - `controllers/communicationEmailController.js`: **608**
- After:
  - `controllers/communicationEmailController.js`: **156**
  - `controllers/communicationEmailAttachmentController.js`: **138**
  - `services/communicationEmailDispatchService.js`: **249**
  - `services/communicationEmail/dispatchFormatting.js`: **209**
  - `services/communicationEmail/dispatchPersistence.js`: **244**

### Complexity/function-size gate (target: complexity <= 10, function length <= 40 lines)
- Gate command: `npm run lint:maintainability`
- Result: **PASS** on touched slice files.

### Duplication gate
- Gate command: `npm run dup:maintainability`
- Result: **PASS** under threshold (`1.05%` duplicated lines; threshold `2%`).
- Remaining duplicate in attachment controller can be reduced in next pass.

### Coverage gate (target: >= 70% for touched modules)
- Gate command: `npm run coverage:maintainability:check`
- Result:
  - Statements: **96.69%**
  - Branches: **72.89%**
  - Functions: **100%**
  - Lines: **96.69%**

## Known test baseline issue (outside this slice)
- `npm test` still has one pre-existing failing test:
  - `tests/calendarService.test.js`
  - Failing case: `buildCalendarVisibilityQuery scopes teacher to school-wide and teacher-visible events`

## Next hotspots (recommended next slice)
- `controllers/standardsPracticeController.js` (3351 lines)
- `services/standardsPracticeAIService.js` (1953 lines)
- `services/notificationService.js` (1609 lines)
- `services/communicationEmailService.js` (1557 lines)
- `services/calendarService.js` (1182 lines)

Recommended next vertical slice: **calendar** (existing test failure + large service).
