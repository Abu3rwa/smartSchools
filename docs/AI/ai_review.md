AI Features Review

## Scope reviewed

This review covers production AI integrations currently implemented in the repository:

- Student academic report generation
- Lesson plan AI assistant
- Class analytics insights
- Reading assistant
- Standards practice AI
- Newsletter generation
- Shared AI integration and usage tracking

## Current AI feature inventory

### 1) Academic AI reports

- Endpoints: `POST /api/reports/generate-ai`, `POST /api/reports/generate-ai-range`, `POST /api/reports/generate-predefined`.
- Generates parent-facing report content from student grades using `services/aiservice.js`.
- Supports English, Arabic, and bilingual prompt modes.

### 2) Lesson plan AI assistant

- Endpoints: `POST /api/lessons/ai/suggest`, `POST /api/lessons/ai/detect-standards`, `POST /api/lessons/ai/generate-section`.
- Features:
  - Field-by-field smart suggestions
  - Standards matching (restricted to available standards list)
  - Full section generation (summary/objectives/homework/stages)
- Tracks token usage under dedicated `feature` tags.

### 3) Class analytics insights

- Endpoint: `GET /api/classes/:id/insights`.
- Generates short actionable teacher insights from class analytics payload.

### 4) Reading assistant

- Endpoints under `/api/reading` for:
  - Text upload + simplification by reading level
  - Critical-thinking question generation and answer feedback
  - Reading-level support and assignment workflows
- Uses centralized usage logging helper (`logAIUsage`) with metadata.

### 5) Standards practice AI

- Generates standards-aligned practice questions.
- Evaluates student responses with schema-based validation and retry logic.

### 6) Newsletter AI

- Builds weekly newsletter sections using lesson plans and class context.
- Enforces structured JSON output and word-bound controls.

---

## Strengths observed

1. **Central AI connector abstraction**
   - Most features use `utils/connectAi.js`, keeping model/provider interaction consistent.

2. **Token usage tracking is broadly implemented**
   - `AITokenUsage` is used in multiple AI flows.
   - Reading flows also use `utils/aiUsageTracker.js` for reusable logging.

3. **Output constraints are explicit in prompts**
   - Many prompts explicitly force JSON-only or HTML-only output and disallow markdown.

4. **Tenant-awareness exists in major AI flows**
   - Lesson plan, class analytics, and reading endpoints include school scoping checks.

5. **Good practical UX AI coverage**
   - AI supports teacher workload reduction in planning, parent communication, and diagnostics.

---

## Key risks and gaps

### High priority

1. **AI-specific rate limiting is likely not applied to most real AI endpoints**
   - `aiLimiter` is mounted at `/api/ai`, while most AI endpoints are under `/api/reports`, `/api/lessons`, `/api/classes`, and `/api/reading`.
   - Result: production AI routes may bypass the stricter AI limiter.

2. **Inconsistent usage logging patterns across services**
   - Some services use direct `AITokenUsage.create`, others use `logAIUsage`, and pricing logic appears duplicated.
   - Result: higher maintenance overhead and potential analytics inconsistencies.

### Medium priority

3. **Potential tenant/access validation gap in academic report endpoints**
   - `generateAIReport` and `generateAIReportByDateRange` fetch students by ID without explicit school ownership check in-controller.
   - If tenant safeguards are not fully guaranteed elsewhere, this may risk cross-tenant data exposure.

4. **Prompt-safety/guardrail policy is not centrally enforced**
   - Prompt constraints are currently feature-specific and repeated.
   - Result: inconsistent moderation posture and output safety controls over time.

5. **No explicit AI feature flag/kill-switch pattern consistently applied**
   - Some planning docs mention flags, but implementation appears uneven.
   - Result: harder incident response if provider/model behavior regresses.

### Low priority

6. **Model naming and pricing references are fragmented**
   - Multiple files hardcode model names and pricing assumptions.
   - Result: model upgrades become error-prone.

---

## Recommended actions

### Immediate (1-2 sprints)

1. Apply the AI limiter middleware to all AI-serving routes (or add route-level AI limiters).
2. Standardize usage logging via `logAIUsage` (single path for cost + token extraction).
3. Add explicit school ownership checks in academic report controllers when fetching students.
4. Add consistent AI feature flags (`ENABLE_*`) for each major AI domain.

### Near term

5. Introduce a shared prompt guard/policy utility for:
   - PII minimization
   - output format contracts
   - forbidden content categories
6. Centralize model configuration and pricing in one module consumed by all AI services.

### Quality/ops

7. Add contract tests for strict output formats (JSON/HTML parsers).
8. Add dashboard alerts for AI error-rate spikes and token cost anomalies by `feature`.

---

## Overall assessment

The project already has **strong AI feature breadth** and practical classroom value. The main improvements needed are **operational hardening and consistency**: route-level limiting, unified usage tracking, and explicit tenant-safe checks in every AI controller path.
