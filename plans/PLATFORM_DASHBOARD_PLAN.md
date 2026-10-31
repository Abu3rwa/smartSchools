# Platform Dashboard — Audit & Phased Plan

Status: proposal only, nothing built.
Audited 2026-10-31 against `/admin/dashboard` (`SuperAdminDashboardPage`, sidebar label "Dashboard", page title "Platform Analytics").
Scope: the platform owner's home. Not the school dashboard at `/portal` (`SchoolAdminDashboard`).

---

## What is on screen today

- **5 KPI cards:** total schools, total users, total students, MRR, new demo requests.
- **Quick actions:** Add School, View all schools.
- **Demo requests:** 5 latest + status badge.
- **SaaS analytics:** "Revenue & Growth" bar chart (last 12 months), Current MRR and Total collected pills, Plans pie.
- **Student distribution:** bar chart, one bar per school.
- **Schools table:** name, admin email, users, students, plan, status, view — first page only.

## What is actually wrong

Ordered by how much it misleads, not by size of fix.

1. **The totals are wrong once the platform passes 20 schools.**
   `SuperAdminDashboardPage.jsx:97-104` sums `userCount` / `studentCount` from `GET /schools`, which defaults to `limit=20` (`schoolRoutes.js:1258-1300`). "Total Users" and "Total Students" are really "users and students in the 20 newest schools".

2. **The students-by-school chart only ever sees 20 schools**, for the same reason, and the table has no paging, search or status filter.

3. **"Revenue" is not revenue.** `getSubscriptionAnalytics` groups subscriptions by `createdAt` and sums `billing.amount` (`subscriptionController.js:791-807`). A month with no new schools shows zero revenue even though renewals were paid; upgrades, downgrades and paid invoices never appear. "Total collected" is the only real cash figure on the page and it sits in a small pill.

4. **Money has two sources of truth.** The table shows plan/status from `School.subscription` (embedded, used by feature gating), while MRR comes from the separate `Subscription` collection. Nothing reconciles them, and MRR assumes every `billing.amount` is monthly although `interval` can be `year` (`Subscription.js:102-118`, `subscriptionController.js:817-820`).

5. **Four mount-time requests, no shared state, partial error handling.** `/schools`, demo list, demo summary, `/subscriptions/analytics`. Only the demo section has a loading and error state; if `/schools` fails, the cards silently show zeros — which reads as "no schools".

6. **The schools list is an N+1.** Every school row runs three queries: student count, user count, admin lookup (`schoolRoutes.js:1272-1288`). 20 schools = ~60 round trips just to draw the table.

7. **The sidebar's Analytics page is fake.** `/admin/analytics` renders hardcoded numbers — 4000, 2400, 1389… — in production (`SuperAdminAnalyticsPage.jsx:8-34`). Anyone who opens it sees invented data.

8. **Nothing that needs a decision is on the page.** No trials ending, past-due or expired schools, cancellations, renewals due, pending upgrade requests, unanswered demo requests, inactive schools, AI spend or margin, or pending credit requests. These are the platform owner's actual daily questions.

9. **No time range, no refresh, no staleness.** The subscription analytics call is hardwired to `year`; the rest of the page has no period concept at all.

## Design direction

Same system the school dashboard already uses (`admin/dashboard/SchoolAdminDashboard`): one aggregated request behind a 60-second cache, flat bordered panels, one metric strip, an attention list, a charts row, one table with server-side paging.

No new chart library, no new visual language, no client-side aggregation over raw lists.

---

## Phase 0 — Truth layer (server only, no visual change)

Goal: one endpoint whose numbers can be trusted and that costs one request.

- `GET /api/platform/dashboard` — `superAdminOnly`, implemented as `controllers/platformDashboardController.js` + `routes/platformDashboardRoutes.js`. Reuse the cache helper pattern from `dashboardController.js:14-34`; accept `?refresh=1` and a `range` param (`30d` | `90d` | `12m`).
- Parallel aggregates:
  - **Schools:** total, active, trial, past_due/expired/suspended/cancelled, `isActive:false`, new this month.
  - **People:** active students, staff users, new students this month, schools with at least one `User.lastLogin` in the last 30 days.
  - **Money:** MRR normalized by interval (`year / 12`), ARR, collected in range from paid `invoices`, open invoice total, renewals due in 30/60/90 days (`currentPeriodEnd || billing.nextBillingAt`).
  - **Attention:** trials ending in 14 days; schools with no `lastLogin` in 14 days; schools with no `Attendance` row in 7 days (`{school,date}` index exists); pending `UpgradeRequest`; pending pool credit requests; demo requests open longer than 48 hours.
  - **AI:** this month's requests, provider cost, charged, profit (the aggregation already exists in `aiCreditService.getPlatformCreditOverview`, `:1119-1163`), plus count of schools with an empty pool.
  - **Demo:** counts by status + total (`landingRoutes.js:367-390`).
