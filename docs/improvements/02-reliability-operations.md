# Improvement 2: Reliability & Operations

**Category:** Reliability & Operations  
**Priority:** P2 (High)  
**Effort:** Medium  

---

## Summary

Improve application reliability through consistent logging, robust health checks, resilient background jobs, and reliable email delivery with retries and visibility.

---

## Current State

- Mixed use of `console.log` / `console.error` and `logger`
- `/api/health` returns basic JSON only (no DB check)
- Background jobs (attendance reminders, newsletter, substitution expiry) run in-process via `setInterval`
- Email failures are caught and logged but not retried
- No structured observability (metrics, traces, dashboards)

---

## Goals

1. Standardize logging and reduce `console.*` usage
2. Add DB-aware health checks for load balancers and orchestration
3. Improve background job reliability (retries, observability)
4. Add email retry with backoff and delivery state tracking

---

## Scope

### 1. Logging Standardization

**Files with `console.log` / `console.error` (partial list):**
- `services/notificationService.js`
- `services/gmailOAuthService.js`
- `controllers/gradeController.js`, `authController.js`, `attendanceRequestController.js`
- `client/src/` (multiple pages – consider client-side logging service)

**Action:** Replace `console.*` with `logger.info`, `logger.warn`, `logger.error` in server-side code. Use consistent log structure (e.g. `{ event, ...context }`).

### 2. Health Check Enhancement

**Current:**
```javascript
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "GradeBook API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});
```

**Proposed:**
- Add `/api/health/live` – liveness (process is up)
- Add `/api/health/ready` – readiness (DB connected, critical dependencies OK)
- Include MongoDB connection status in readiness
- Optional: check Gmail OAuth availability for notification flows

### 3. Background Job Reliability

**Current:** `setInterval` in `server.js` for:
- Attendance reminders (15 min)
- Newsletter issue scheduler (6 hours)
- Substitution expiry (1 hour)

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| A. Keep `setInterval`, add retry logic | Simple, no new infra | Still process-bound; lost on crash |
| B. BullMQ + Redis | Retries, persistence, observability | Requires Redis; more infra |
| C. Heroku Scheduler / Cron | Decoupled from web process | One-off runs; less granular |

**Recommendation:** Start with Option A – add retry and error boundaries around each job. Move to B if job volume or reliability requirements increase.

### 4. Email Delivery Improvements

**Current:** `notificationService.sendEmail()` throws on failure; controller marks reminder as "failed".

**Proposed:**
- Add `Notification` status transitions: `pending` → `sent` | `failed` | `retrying`
- Implement retry with exponential backoff (e.g. 3 attempts: 1m, 5m, 15m)
- Store `lastError` and `retryCount` on Notification
- Expose failed notifications in admin UI with "Retry" action
- Add `deliveryState` or similar to AttendanceTakingReminder for visibility

---

## Implementation Notes

### Health Check Example

```javascript
// routes/healthRoutes.js
app.get("/api/health/live", (req, res) => res.json({ status: "ok" }));

app.get("/api/health/ready", async (req, res) => {
  const checks = { mongodb: "unknown" };
  try {
    const state = mongoose.connection.readyState;
    checks.mongodb = state === 1 ? "connected" : "disconnected";
  } catch (e) {
    checks.mongodb = "error";
  }
  const ready = checks.mongodb === "connected";
  res.status(ready ? 200 : 503).json({ ready, checks });
});
```

### Logging Migration

- Add ESLint rule to discourage `console.*` in server code
- Create a grep/search list of files to migrate
- Migrate in batches by module

---

## Acceptance Criteria

- [ ] No `console.log`/`console.error` in server code paths (scripts exempt)
- [ ] `/api/health/ready` returns 200 when DB connected, 503 otherwise
- [ ] Liveness endpoint exists for orchestration
- [ ] Email retry logic implemented with at least 2 retries and backoff
- [ ] Failed notification/reminder state visible in admin UI
- [ ] Background jobs log start/end and error counts

---

## Dependencies

- None for health checks and logging
- Redis for BullMQ (optional, future)

---

## References

- [12-Factor App – Processes](https://12factor.net/processes)
- [Heroku – Health Checks](https://devcenter.heroku.com/articles/healthchecks)
- [BullMQ](https://docs.bullmq.io/)
