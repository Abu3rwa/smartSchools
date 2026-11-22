# Next Development Plan - GradeBook Pro

Last updated: 2026-02-10  
Planning horizon: next 90 days (12 weeks)  
Audience: product, engineering, QA, operations, and leadership

---

## 1) Purpose of this plan

This document defines the next execution phase for GradeBook Pro.  
It is focused on moving the product from "feature-rich MVP" to "stable, scalable, and commercially ready platform" for schools.

This plan is detailed enough to:

- break down work into sprint tickets
- align frontend, backend, and data changes
- reduce delivery risk through testing and rollout gates
- provide measurable outcomes per milestone

---

## 2) Current baseline (what we have now)

### 2.1 Product capabilities already in place

- School onboarding and school login
- Role-based access control (super_admin, admin, teacher, etc.)
- Core modules:
  - students
  - classes
  - subjects
  - teachers
  - grade entry and grade reports
  - attendance
  - schedule/timetable
  - lesson plans
  - notifications
- AI reporting modules:
  - advanced report generation
  - templates
  - report history
  - token usage analytics
- Multi-tenant data scoping infrastructure
- Platform admin area for school and subscription management

### 2.2 Gaps and risks observed

- No automated CI pipeline in repository
- Very limited automated tests (mostly manual scripts)
- Student delete action is not fully wired in UI flow
- Subscription model naming inconsistency:
  - `School.subscription.plan`: `starter | growth | enterprise`
  - `Subscription.plan`: `starter | professional | enterprise`
- Billing is partially scaffolded; Stripe production workflows are incomplete
- Reporting and export features still need production-level polish
- Operational observability (alerts, dashboarding, runbooks) is incomplete

---

## 3) Strategic goals for next 90 days

1. **Stabilize and harden core school workflows**  
   Reduce defects in student, grade, attendance, and scheduling operations.

2. **Complete report and communication workflows**  
   Deliver reliable parent-ready reports (generation, delivery, history, retries, exports).

3. **Finalize SaaS billing and plan enforcement**  
   Make subscriptions and billing flows production-ready and consistent.

4. **Establish quality and release discipline**  
   Add automated tests, CI quality gates, and release runbooks.

5. **Improve trust signals (security/compliance/ops)**  
   Add stronger monitoring, auditability, and incident response readiness.

---

## 4) Success metrics (KPI targets)

| Area | Metric | Current (est.) | Target by week 12 |
|---|---|---:|---:|
| Reliability | Production error rate (5xx) | unknown | < 1.0% |
| Performance | p95 API response time (core endpoints) | unknown | < 500 ms |
| Product quality | Escaped critical defects per release | high risk | <= 1 |
| Testing | Backend+frontend automated coverage | very low | >= 60% critical paths |
| Reporting | Report delivery success rate | variable | >= 98% |
| Billing | Subscription sync mismatch incidents | present risk | 0 |
| Adoption | Weekly active teachers (pilot schools) | baseline TBD | +30% |

---

## 5) Delivery principles

- Ship in small increments with clear rollback paths.
- Stabilize before scaling new features.
- Every user-facing feature must include analytics and error instrumentation.
- Every critical flow must have at least one automated integration test.
- No production rollout without migration and rollback plan.

---

## 6) Workstreams and detailed scope

## Workstream A - Core workflow completion and UX reliability

### Objective
Make daily teacher/admin workflows fast, complete, and low-friction.

### Scope

1. **Student lifecycle completeness**
   - Implement delete/archive flow end-to-end (UI + API + guardrails)
   - Add confirmation modal with impact warnings
   - Add server-side constraints (cannot hard delete if dependent records exist; archive instead)
   - Expose archive status filters in student list

2. **CSV import hardening**
   - Replace naive CSV parsing with robust parser handling quoted commas
   - Add duplicate detection by student ID and email
   - Add downloadable error report after import
   - Add "dry run import" mode

3. **Grade entry enhancements**
   - Add grade category support in UI and API (`classwork`, `homework`, `test`, custom)
   - Surface category-based summaries in class and student reports
   - Add validation rules for max marks per category

4. **Attendance workflow quality**
   - Add attendance completion indicator per class/day
   - Add "missing attendance" reminders to teacher/admin dashboards
   - Ensure timezone-safe attendance cutoffs by school timezone

### Deliverables

- Student archive/delete release
- CSV import v2
- Grade category rollout
- Attendance completion tracker

### Acceptance criteria

- 0 P1 defects in student/grade/attendance workflows for two consecutive sprints
- CSV import supports quoted fields and returns row-level errors
- Teachers can filter/report grades by category without manual workarounds

---

## Workstream B - Reporting and parent communication

### Objective
Deliver robust, trustworthy communication and reporting flows.

### Scope

1. **Report generation reliability**
   - Add idempotency key support for report generation requests
   - Prevent duplicate report sends on retry/network issues
   - Improve fallback behavior when AI provider fails

2. **Template and versioning**
   - Add template version history
   - Add preview + validation before save
   - Add default template assignment per report type/language