- Students and staff are counted live; do not trust `Subscription.usage.currentStudents` (written only in `subscriptionController.js:396`) and do not show storage (no writer for `usage.currentStorage`).
- **Reconcile the two subscription sources once**, in this endpoint, and ship a one-off audit script (`scripts/audit-subscription-drift.js`) that lists schools where `School.subscription` and `Subscription` disagree on plan/status.
- Indexes to add only if `explain` shows a collection scan: `Student {school, status}`, `Subscription {status, currentPeriodEnd}`, `User {school, lastLogin}`.
- Tests: controller aggregation with fixtures, presentation tests, and a contract test proving totals do not depend on page size.
- **Acceptance:** cards match `countDocuments` with more than 20 schools; one request; cached p95 < 300 ms, cold < 1.5 s; zero N+1.
- Effort: ~0.5–1 day.

## Phase 1 — Rebuild the screen (the visible gap)

- Static mock in `.preview/` first (EN + AR, desktop + narrow), then implement against Phase 0 data.
- Header: date + one range control that actually filters.
- Metric strip: Schools (active / trial split), Students, Staff, MRR + ARR, AI profit this month.
- **Attention inbox** at the top, max 5 rows, each linking to the right page: trial ending, past due, renewal this week, demo unanswered 48 h, credit request pending, upgrade request pending, school inactive 14 days.
- Keep and restyle: demo requests table, plan mix, schools table.
- Drop the two current charts from this screen; they return in Phase 2/3 with correct data.
- Per-section skeleton, per-section error with retry, no fake zeros; "updated X min ago" + refresh.
- i18n keys in `en` and `ar` under `superAdminDashboard`.
- Retire the fake `/admin/analytics` page: either delete the sidebar item now or replace it in Phase 2.
- Effort: ~1 day.

## Phase 2 — Business & growth

- Growth: net school adds, new students, cancellations/churn, trial→paid conversion, 12-month series.
- Revenue: invoiced vs collected by month from invoices, not subscription creation; collection rate; MRR movement (new / expansion / contraction / churn).
- Plan mix with movement, not just a snapshot pie.
- Refresh or remove `/admin/analytics`; no hardcoded data in either case.
- Effort: ~1 day.

## Phase 3 — School health table

- `GET /api/platform/schools` with server-side `page / limit / search / status / plan / sort`; per row: students used/limit, staff used/limit, last activity (`max(lastLogin)`), renewal date, MRR contribution, health flag.
- Row actions: open school, login-as (`adminId` is already returned), send renewal notice (existing subscription route).
- CSV export of the current filter.
- Migrate `GET /schools` consumers onto this endpoint, or leave the Schools page alone and note the duplication.
- Effort: ~1–1.5 days.

## Phase 4 — AI economics & operations

- AI panel: per-school spend/charged/profit this month, margin vs current markup, pools below threshold, pending requests — linking into `/admin/ai-credit`.
- Demo pipeline as a funnel with age, not a single "new" count.
- Support-access sessions and surveys only if the platform owner actually watches them.
- Effort: ~0.5–1 day.

## Phase 5 — Polish

- Filters persisted in the URL, refresh + staleness label, empty states, narrow-screen pass, focus/aria-live on the inbox, final performance sweep.
- Effort: ~0.5 day.

---

## Not doing

- No chart that does not change a decision.
- No client-side aggregation over raw lists.
- No second dashboard for the same data.
- No changes to the school dashboard in this plan.

## Open decisions

1. **Subscription source of truth:** `School.subscription` (fast, embedded, drives feature gating) vs `Subscription` (money). Recommendation: School.subscription for plan/status display, Subscription for money, nightly reconciliation via the audit script.
2. **AI profit on the home screen:** super-admin-only today, but it is business-sensitive; keep on the dashboard or move behind `/admin/ai-credit`?
3. **Health thresholds:** inactive = 14 days without login, dormant = 7 days without attendance — confirm.
4. **`/admin/analytics`:** delete the nav item in Phase 1, or leave it until Phase 2 replaces it.
