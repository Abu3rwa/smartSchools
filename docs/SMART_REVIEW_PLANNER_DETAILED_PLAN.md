# Smart Review Planner: Detailed Implementation Plan

## 1. Goal
Build a production-safe **Smart Review Planner** that combines:
- `Spaced Repetition Queue` for students
- `Teacher Intervention Queue` for teachers/admins

The system should increase retention, reduce repeated mistakes, and give teachers clear actions for at-risk students.

---

## 2. Product Scope
### In Scope
- Generate scheduled review tasks per student/standard based on recent performance.
- Automatically prioritize missed concepts using spaced intervals (`1d`, `3d`, `7d`, extendable).
- Expose student-facing review queue in practice flow.
- Expose teacher-facing intervention queue with severity and suggested actions.
- Keep API contracts backward-compatible for existing practice flows.
- Add observability for queue generation, completion, and intervention outcomes.

### Out of Scope (Phase 1)
- Parent notifications
- Full adaptive lesson authoring
- Cross-subject recommendation engine

---

## 3. Architecture Overview
Use modular backend services with clear responsibilities.

### 3.1 New Backend Modules
- `server/models/ReviewTask.js`
- `server/models/InterventionCase.js`
- `server/services/reviewSchedulerService.js`
- `server/services/interventionQueueService.js`
- `server/services/reviewScoringService.js`
- `server/controllers/reviewController.js`
- `server/controllers/interventionController.js`
- `server/routes/reviewRoutes.js`
- `server/routes/interventionRoutes.js`
- `server/schemas/reviewSchemas.js`
- `server/jobs/reviewSchedulerJob.js` (cron/worker entrypoint)

### 3.2 Existing Modules to Integrate
- `server/controllers/practiceController.js`
- `server/models/PracticeAttempt.js`
- `server/models/MasteryRecord.js`
- `server/client/src/store/slices/practiceSlice.js`
- `server/client/src/pages/PracticeSessionPage.jsx`
- `server/client/src/pages/PracticeDashboardPage.jsx`

---

## 4. Data Model Design
### 4.1 `ReviewTask` Model
Represents one scheduled review unit for one student + one standard.

Key fields:
- `school` (`ObjectId`, indexed)
- `student` (`ObjectId`, indexed)
- `standard` (`ObjectId`, indexed)
- `assignment` (`ObjectId`, optional)
- `sourceAttemptId` (`ObjectId`, optional)
- `sourceReason` (`enum`: `incorrect_answer`, `low_confidence`, `decay_check`, `teacher_assigned`)
- `topicTags` (`string[]`)
- `scheduledFor` (`Date`, indexed)
- `dueBy` (`Date`, optional)
- `status` (`enum`: `scheduled`, `in_progress`, `completed`, `expired`, `canceled`)
- `intervalStage` (`number`, e.g. `1,2,3`)
- `intervalDays` (`number`)
- `priorityScore` (`number`, indexed)
- `completion`:
  - `completedAt`
  - `accuracyAtCompletion`
  - `attemptCount`

Indexes:
- `{ school: 1, student: 1, status: 1, scheduledFor: 1 }`
- `{ school: 1, standard: 1, status: 1 }`
- `{ school: 1, priorityScore: -1, status: 1 }`

### 4.2 `InterventionCase` Model
Represents teacher action items for students who need targeted help.

Key fields:
- `school` (`ObjectId`, indexed)
- `student` (`ObjectId`, indexed)
- `standard` (`ObjectId`, indexed)
- `assignment` (`ObjectId`, optional)
- `status` (`enum`: `open`, `acknowledged`, `in_progress`, `resolved`, `dismissed`)
- `riskLevel` (`enum`: `low`, `medium`, `high`)
- `riskScore` (`number`)
- `signals`:
  - `incorrectStreak`
  - `recentAccuracy`
  - `confidenceTrend`
  - `timeSinceLastSuccessDays`
- `recommendedActions` (`string[]`)
- `recentMistakes` (`string[]`)
- `recentTopics` (`string[]`)
- `owner` (`teacher/admin user`, optional)
- `timeline` (`event[]`)
  - `type`, `at`, `by`, `note`

Indexes:
- `{ school: 1, status: 1, riskScore: -1 }`
- `{ school: 1, student: 1, standard: 1, status: 1 }`

---

## 5. Scheduling and Scoring Logic
### 5.1 Spaced Repetition Rules
Initial defaults:
- Stage 1: `+1 day`
- Stage 2: `+3 days`
- Stage 3: `+7 days`

Progression:
- If review session accuracy >= `80%` and no active incorrect streak: move to next stage.
- If accuracy < `60%`: reset to stage 1.
- Else: repeat same stage once.

### 5.2 Review Priority Score (Student Queue)
Weighted formula (Phase 1):
- `incorrectRecencyWeight` (newer mistakes higher)
- `attemptDifficultyWeight` (`hard > medium > easy`)
- `confidencePenalty`
- `masteryDecayPenalty`

Output:
- `priorityScore` normalized to `0-100`.

### 5.3 Intervention Risk Score (Teacher Queue)
Example weighted inputs:
- incorrect streak
- 5-attempt recent accuracy
- repeated same-topic misses
- confidence low trend
- long inactivity after prior mastery

Risk thresholds:
- `high` >= 75
- `medium` >= 45
- `low` < 45

---

## 6. Service Layer Responsibilities
### 6.1 `reviewScoringService.js`
- `computeReviewPriority({ attempts, masteryRecord, confidenceSignals })`
- `computeInterventionRisk({ attempts, sessionContext, masteryRecord })`
- Pure functions only; no DB side effects.

