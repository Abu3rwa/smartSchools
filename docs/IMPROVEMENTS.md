# GradeBook Pro – Improvement Roadmap

**Last updated:** 2026-02-15  
**Status:** Living document – priorities may shift based on user feedback and operational needs

---

## Overview

This document indexes improvement recommendations for the GradeBook Pro application. Each section links to a dedicated markdown file with detailed scope, acceptance criteria, and implementation notes.

The improvements are organized into six categories:

| # | Category | Description | Doc |
|---|----------|-------------|-----|
| 1 | [Testing & Quality](./improvements/01-testing-quality.md) | Automated tests, CI/CD, code quality gates | [→](./improvements/01-testing-quality.md) |
| 2 | [Reliability & Operations](./improvements/02-reliability-operations.md) | Logging, health checks, background jobs, email delivery | [→](./improvements/02-reliability-operations.md) |
| 3 | [Security & Compliance](./improvements/03-security-compliance.md) | Audit logs, tenant isolation, rate limiting | [→](./improvements/03-security-compliance.md) |
| 4 | [Developer Experience](./improvements/04-developer-experience.md) | Env validation, API docs, subscription model cleanup | [→](./improvements/04-developer-experience.md) |
| 5 | [Product & UX](./improvements/05-product-ux.md) | Timezones, student lifecycle, attendance tracking, CSV import | [→](./improvements/05-product-ux.md) |
| 6 | [Quick Wins](./improvements/06-quick-wins.md) | Low-effort, high-impact changes | [→](./improvements/06-quick-wins.md) |

---

## Priority Matrix

| Priority | Category | Effort | Impact |
|----------|----------|--------|--------|
| P0 | Quick Wins | Low | Medium |
| P1 | Testing & Quality | Medium | High |
| P2 | Reliability & Operations | Medium | High |
| P3 | Security & Compliance | Medium | High |
| P4 | Developer Experience | Low–Medium | Medium |
| P5 | Product & UX | Medium–High | High |

---

## Relationship to NEXT_DEVELOPMENT_PLAN.md

This improvement roadmap complements the existing **Next Development Plan** (`NEXT_DEVELOPMENT_PLAN.md`), which covers the 90-day strategic plan. The improvement docs provide:

- **Tactical detail** – Step-by-step guidance for each improvement
- **Technical notes** – Patterns, tools, and code-level considerations
- **Acceptance criteria** – Clear definitions of done

Use both documents together when planning sprints and assigning work.

---

## How to Use

1. **Pick a category** – Start with [Quick Wins](./improvements/06-quick-wins.md) for fast gains.
2. **Read the full doc** – Each linked file contains scope, acceptance criteria, and implementation notes.
3. **Create tickets** – Break down each improvement into Jira/GitHub issues as needed.
4. **Track progress** – Update this index or the individual docs when items are completed.

---

## Contributing

When completing an improvement:

- Update the relevant `.md` file (e.g., mark items as done)
- Add a brief note to the commit message referencing the doc
- Consider adding a "Completed" section at the bottom of the doc with date and PR/ticket link