3. **Email delivery operations**
   - Add retry policies with bounded backoff
   - Add delivery state transitions (`pending`, `sent`, `failed`, `retrying`)
   - Add per-recipient error reasons in UI

4. **Exports and distribution**
   - Add PDF export for generated reports
   - Add CSV export for token/cost analytics
   - Add school-level report archive filters and search

### Deliverables

- Reliable report generation and email retry flow
- Template versioning and preview
- Export package (PDF + CSV)

### Acceptance criteria

- Report send success >= 98% in staging/pilot
- Failed sends are visible with actionable retry path
- Exported report files match in-app content and metadata

---

## Workstream C - SaaS billing, plans, and monetization readiness

### Objective
Complete subscription and billing foundation for production onboarding.

### Scope

1. **Plan model unification**
   - Standardize plan names across School and Subscription models
   - Introduce migration script for existing plan values
   - Add compatibility mapper for legacy values during transition

2. **Stripe production integration**
   - Checkout session creation
   - Billing portal link generation
   - Webhook handlers (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`)
   - Signature verification and replay protection

3. **Entitlement enforcement**
   - Enforce feature gates based on active plan/limits
   - Enforce hard limits for students/teachers/classes with grace behavior
   - Show upgrade prompts with clear reason codes

4. **Billing operations UI**
   - Improve super_admin views for:
     - payment history
     - failed invoice queue
     - dunning status
     - school-by-school revenue and MRR

### Deliverables

- Unified plan schema and migration completion
- Stripe end-to-end subscription flow
- Feature gate and usage limit enforcement

### Acceptance criteria

- No plan mismatch records after migration
- Webhook processing has idempotency and audit trail
- Entitlement checks applied on all plan-gated endpoints

---

## Workstream D - Security, compliance, and auditability

### Objective
Increase confidence for school procurement and long-term operations.

### Scope

1. **Tenant isolation verification**
   - Add automated tests for cross-tenant access denial
   - Audit all models/controllers for bypass paths
   - Add explicit safe bypass policy for super_admin operations

2. **Audit log foundation**
   - Add audit log model for sensitive actions:
     - user role changes
     - subscription changes
     - report generation and sends
     - student archive/delete
   - Add queryable admin audit UI (phase 1 read-only)

3. **Security hardening**
   - Tighten input validation for critical endpoints
   - Add request correlation IDs and trace logging
   - Add alerting thresholds for auth and rate-limit violations

4. **Compliance preparation**
   - Data retention and deletion policy document
   - Parent/student data export and deletion process definition
   - Access review process for admin accounts

### Deliverables

- Tenant isolation test suite
- Audit logging v1
- Security controls checklist and runbook

### Acceptance criteria

- Cross-tenant access tests pass 100%
- All high-risk actions create an audit event
- Security checklist signed off before final rollout

---

## Workstream E - Quality engineering, CI/CD, and observability

### Objective
Create predictable release quality and faster incident response.

### Scope

1. **Automated testing**
   - Backend unit tests for controllers/services
   - API integration tests for auth, tenant isolation, reports, billing
   - Frontend component tests for critical forms and flows
   - Smoke E2E tests for:
     - school registration and login
     - teacher grade entry
     - report generation and send

2. **CI pipeline**
   - Add GitHub Actions workflows:
     - lint
     - build
     - test (backend + frontend)
     - artifact retention for test reports
   - Add branch protection quality gates

3. **Observability**
   - Structured logs with request IDs
   - Error tracking integration (Sentry or equivalent)
   - Dashboard for API latency/error rates and queue failures
   - On-call alert routing for high severity failures

### Deliverables

- CI workflows active
- Minimum automated test baseline
- Ops dashboard and alerts

### Acceptance criteria

- No merge to mainline branch without passing pipeline
- Critical path tests run in CI and are stable (< 5% flaky rate)
- P1 incidents have usable traces and runbook steps

---

## 7) 12-week phased timeline

| Phase | Weeks | Primary focus | Exit gate |
|---|---|---|---|
| Phase 0 | Week 1 | Backlog grooming, architecture decisions, instrumentation baseline | Approved technical designs + sprint backlog |
| Phase 1 | Weeks 2-4 | Core workflow stabilization (A) + test foundation (E) | Student/archive + CSV v2 in staging |
| Phase 2 | Weeks 5-7 | Reporting reliability (B) + tenant security tests (D) | Report retry and export in staging |
| Phase 3 | Weeks 8-10 | Billing and entitlement completion (C) + audit logs (D) | Stripe flow validated in staging |
| Phase 4 | Weeks 11-12 | Hardening, pilot rollout, performance tuning | Pilot signoff + go-live checklist complete |

---

## 8) Sprint-by-sprint execution plan

## Sprint 1 (2 weeks) - Stabilization kickoff

### Planned tickets

- A-101 Student archive/delete API and UI completion
- A-102 CSV import parser upgrade and validation matrix
- E-101 Test framework setup (backend + frontend)
- E-102 CI workflow v1 (lint/build/test skeleton)
- D-101 Tenant isolation audit checklist and test cases

### Sprint 1 acceptance

- Student archive flow demoable in staging
- CI runs on every PR
- At least 10 integration tests for core auth and student endpoints

## Sprint 2 (2 weeks) - Reporting reliability

### Planned tickets

- B-201 Report generation idempotency
- B-202 Email retry state machine
- B-203 Template preview + validation
- E-201 E2E smoke tests for report workflow
- D-201 Audit log model and middleware scaffolding

### Sprint 2 acceptance

- Duplicate report sends eliminated in test scenarios
- Failed email retries visible in UI
- Report workflow E2E smoke passes in CI

## Sprint 3 (2 weeks) - Billing foundation

### Planned tickets

- C-301 Plan model unification migration
- C-302 Stripe checkout + webhook handlers
- C-303 Entitlement middleware (plan-gated features)
- D-301 Security regression suite for billing endpoints
- E-301 Performance baseline load test for key APIs

### Sprint 3 acceptance

- Migration is reversible and documented
- Stripe test mode full cycle validated
- Feature gating enforced and tested

## Sprint 4 (2 weeks) - Operational readiness

### Planned tickets

- E-401 Observability dashboard and alerting
- D-401 Audit log read UI for super_admin
- B-401 PDF/CSV export completion
- A-401 Attendance completion indicators
- C-401 Billing ops dashboard enhancements

### Sprint 4 acceptance

- High severity errors trigger alerts
- Audit log events queryable by date, school, actor
- Report exports available and validated

## Sprint 5 and 6 (4 weeks) - Hardening and pilot rollout

### Planned tickets

- Pilot support fixes
- Defect burn-down and performance tuning
- Security checklist closure
- Production runbook and rollback drills

### Final acceptance

- Pilot KPIs achieved
- No unresolved critical defects
- Go-live readiness signoff complete

---

## 9) Data migration plan

### Migration set M1 - Plan normalization

- Map `professional -> growth` or selected final canonical value
- Backfill both School and Subscription records
- Add temporary compatibility mapping for reads
- Remove compatibility layer after migration freeze period

### Migration set M2 - Audit and reporting indexes

- Add indexes for high-volume report history filters
- Add indexes for audit event querying
- Validate index impact using staging perf tests

### Migration controls

- Pre-migration backup
- Dry-run script with row counts
- Post-migration validation report
- Rollback script tested before production execution

---

## 10) Test strategy and quality gates

## 10.1 Test layers

- Unit tests: services, helpers, reducers
- Integration tests: API routes with auth and tenant context
- E2E smoke: browser-level core workflows
- Non-functional:
  - load tests (report generation, student imports)
  - security tests (auth bypass, tenant leakage)

## 10.2 Minimum release quality gates

- Lint passes
- Build passes (client + server)
- Integration suite passes
- E2E smoke passes
- No open P0/P1 defects
- Migration scripts validated in staging

---

## 11) Risk register and mitigation

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Billing model mismatch causes subscription errors | High | Medium | Early migration, compatibility mapper, extensive integration tests |
| AI provider instability affects reporting | Medium | Medium | Retries, fallback model/provider, clear user error states |
| Tenant leakage due to query bypass | Critical | Low-Med | Isolation test suite, secure bypass policy, code audit |
| CI instability slows development | Medium | Medium | Keep CI fast, isolate flaky tests, test ownership |
| Pilot schools request urgent changes mid-rollout | Medium | High | Scope guard + change control window + fast patch lane |

---

## 12) Roles and ownership

- **Product Owner**: prioritize backlog, accept stories, manage pilot feedback
- **Backend Lead**: APIs, data migration, billing, tenant security
- **Frontend Lead**: workflow UX, reporting UI, exports, admin dashboards
- **QA Lead**: test plan, automation, release signoff
- **DevOps/Platform**: CI/CD, observability, incident readiness

Each sprint must have:

- named owner per ticket
- clear definition of done
- demo + retrospective notes

---

## 13) Definition of done (DoD)

A story is done only if:

1. Feature is implemented and reviewed
2. Tests added/updated and passing
3. Analytics/logging added where relevant
4. Documentation updated (API or user docs)
5. Feature validated in staging
6. Rollback and support notes documented for risky changes

---

## 14) Immediate next actions (this week)

1. Approve canonical subscription plan names and migration rules
2. Create sprint tickets from sections 8 and 6
3. Set up CI workflow files and baseline tests
4. Start Sprint 1 with A-101, A-102, E-101, E-102, D-101
5. Schedule weekly risk review for billing and tenant isolation

---

## 15) Appendix - Suggested epic breakdown for issue tracker

- Epic A: Core workflow completion
- Epic B: Reporting and parent communication reliability
- Epic C: Billing and monetization readiness
- Epic D: Security and compliance hardening
- Epic E: Quality, CI/CD, and observability

Each epic should include:

- user stories
- technical design notes
- acceptance tests
- rollout checklist
- post-release monitoring plan

