# Production Hardening Update (2026-03-12)

## Scope Applied

This pass focused on high-risk, low-regression production hardening in backend security and reliability paths.

## Implemented Fixes

1. Dependency security updates
- Upgraded `express-rate-limit` to `8.3.1` (from `8.2.1`).
- Upgraded `multer` to `2.1.1` (from `2.0.2`).
- Upgraded `nodemailer` to `8.0.2` (from `6.9.13`).
- Upgraded `@google/genai` to `1.44.0`.
- Removed `useragent` dependency and replaced with internal UA parsing.
- Removed `geoip-lite` dependency; middleware now degrades safely without geo lookups.
- Added override for `glob@10 -> minimatch@^9.0.7`.

2. Credentials hardening
- Updated `services/pushNotificationService.js`:
  - Local `smile3-service-account.json` fallback is now disabled by default in production.
  - New env gate: `ALLOW_LOCAL_SERVICE_ACCOUNT` (dev/local convenience only).
  - Env credentials are now preferred over file fallback.

3. Upload validation hardening
- Updated `middleware/upload.js`:
  - Strict image allowlist by MIME + extension (`jpg/jpeg/png/webp/gif`).
  - Added reusable helper `isAllowedImageUpload`.

4. Error hygiene
- Updated `controllers/lessonPlanCriteriaController.js`:
  - Removed direct `error.message` leakage in 500 responses.

5. Baseline reliability fix
- Updated `services/calendarService.js` teacher custom visibility query logic.
- Fixed known failing calendar contract test path.

6. Environment validation and docs
- Added production warning if `ALLOW_LOCAL_SERVICE_ACCOUNT=true` in `config/validateEnv.js`.
- Updated `.env.example` and `README.md` to document `ALLOW_LOCAL_SERVICE_ACCOUNT`.

## Added Tests

- `tests/behaviorTrackerDeviceInfo.test.js`
- `tests/uploadMiddleware.test.js`
- `tests/pushNotificationServiceConfig.test.js`

## Verification Run

1. Targeted lint on touched files:
```bash
npx eslint middleware/behaviorTracker.js middleware/upload.js services/pushNotificationService.js services/calendarService.js controllers/lessonPlanCriteriaController.js config/validateEnv.js tests/uploadMiddleware.test.js tests/behaviorTrackerDeviceInfo.test.js tests/pushNotificationServiceConfig.test.js
```
Result: pass.

2. Targeted + baseline tests:
```bash
node --test tests/calendarService.test.js tests/uploadMiddleware.test.js tests/behaviorTrackerDeviceInfo.test.js tests/pushNotificationServiceConfig.test.js
npm test
```
Result: pass.

3. Security audit snapshot:
```bash
npm audit --omit=dev --json
```
Result: `high: 0`, `moderate: 0`, `low: 9`.

## Remaining Production Blockers / Follow-ups

1. Repo-wide lint baseline is not clean (`npm run lint` reports many pre-existing errors outside this patch).
2. Frontend still stores auth tokens in `localStorage` (XSS risk profile remains).
3. UI duplication/responsiveness issues from the full app review remain and should be handled in dedicated slices.
4. Remaining low-severity audit items are currently transitive (mostly firebase/google chain); track and update when upstream fixes are available.