### 6.2 `reviewSchedulerService.js`
- `scheduleFromAttempt({ attemptId })`
- `scheduleForDecayScan({ schoolId, studentId? })`
- `getStudentReviewQueue({ studentId, limit, now })`
- `completeReviewTask({ taskId, outcome })`
- Ensures no duplicate active tasks for same `student + standard + stage`.

### 6.3 `interventionQueueService.js`
- `upsertInterventionCase({ studentId, standardId, signals })`
- `getTeacherInterventionQueue({ classId?, subjectId?, riskLevel?, page })`
- `acknowledgeCase({ caseId, userId })`
- `resolveCase({ caseId, userId, resolutionNote })`

---

## 7. API Contract Plan
Keep existing practice endpoints unchanged in behavior; add new endpoints.

### 7.1 Student Endpoints
- `GET /api/review/queue`
  - Returns prioritized scheduled review tasks for student.
- `POST /api/review/task/:taskId/start`
- `POST /api/review/task/:taskId/complete`

### 7.2 Teacher/Admin Endpoints
- `GET /api/interventions/queue`
  - Filters: `classId`, `subjectId`, `riskLevel`, `status`.
- `POST /api/interventions/:caseId/acknowledge`
- `POST /api/interventions/:caseId/resolve`
- `POST /api/interventions/:caseId/dismiss`

### 7.3 Hook Integration
On `POST /api/practice/submit`:
- After attempt save + mastery update:
  - call `reviewSchedulerService.scheduleFromAttempt(...)`
  - call `interventionQueueService.upsertInterventionCase(...)`

---

## 8. Frontend Plan
### 8.1 Student UI
#### `PracticeDashboardPage`
- Add `Review Queue` card:
  - `Due now`, `Upcoming`, `Completed this week`
- CTA: `Start Review`

#### `PracticeSessionPage`
- Subtle review hint strip:
  - `Next review topic`
  - `Why this matters now`

### 8.2 Teacher UI
Add a new page:
- `client/src/pages/TeacherInterventionQueuePage.jsx`
- `client/src/pages/TeacherInterventionQueuePage.css`

Features:
- Sort by risk score desc
- Quick filters
- Case detail drawer with:
  - recent mistakes
  - trend stats
  - suggested action buttons

---

## 9. Job and Trigger Strategy
### 9.1 Event Trigger (Primary)
- Trigger scheduling immediately on answer submission.

### 9.2 Batch Job (Secondary)
- Nightly job `reviewSchedulerJob`:
  - decay scan
  - stale task expiration
  - risk recalculation

---

## 10. Permissions and Safety
- Student can only access own review tasks.
- Teacher/admin access respects school and class scope.
- All writes pass tenant isolation and role checks.
- Use idempotent upsert logic to prevent duplicate tasks/cases.

---

## 11. Implementation Phases
### Phase 1: Foundations
- Add schemas/models/services.
- Add scheduler hooks in practice submit flow.
- Add student queue read endpoint.

### Phase 2: Teacher Queue
- Add intervention case lifecycle endpoints.
- Build teacher queue UI.

### Phase 3: UX and Tuning
- Improve queue explanations and CTA wording.
- Tune scoring thresholds using real telemetry.

### Phase 4: Hardening
- Add backfill script for existing attempts.
- Add alerting for job failures and queue anomalies.

---

## 12. Testing Strategy
### 12.1 Unit Tests
- `reviewScoringService`: deterministic score outputs
- duplicate prevention logic for tasks
- interval progression and reset behavior

### 12.2 Integration Tests
- submit answer -> review task creation
- submit answer -> intervention case upsert/update
- role-restricted endpoint access

### 12.3 End-to-End Tests
- student completes review queue task
- teacher acknowledges and resolves high-risk case
- no duplicate active tasks after repeated wrong answers

---

## 13. Observability and Metrics
Track:
- `review_tasks_created_total`
- `review_tasks_completed_total`
- `review_completion_accuracy_avg`
- `intervention_cases_open_total`
- `intervention_resolution_time_avg`
- `high_risk_case_rate`

Add structured logs:
- `review_task_scheduled`
- `review_task_completed`
- `intervention_case_upserted`
- `intervention_case_resolved`

---

## 14. Acceptance Criteria
- Student sees prioritized review tasks with due timing.
- Review tasks are created from weak performance signals.
- Teacher sees ranked intervention queue with actionable context.
- Duplicate active review tasks are prevented.
- Existing practice generate/submit/history/mastery flows remain functional.
- Endpoints are role-safe and tenant-safe.

---

## 15. Code Quality and Modularity Standards
- Keep scoring logic pure and isolated in `reviewScoringService`.
- Keep DB orchestration in `reviewSchedulerService` and `interventionQueueService`.
- Keep controllers thin: validate, call service, return response.
- Keep schema validation centralized in `reviewSchemas.js`.
- Use clear DTO names:
  - `ReviewTaskDTO`
  - `InterventionCaseDTO`
  - `ReviewQueueItemDTO`
  - `RiskSignalDTO`
- Avoid cross-module side effects; use explicit method contracts.

---

## 16. Rollout Plan
- Feature flags:
  - `REVIEW_QUEUE_ENABLED`
  - `INTERVENTION_QUEUE_ENABLED`
- Rollout:
  1. internal school pilot
  2. 10% schools
  3. 50% schools
  4. all schools
- Monitor error rate and queue generation anomalies before each step.
