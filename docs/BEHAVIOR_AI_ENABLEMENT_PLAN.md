# Behavior AI Enablement Plan (No AI Integration Yet)

## Goal
Prepare a production-safe, modular rollout plan to add AI support for behavior operations without shipping AI code in this phase.

## Non-Goals (Current Phase)
- No LLM calls
- No AI inference endpoints in production traffic
- No model/provider dependency changes
- No behavior policy automation without human approval

## Foundation Status (Completed in This Phase)
- Enforced safer behavior analytics scoping by role
- Hardened cleanup behavior to avoid unintended cross-tenant deletion for non-super-admin users
- Improved session correlation by propagating `x-session-id` from client API requests
- Improved behavior session lifecycle recovery on stale/invalid session IDs
- Standardized session event telemetry (`session_started`, `session_heartbeat`, `session_ended`)

## AI Feature Scope (Planned)
1. Incident Triage Assistant
- Input: behavior incident draft text + metadata
- Output: suggested `incidentType`, `category`, `severity`, confidence, rationale
- Human-in-the-loop: staff must accept/edit before save

2. Risk Early Warning
- Input: incident history + attendance + standards practice risk + timeline trends
- Output: student-level risk score and reason codes
- Human-in-the-loop: dashboard alert only, no auto-action

3. Follow-up Recommendation Assistant
- Input: incident profile + prior interventions + follow-up status
- Output: prioritized next actions and suggested follow-up date window
- Human-in-the-loop: actionable suggestions only

4. Parent Communication Drafting
- Input: selected incident(s), age band, communication channel
- Output: neutral, policy-aligned draft message
- Human-in-the-loop: always requires reviewer approval

5. Admin Behavior Insight Summaries
- Input: behavior telemetry aggregates + security anomalies
- Output: weekly summary with plain-language trends and recommendations
- Human-in-the-loop: read-only insights

## Modular Architecture Plan

### 1) Domain Contracts
Create strict schema contracts first.

Planned files:
- `server/schemas/behaviorAiSchemas.js`
- `server/schemas/behaviorRiskSchemas.js`

Responsibilities:
- Input/output validation (Zod)
- Enum-safe mapping for incident fields
- Confidence and reason-code structure

### 2) Prompt + Policy Layer
Centralize instruction and guardrails.

Planned files:
- `server/services/behaviorAI/behaviorPromptBuilder.js`
- `server/services/behaviorAI/behaviorPolicyGuard.js`

Responsibilities:
- Stable system prompt templates
- Sensitive data minimization rules
- Policy checks for restricted recommendations

### 3) Orchestration Layer
Single entrypoint per AI use case.

Planned files:
- `server/services/behaviorAI/incidentTriageService.js`
- `server/services/behaviorAI/riskInsightService.js`
- `server/services/behaviorAI/followUpRecommendationService.js`
- `server/services/behaviorAI/parentMessageDraftService.js`

Responsibilities:
- Build model input context
- Call provider adapter
- Validate output and normalize deterministic shape
- Retry on invalid output (max 2)
- Deterministic fallback payload on repeated failure

### 4) Provider Abstraction
Keep vendor lock-in low.

Planned files:
- `server/services/behaviorAI/provider/aiProviderClient.js`
- `server/services/behaviorAI/provider/providerConfig.js`

Responsibilities:
- Provider-agnostic `generateJSON` interface
- Timeout/retry policy
- Cost and latency instrumentation hooks

### 5) API Surface
Expose AI features as opt-in endpoints.

Planned files:
- `server/controllers/behaviorAIController.js`
- `server/routes/behaviorAIRoutes.js`

Responsibilities:
- Role + permission enforcement
- Request validation
- Audit-safe response payloads

### 6) Audit + Observability
Track every AI suggestion lifecycle.

Planned files:
- `server/models/BehaviorAISuggestion.js`
- `server/models/BehaviorAIAuditLog.js`
- `server/services/behaviorAI/behaviorAIAuditService.js`

Responsibilities:
- Save prompt metadata hash (not raw sensitive text where avoidable)
- Store accepted/rejected/edited decisions
- Support explainability and compliance review

## Data Inputs and Readiness Checklist

Required:
- Student behavior incidents (`StudentBehavior`)
- User telemetry events (`Behavior`, `BehaviorSession`)
- Attendance and practice risk signals (existing models/services)

Readiness checks:
- Cross-tenant leakage prevented
- Role scoping verified for admin/department principal
- Stable `sessionId` correlation for activity streams
- Event taxonomy normalized for session lifecycle

## Safety and Governance
- Default mode: recommendation only
- No autonomous disciplinary action
- Configurable “AI disabled” kill switch
- Prompt context redaction for sensitive fields
- Required reviewer identity on AI-assisted saves

## Rollout Plan

### Phase 1: Shadow Mode
- Run AI generation in background for selected schools
- Do not display to users
- Compare AI suggestion vs final staff action for calibration

### Phase 2: Internal Beta
- Show suggestions to admins/department principals only
- Capture accept/edit/reject outcomes
- Tune confidence thresholds and fallback templates

### Phase 3: Controlled GA
- Enable for opted-in schools
- Add weekly AI quality report (precision/coverage/rejection rate)
- Enforce SLA + budget caps

## Metrics (Definition of Success)
- Suggestion acceptance rate (target: >= 40% without policy violations)
- Edit distance trend (target: decreasing over time)
- Manual triage time reduction (target: >= 20%)
- False-high-risk rate (target: below agreed threshold per school policy)
- Zero confirmed cross-tenant data leaks

## Testing Plan (Before AI Release)
- Contract tests for every AI input/output schema
- Failure-path tests for retry + deterministic fallback
- Permission tests by role and tenant
- Redaction tests for sensitive fields
- Snapshot tests for UI rendering of AI suggestions
- Load tests for endpoint latency and concurrency

## Implementation Order (Future Work)
1. Schema contracts + audit models
2. Provider abstraction + policy guard
3. Incident triage service + endpoint (feature-flagged)
4. Risk insights service + endpoint (feature-flagged)
5. Follow-up + parent message services
6. Admin summaries + rollout controls

## Feature Flags (Planned)
- `BEHAVIOR_AI_ENABLED`
- `BEHAVIOR_AI_TRIAGE_ENABLED`
- `BEHAVIOR_AI_RISK_ENABLED`
- `BEHAVIOR_AI_FOLLOWUP_ENABLED`
- `BEHAVIOR_AI_PARENT_DRAFT_ENABLED`

## Open Decisions
- Which schools are pilot candidates
- Required confidence threshold per use case
- Audit retention period for AI suggestion artifacts
- Whether parent draft output should be bilingual by default
