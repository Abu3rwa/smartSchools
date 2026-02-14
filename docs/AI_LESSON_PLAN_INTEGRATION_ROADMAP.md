# AI Lesson Plan Integration — Roadmap & Implementation Plan

> **Document Version**: 2.0
> **Last Updated**: February 11, 2025  
> **Status**: Planning  
> **Target Branch**: main (via feature branch merge)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [AI Features Overview](#ai-features-overview)
4. [Technical Architecture](#technical-architecture)
5. [Detailed Roadmap](#detailed-roadmap)
6. [Implementation Plan](#implementation-plan)
7. [API Design Specification](#api-design-specification)
8. [Database Schema Changes](#database-schema-changes)
9. [Cost & Performance Considerations](#cost--performance-considerations)
10. [Success Metrics](#success-metrics)
11. [Quick-Start Implementation Checklist](#quick-start-implementation-checklist)
12. [Detailed Prompt Templates](#detailed-prompt-templates)
13. [Inline Auto-Complete Specification](#inline-auto-complete-specification)
14. [Error Handling & Retry Flows](#error-handling--retry-flows)
15. [Testing Strategy](#testing-strategy)
16. [Deployment & Rollback](#deployment--rollback)
17. [Appendix](#appendix)

---

## Executive Summary

This document provides a **detailed roadmap and implementation plan** for integrating AI capabilities into the lesson plan creation workflow. The primary features include:

1. **Auto-complete** — AI-powered suggestions for lesson plan fields (title, summary, description, objectives, vocabulary, etc.) as teachers type or on demand.
2. **Standards Detection** — Automatically detect and suggest curriculum standards that align with the lesson content based on subject, grade level, and lesson text.
3. **Smart Generation** — Generate full lesson plan sections from minimal input (e.g., generate objectives from a title, or expand a brief summary into detailed stages).

The integration leverages the existing Gemini AI infrastructure (`connectAi`, `AITokenUsage`) and aligns with established patterns from `standardsPracticeAIService`, `newsletterAiService`, and `AIService`.

---

## Current State Analysis

### Lesson Plan Model (`models/LessonPlan.js`)

| Field | Type | Description | AI Integration Potential |
|-------|------|-------------|--------------------------|
| `school` | ObjectId | School reference | Context |
| `class` | ObjectId | Class (has `grade`) | Standards matching |
| `subject` | ObjectId | Subject | Standards matching |
| `teacher` | ObjectId | User | Context |
| `date` | Date | Lesson date | Context |
| `title` | String | Lesson title | **Auto-complete, generation** |
| `summary` | String | Brief summary | **Auto-complete, generation** |
| `description` | String | Detailed description | **Auto-complete, generation** |
| `homework` | String | Homework/take-home | **Auto-complete, generation** |
| `previousKnowledge` | String | Prerequisites | **Auto-complete, generation** |
| `teachingObjectives` | String | Standards/objectives | **Standards detection, generation** |
| `vocabulary` | String | Key vocabulary | **Auto-complete, generation** |
| `characterTraitLinks` | String | Soft skills links | **Auto-complete** |
| `techIntegration` | String | Tech integration | **Auto-complete** |
| `stages` | Array | Procedure, materials, timing | **Generation** |

### Standard Model (`models/Standard.js`)

- `code`, `name`, `description`, `subject`, `gradeLevel`, `category`
- Standards are scoped by school and linked to subjects
- Used for practice questions; can be leveraged for lesson plan alignment

### Class Model (`models/Class.js`)

- `grade` (1–12) — Required for standards filtering
- `name`, `section`, `academicYear`

### Existing AI Infrastructure

- **`utils/connectAi.js`** — Google Gemini 2.5 Flash Lite integration
- **`models/AITokenUsage.js`** — Token tracking via `feature`, `school`, `user`, `inputTokens`, `outputTokens`
- **`services/standardsPracticeAIService.js`** — Structured AI prompts, Zod validation
- **`services/aiservice.js`** — Report generation, `trackTokenUsage`
- **`services/newsletterAiService.js`** — Compact prompts, lesson plan context, AITokenUsage pattern

### Lesson Plan UI (`client/src/pages/LessonPlanPage.jsx`)

- Modal form with Basic and Detailed tabs
- Form fields: date, class, subject, title, summary, description, homework, previousKnowledge, teachingObjectives, vocabulary, characterTraitLinks, techIntegration, stages
- No AI assistance currently; all manual input

---

## AI Features Overview

### Feature 1: Auto-Complete

**Description**: As the teacher types in a field (or on explicit request), the AI suggests completions or expansions.

| Field | Trigger | Behavior |
|-------|---------|----------|
| Title | On blur or "Suggest" button | Suggest clearer/more structured titles |
| Summary | On blur or "Suggest" button | Expand brief notes into a concise summary |
| Description | On blur or "Suggest" button | Expand into detailed lesson description |
| Teaching Objectives | On blur or "Suggest" button | Convert informal notes to formal objectives |
| Vocabulary | As user types or button | Suggest age-appropriate vocabulary for the topic |
| Homework | Button | Generate homework aligned with lesson content |
| Stage procedure | Per-stage button | Expand brief procedure into step-by-step instructions |

**UX**: Inline "Suggest" or "✨ AI" button next to each field; optional inline autocomplete (debounced) for vocabulary.

### Feature 2: Standards Detection

**Description**: Given lesson content (title, summary, description, teaching objectives), the AI suggests standards from the school's curriculum that best align with the lesson.

| Input | Output |
|-------|--------|
| Subject ID, Class (grade), lesson text | Array of suggested standards with relevance scores |

**Flow**:
1. Teacher fills in lesson content (or partial content)
2. Clicks "Detect Standards" button
3. Backend fetches school standards for subject + grade
4. AI analyzes lesson text and returns top N matches with explanation
5. Teacher can accept suggested standards (stored as `standardIds` on lesson plan)

**New Model**: Add `standardIds: [ObjectId]` to `LessonPlan` schema to link plans to standards.

### Feature 3: Smart Section Generation

**Description**: Generate entire sections from minimal context.

| Source | Generated Output |
|--------|------------------|
| Title + Subject + Grade | Summary, description, objectives, vocabulary |
| Title + Summary | Full detailed description, stages with procedure/materials/timing |
| Teaching objectives | Vocabulary list, homework suggestions |

**UX**: "Generate from title" or "Expand this" buttons in the form.

---

## Technical Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Lesson Plan Page (React)                           │
│  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐ │
│  │ Title input │  │ Summary textarea  │  │ Teaching Objectives textarea │ │
│  │ [✨ Suggest]│  │ [✨ Suggest]      │  │ [✨ Suggest] [Detect Standards]│ │
│  └──────┬──────┘  └────────┬─────────┘  └──────────────┬───────────────┘ │
└─────────┼──────────────────┼────────────────────────────┼─────────────────┘
          │                  │                            │
          ▼                  ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     lessonSlice / API Calls                               │
│  suggestField() | detectStandards() | generateSection()                   │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Backend API (Express)                                 │
│  POST /api/lessons/ai/suggest                                            │
│  POST /api/lessons/ai/detect-standards                                   │
│  POST /api/lessons/ai/generate-section                                   │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  lessonPlanAIService.js (New)                             │
│  - suggestFieldContent()                                                  │
│  - detectStandardsFromContent()                                           │
│  - generateSection()                                                      │
│  - Uses connectAi(), AITokenUsage                                         │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Standard.find() for standards list                      │
│                  connectAi(prompt) → Gemini                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Structure

```
services/
  lessonPlanAIService.js    # New AI service for lesson plans

controllers/
  lessonPlanController.js   # Add AI handlers or extend

routes/
  lessonPlanRoutes.js       # Add /ai/suggest, /ai/detect-standards, etc.

client/src/
  pages/
    LessonPlanPage.jsx      # Add AI buttons, integrate suggestions
  components/
    lessonPlan/
      AISuggestButton.jsx   # Reusable "Suggest" button
      StandardsSuggester.jsx # Standards detection UI
  store/slices/
    lessonSlice.js          # Add thunks for AI endpoints
```

### Dependency Graph

```
Phase 1 (Foundation):
  lessonPlanAIService.js
    └── depends on: connectAi, AITokenUsage
  lessonPlanController.js (AI handlers)
    └── depends on: lessonPlanAIService, Class, Subject
  lessonPlanRoutes.js
    └── depends on: lessonPlanController
  AISuggestButton.jsx
    └── depends on: lessonSlice (suggestField thunk)
  lessonSlice.js

Phase 2 (Auto-Complete Expansion):
  All fields with AISuggestButton
  generateSection in service + controller + route
  LessonPlanPage "Generate from title" button

Phase 3 (Standards Detection):
  LessonPlan model (standardIds)
  detectStandards in service + controller + route
  StandardsSuggester.jsx
  LessonPlanPage form payload (standardIds)
```

---

## Detailed Roadmap

### Phase 1: Foundation (Weeks 1–2)

**Goal**: Establish AI service, token tracking, and one end-to-end feature (suggest for title/summary).

| ID | Milestone | Deliverables | Acceptance Criteria | Est. Days |
|----|-----------|--------------|---------------------|-----------|
| 1.1 | Create `lessonPlanAIService.js` | Service with `suggestFieldContent()` | Service exists, calls `connectAi` with lesson plan prompts, returns `{ text, tokenUsage }` | 2 |
| 1.2 | Add token tracking | AITokenUsage records with `feature: 'lesson_plan_suggest'` | Each suggest call creates AITokenUsage doc with school, user, tokens | 1 |
| 1.3 | `POST /api/lessons/ai/suggest` | Endpoint accepts `{ field, currentValue, context }`, returns `{ suggestion }` | 200 with suggestion; 400 on invalid input; 500 on AI failure | 1 |
| 1.4 | `AISuggestButton` component | Reusable component with loading state | Renders button, shows spinner on click, calls `onSuggestion(suggestion)` on success | 1 |
| 1.5 | Integrate suggest into Title and Summary | Teacher can click Suggest and see AI-generated text | Suggest replaces/merges field value; toast on error | 1 |

**Phase 1 Total**: ~6 working days

### Phase 2: Auto-Complete Expansion (Weeks 2–3)

**Goal**: Extend suggest to all relevant fields and add generate-section capability.

| ID | Milestone | Deliverables | Acceptance Criteria | Est. Days |
|----|-----------|--------------|---------------------|-----------|
| 2.1 | Suggest for description, objectives, vocabulary, homework | All fields support Suggest | Each field has AISuggestButton; context-aware prompts | 2 |
| 2.2 | Suggest for each stage (procedure, materials, timing) | Stages have per-field Suggest | stageProcedure, stageMaterials, stageTiming field types; stageIndex in request | 2 |
| 2.3 | `POST /api/lessons/ai/generate-section` | Generate multiple fields from title + subject + grade | Returns `{ generated: { summary, description, ... } }` | 1 |
| 2.4 | "Generate from title" button | One-click to fill summary, description, objectives | Button visible when title exists; merges result into form; doesn't overwrite if user has content | 1 |

**Phase 2 Total**: ~6 working days

### Phase 3: Standards Detection (Weeks 3–4)

**Goal**: Detect and suggest standards from lesson content.

| ID | Milestone | Deliverables | Acceptance Criteria | Est. Days |
|----|-----------|--------------|---------------------|-----------|
| 3.1 | Add `standardIds` to LessonPlan schema | Lesson plans can reference standards | Schema has `standardIds: [ObjectId]`; default `[]`; no migration needed | 0.5 |
| 3.2 | `POST /api/lessons/ai/detect-standards` | Returns ranked standards with relevance | Returns `{ standards: [{ standardId, code, name, relevanceScore, explanation }] }` | 2 |
| 3.3 | `StandardsSuggester` component | UI to show suggested standards, accept/reject | Checkboxes for each standard; "Detect Standards" button; loading state | 2 |
| 3.4 | Persist selected standards on save | `standardIds` saved with lesson plan | buildPayload includes standardIds; controller accepts and saves | 0.5 |
| 3.5 | Display linked standards in lesson card | Lesson cards show standard codes/names | Lesson card shows badges/tags for linked standards | 1 |

**Phase 3 Total**: ~6 working days

### Phase 4: Polish & Optimization (Weeks 4–5)

**Goal**: Performance, UX, and cost controls.

| ID | Milestone | Deliverables | Acceptance Criteria | Est. Days |
|----|-----------|--------------|---------------------|-----------|
| 4.1 | Debounced inline suggest (optional) | Vocabulary field can suggest as user types | 500ms debounce; max 1 request per 2s; optional feature flag | 1 |
| 4.2 | Rate limiting / per-user limits | Prevent abuse, control costs | express-rate-limit or similar; 30 suggests/hr, 10 detect/hr, 5 generate/hr | 1 |
| 4.3 | Error handling and fallbacks | Graceful failure, retry options | User sees friendly error; "Retry" button; no uncaught errors | 1 |
| 4.4 | Analytics dashboard for lesson plan AI usage | Token/cost tracking per teacher/school | AITokenUsage aggregation by feature; admin view | 2 |

**Phase 4 Total**: ~5 working days

---

## Implementation Plan

### Step 1: Create `lessonPlanAIService.js`

**File**: `services/lessonPlanAIService.js`

**Responsibilities**:
- `suggestFieldContent({ field, currentValue, context })` — Generate suggestion for a single field
- `detectStandardsFromContent({ schoolId, subjectId, gradeLevel, lessonText })` — Return ranked standards
- `generateSection({ source, context })` — Generate multiple fields from minimal input
- Use `connectAi()` for all prompts
- Return `{ text, tokenUsage }` for tracking

**Prompt Strategy**:
- Include context: subject name, class grade, existing content
- Enforce output format (plain text for suggest; JSON for detect-standards)
- Keep prompts concise to minimize tokens

**Example `suggestFieldContent` prompt structure**:
```
You are an experienced teacher. Given the following lesson context, suggest an improved or expanded value for the field "{field}".

CONTEXT:
- Subject: {subjectName}
- Grade: {gradeLevel}
- Lesson title: {title}
- Current value: {currentValue}

Provide ONLY the suggested text. No explanation, no quotes, no markdown.
```

**Field-specific prompt variations**:
- **title**: "Suggest a clearer, more structured lesson title."
- **summary**: "Expand into a concise 2–3 sentence summary suitable for parents."
- **description**: "Expand into a detailed lesson description with key activities."
- **teachingObjectives**: "Convert to formal learning objectives (SMART format)."
- **vocabulary**: "Suggest 5–8 age-appropriate vocabulary terms, comma-separated."
- **homework**: "Generate homework aligned with the lesson content."
- **stageProcedure**: "Expand into step-by-step procedure instructions."

**Pseudocode**:
```javascript
async suggestFieldContent({ field, currentValue, context }) {
  const prompt = buildSuggestPrompt(field, currentValue, context);
  const response = await connectAi(prompt);
  const suggestion = (response.text || '').trim();
  return {
    text: suggestion,
    tokenUsage: {
      input: response.inputtokenCount || 0,
      output: response.outputtokenCount || 0,
      total: response.totalTokenCount || 0
    }
  };
}
```

### Step 2: Extend LessonPlan Model

**File**: `models/LessonPlan.js`

**Change**:
```javascript
standardIds: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "Standard",
  default: []
}]
```

**Correct schema syntax** (Mongoose default for array):
```javascript
standardIds: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "Standard"
}],
// No default needed; Mongoose treats [] as default for arrays
```

**Migration**: None required; existing docs remain valid.

### Step 3: Add AI Routes and Controller Handlers

**File**: `routes/lessonPlanRoutes.js`

**Route order**: AI routes must be defined **before** `/:id` to avoid "ai" being parsed as an ID.

```javascript
// AI routes (before /:id)
router.post('/ai/suggest', authorize('teacher', 'admin'), suggestField);
router.post('/ai/detect-standards', authorize('teacher', 'admin'), detectStandards);
router.post('/ai/generate-section', authorize('teacher', 'admin'), generateSection);

router.get('/', getLessonPlans);
router.get('/:id', getLessonPlanById);
// ...
```

**File**: `controllers/lessonPlanController.js`

**Handler pseudocode**:

```javascript
export const suggestField = asyncHandler(async (req, res) => {
  const { field, currentValue, subjectId, classId, title, summary, stageIndex } = req.body;
  const schoolId = req.user?.school;
  const userId = req.user?._id;

  // Validate field
  const validFields = ['title','summary','description','homework','teachingObjectives','vocabulary','previousKnowledge','characterTraitLinks','techIntegration','stageProcedure'];
  if (!validFields.includes(field)) return res.status(400).json({ success: false, message: 'Invalid field' });

  // Load Class, Subject for context
  const cls = await Class.findById(classId).lean();
  const subj = await Subject.findById(subjectId).lean();
  if (!cls || !subj) return res.status(404).json({ success: false, message: 'Class or Subject not found' });

  const result = await lessonPlanAIService.suggestFieldContent({
    field, currentValue: currentValue || '',
    context: { subjectName: subj.name, gradeLevel: cls.grade, title: title || '', summary: summary || '', stageIndex }
  });

  // Track tokens
  await AITokenUsage.create({
    model: 'gemini-2.5-flash-lite',
    feature: 'lesson_plan_suggest',
    school: schoolId, user: userId,
    inputTokens: result.tokenUsage.input,
    outputTokens: result.tokenUsage.output,
    totalTokens: result.tokenUsage.total,
    schoolId: schoolId.toString(),
    metadata: { field, subjectId, classId }
  });

  res.json({ success: true, data: { suggestion: result.text, tokenUsage: result.tokenUsage } });
});
```

### Step 4: Frontend Integration

**File**: `client/src/store/slices/lessonSlice.js`

**New Thunks**:
```javascript
suggestField: createAsyncThunk(
  'lessons/suggestField',
  async (payload, { rejectWithValue }) => {
    const res = await api.post('/lessons/ai/suggest', payload);
    if (!res.data.success) throw new Error(res.data.message);
    return res.data.data;
  }
),
detectStandards: createAsyncThunk(
  'lessons/detectStandards',
  async (payload, { rejectWithValue }) => {
    const res = await api.post('/lessons/ai/detect-standards', payload);
    if (!res.data.success) throw new Error(res.data.message);
    return res.data.data;
  }
),
generateSection: createAsyncThunk(
  'lessons/generateSection',
  async (payload, { rejectWithValue }) => {
    const res = await api.post('/lessons/ai/generate-section', payload);
    if (!res.data.success) throw new Error(res.data.message);
    return res.data.data;
  }
)
```

**File**: `client/src/components/lessonPlan/AISuggestButton.jsx`

**Props**: `{ field, currentValue, subjectId, classId, title, summary, stageIndex, onSuggestion, disabled }`

**Behavior**: On click, dispatch `suggestField`, show loading spinner, on success call `onSuggestion(suggestion)` so parent can update form state. Disable when subject/class not selected.

**File**: `client/src/pages/LessonPlanPage.jsx`

**Integrations**:
- Add `standardIds` to formData and lessonToFormData
- Add `<AISuggestButton>` next to title, summary, description, teachingObjectives, vocabulary, homework
- For stages: add Suggest button per procedure textarea
- Add "Generate from title" button that calls `generateSection` and merges result into form
- Add StandardsSuggester in Detailed tab: shows detected standards, checkboxes to select, persist via `standardIds` in payload
- Extend `buildPayload` to include `standardIds`

### Step 5: Token Tracking

**File**: `models/AITokenUsage.js`

**Note**: Use `feature` (not reportType) for lesson plan AI operations. Existing values like `"newsletter_section"` use `feature`. Add:
- `feature: "lesson_plan_suggest"`
- `feature: "lesson_plan_detect_standards"`
- `feature: "lesson_plan_generate_section"`

**Action**: After each `connectAi` call in lessonPlanAIService (or in controller), create `AITokenUsage` document with `feature`, `school`, `user`, `inputTokens`, `outputTokens`, `totalTokens`, `schoolId`, `metadata`.

### Step 6: Standards Detection Logic

**Flow**:
1. Client sends `{ subjectId, classId, lessonText }` (lessonText = title + summary + description + teachingObjectives)
2. Backend loads Class to get `grade`, loads Subject to get name
3. Backend queries `Standard.find({ subject: subjectId, gradeLevel: grade, school: schoolId, isActive: true })`
4. If many standards (>50), compact list for prompt (limit to 50)
5. Build prompt: list standards (code, name, description), ask AI to return JSON array of `{ standardId, relevanceScore, explanation }` for top 5–10 matches
6. Parse JSON, validate, return to client

**Prompt structure**:
```
You are matching curriculum standards to a lesson. Given the lesson text and the list of standards, return the top 5–10 standards that best align.

LESSON TEXT:
{lessonText}

STANDARDS (id, code, name, description):
{standardsList}

Output ONLY valid JSON:
{ "matches": [ { "standardId": "...", "relevanceScore": 0.0-1.0, "explanation": "..." } ] }
```

---

## API Design Specification

### POST `/api/lessons/ai/suggest`

**Request**:
```json
{
  "field": "title" | "summary" | "description" | "homework" | "teachingObjectives" | "vocabulary" | "previousKnowledge" | "characterTraitLinks" | "techIntegration" | "stageProcedure",
  "currentValue": "string",
  "subjectId": "ObjectId",
  "classId": "ObjectId",
  "title": "string (lesson title, for context)",
  "summary": "string (optional)",
  "stageIndex": "number (optional, for stageProcedure)"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "suggestion": "string",
    "tokenUsage": { "input": 123, "output": 45, "total": 168 }
  }
}
```

**Error (400)**: Invalid field, missing subjectId/classId  
**Error (500)**: AI service failure

### POST `/api/lessons/ai/detect-standards`

**Request**:
```json
{
  "subjectId": "ObjectId",
  "classId": "ObjectId",
  "lessonText": "string (combined title, summary, description, objectives)"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "standards": [
      {
        "standardId": "ObjectId",
        "code": "MATH-4.NBT.1",
        "name": "Place Value",
        "description": "...",
        "relevanceScore": 0.92,
        "explanation": "The lesson focuses on place value concepts..."
      }
    ],
    "tokenUsage": { "input": 500, "output": 120, "total": 620 }
  }
}
```

### POST `/api/lessons/ai/generate-section`

**Request**:
```json
{
  "title": "string",
  "subjectId": "ObjectId",
  "classId": "ObjectId",
  "sourceFields": ["summary", "description", "teachingObjectives", "vocabulary"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "generated": {
      "summary": "string",
      "description": "string",
      "teachingObjectives": "string",
      "vocabulary": "string"
    },
    "tokenUsage": { "input": 200, "output": 350, "total": 550 }
  }
}
```

---

## Database Schema Changes

### LessonPlan Schema Addition

```javascript
// models/LessonPlan.js — add to schema
standardIds: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "Standard"
}]
// Default is [] for arrays; no migration needed for existing docs
```

### AITokenUsage (No schema change)

Use existing `feature` field with new values:
- `lesson_plan_suggest`
- `lesson_plan_detect_standards`
- `lesson_plan_generate_section`

### Lesson Plan Payload (Create/Update)

Extend `buildPayload()` in LessonPlanPage and controller to include `standardIds` when saving.

---

## Cost & Performance Considerations

### Token Estimates (Gemini 2.5 Flash)

| Operation | Est. Input | Est. Output | Est. Total | Est. Cost |
|-----------|------------|-------------|------------|-----------|
| Suggest (single field) | 150 | 100 | 250 | ~$0.05 |
| Detect standards | 500 | 150 | 650 | ~$0.13 |
| Generate section | 200 | 400 | 600 | ~$0.17 |

**Pricing** (from existing AIService): input $0.000125/1K, output $0.000375/1K.

### Rate Limiting Recommendations

- Per user: 30 suggests/hour, 10 detect-standards/hour, 5 generate-section/hour
- Per school: 500 AI calls/day (configurable in school settings)

### Caching (Future)

- Cache standards list per subject+grade for 5 minutes to avoid repeated DB reads
- No caching of AI responses (content is unique per request)

---

## Success Metrics

### Technical

- API latency: suggest < 3s, detect-standards < 5s, generate-section < 6s
- Error rate < 2%
- Token tracking accuracy 100%

### User

- Adoption: % of lesson plans created with at least one AI feature
- Suggestion acceptance rate: % of suggestions that user keeps (requires analytics)
- Standards detection usage: % of plans with at least one linked standard

### Business

- Cost per lesson plan (with AI): target < $0.50
- Teacher time saved: estimated 5–10 min per lesson plan

---

## Quick-Start Implementation Checklist

Execute in this order for fastest path to working AI features:

| # | Task | Est. | Dependencies |
|---|------|------|--------------|
| 1 | Add `standardIds` to LessonPlan model | 15 min | None |
| 2 | Create `services/lessonPlanAIService.js` with `suggestFieldContent` | 1–2 hrs | connectAi |
| 3 | Add `POST /api/lessons/ai/suggest` route + controller handler | 30 min | Step 2 |
| 4 | Create `AISuggestButton.jsx` component | 45 min | None |
| 5 | Add `suggestField` thunk to lessonSlice | 20 min | api config |
| 6 | Integrate AISuggestButton into Title and Summary fields | 30 min | Steps 4, 5 |
| 7 | Add token tracking (AITokenUsage) in suggest handler | 20 min | Step 3 |
| 8 | Implement `detectStandardsFromContent` in service | 1 hr | Standards, Class |
| 9 | Add `POST /api/lessons/ai/detect-standards` route | 30 min | Step 8 |
| 10 | Create `StandardsSuggester.jsx` component | 1 hr | Step 9 |
| 11 | Add `generateSection` to service + route | 1 hr | Step 2 |
| 12 | Add "Generate from title" button in form | 30 min | Step 11 |

**Total estimated**: 8–10 hours for core features.

---

## Detailed Prompt Templates

### suggestFieldContent — Title

```
You are an experienced teacher. Suggest a clearer, more structured lesson title.

CONTEXT:
- Subject: {subjectName}
- Grade: {gradeLevel}
- Current title: {currentValue}

Provide ONLY the suggested title. No explanation, no quotes, no markdown. 1 line max.
```

### suggestFieldContent — Summary

```
You are an experienced teacher. Expand the following into a concise 2–3 sentence summary suitable for parents.

CONTEXT:
- Subject: {subjectName}
- Grade: {gradeLevel}
- Lesson title: {title}
- Current value: {currentValue}

Provide ONLY the suggested summary. No explanation, no quotes, no markdown.
```

### suggestFieldContent — Teaching Objectives

```
You are an experienced teacher. Convert these notes into formal, measurable learning objectives (SMART format).

CONTEXT:
- Subject: {subjectName}
- Grade: {gradeLevel}
- Lesson title: {title}
- Current value: {currentValue}

Provide ONLY the objectives. Use bullet points. No explanation, no quotes, no markdown.
```

### suggestFieldContent — Vocabulary

```
You are an experienced teacher. Suggest 5–8 age-appropriate key vocabulary terms for this lesson topic.

CONTEXT:
- Subject: {subjectName}
- Grade: {gradeLevel}
- Lesson title: {title}
- Current value: {currentValue}

Provide ONLY a comma-separated list of terms. No explanation, no quotes, no markdown.
```

### detectStandardsFromContent — AI Prompt

```
You are an expert curriculum analyst. Given the following lesson content and list of standards, select the top 5–10 standards that BEST align with this lesson.

LESSON CONTENT:
{lessonText}

AVAILABLE STANDARDS (subject: {subjectName}, grade: {gradeLevel}):
{standardsList}

For each selected standard, provide:
- standardId (exact _id from the list)
- relevanceScore (0–1)
- explanation (1 sentence why it matches)

Output ONLY valid JSON array:
[
  { "standardId": "...", "relevanceScore": 0.92, "explanation": "..." },
  ...
]
```

### generateSection — AI Prompt

```
You are an experienced teacher. Generate lesson plan sections from the minimal input below.

INPUT:
- Subject: {subjectName}
- Grade: {gradeLevel}
- Title: {title}

Generate the following fields. Use age-appropriate language and pedagogical best practices.
Output ONLY valid JSON:
{
  "summary": "...",
  "description": "...",
  "teachingObjectives": "...",
  "vocabulary": "..."
}
```

---

## Inline Auto-Complete Specification

**Scope**: Vocabulary field only (Phase 4 optional enhancement).

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Min characters before trigger** | 3 | Avoid trivial suggestions |
| **Debounce delay** | 600 ms | Balance responsiveness vs API cost |
| **Max suggestions** | 5 | Keep UI simple |
| **Display** | Dropdown below input | Standard autocomplete UX |
| **Keyboard** | Enter to accept, Escape to dismiss | Accessibility |
| **Cache** | Per session, keyed by (subjectId, classId, prefix) | Reduce duplicate calls |

**Implementation**:
```javascript
// useVocabularySuggest hook
const useVocabularySuggest = (prefix, subjectId, classId) => {
  const [suggestions, setSuggestions] = useState([]);
  const debouncedPrefix = useDebounce(prefix, 600);
  useEffect(() => {
    if (debouncedPrefix.length < 3 || !subjectId || !classId) {
      setSuggestions([]);
      return;
    }
    suggestField({ field: 'vocabulary', currentValue: debouncedPrefix, subjectId, classId })
      .then(res => setSuggestions(res.suggestion.split(',').map(s => s.trim()).slice(0, 5)))
      .catch(() => setSuggestions([]));
  }, [debouncedPrefix, subjectId, classId]);
  return suggestions;
};
```

---

## Error Handling & Retry Flows

### Client-Side

| Scenario | Behavior |
|----------|----------|
| **Network error** | Show toast: "AI suggestion failed. Check connection and try again." |
| **429 (rate limit)** | Show toast: "Too many requests. Please wait a minute." |
| **500 (server error)** | Show toast with retry button; max 2 retries |
| **Timeout (>10s)** | Cancel request, show "Request timed out. Try again." |

### Server-Side

| Scenario | Behavior |
|----------|----------|
| **connectAi throws** | Catch, log, return 503 with message "AI service temporarily unavailable" |
| **Invalid field name** | 400 "Invalid field for suggestion" |
| **Empty standards list** | Return empty array, 200 (no AI call) |
| **JSON parse fail (detect-standards)** | Fallback: return top 3 standards by name similarity (optional) |

### Retry Logic (Backend)

- Do NOT auto-retry connectAi (Gemini may be down)
- Return error to client; client may retry on user action

---

## Testing Strategy

### Unit Tests

| Component | Test Cases |
|-----------|------------|
| lessonPlanAIService | Mock connectAi; verify prompt structure; verify response parsing |
| suggestField controller | Valid input returns 200; invalid field returns 400; missing class returns 404 |
| detectStandards controller | Valid input returns standards; empty standards returns empty array |

### Integration Tests

| Scenario | Steps |
|----------|-------|
| Suggest flow | POST /ai/suggest with valid payload → expect suggestion in response |
| Detect standards flow | POST /ai/detect-standards with lesson text → expect standards array |
| Generate section flow | POST /ai/generate-section → expect generated object |
| Tenant isolation | Request with wrong schoolId → 403 |

### E2E Tests (Optional)

- Open lesson plan modal → click Suggest on title → verify field updates
- Fill lesson content → click Detect Standards → verify standards appear → save → verify standardIds persisted

### Manual QA Checklist

- [ ] Suggest works for each field type
- [ ] Suggest disabled when class/subject not selected
- [ ] Detect Standards shows loading state
- [ ] Selected standards persist on save
- [ ] Generate from title fills multiple fields
- [ ] Error toast on API failure
- [ ] Token usage recorded in AITokenUsage
- [ ] Standards detection returns relevant results for Math/ELA sample lessons
- [ ] Rate limit enforced (if implemented)
- [ ] Graceful degradation when API key missing

---

## Deployment & Rollback

### Pre-Deployment Checklist

- [ ] Environment: `GEMINI_API_KEY` set
- [ ] Database: LessonPlan schema migrated (add standardIds)
- [ ] Feature flag (optional): `ENABLE_LESSON_PLAN_AI=true`

### Deployment Steps

1. Deploy backend (new routes, controller, service)
2. Deploy frontend (new components, LessonPlanPage updates)
3. Verify /api/lessons/ai/suggest returns 200 with mock data
4. Monitor AITokenUsage for lesson_plan_* features

### Rollback Plan

1. **Backend**: Revert lessonPlanRoutes, lessonPlanController (remove AI handlers); keep LessonPlan schema (standardIds can stay)
2. **Frontend**: Revert LessonPlanPage, remove AISuggestButton, StandardsSuggester, lessonSlice thunks
3. **Data**: No data migration needed; standardIds can remain empty

---

## Appendix: File Checklist

---

## Deployment & Rollback

### Pre-Deployment Checklist

- [ ] Environment: `GEMINI_API_KEY` set
- [ ] Database: LessonPlan schema migrated (add standardIds)
- [ ] Feature flag (optional): `ENABLE_LESSON_PLAN_AI=true`

### Deployment Steps

1. Deploy backend (new routes, controller, service)
2. Deploy frontend (new components, LessonPlanPage updates)
3. Verify /api/lessons/ai/suggest returns 200 with mock data
4. Monitor AITokenUsage for lesson_plan_* features

### Rollback Plan

1. **Backend**: Revert lessonPlanRoutes, lessonPlanController (remove AI handlers); keep LessonPlan schema (standardIds can stay)
2. **Frontend**: Revert LessonPlanPage, remove AISuggestButton, StandardsSuggester, lessonSlice thunks
3. **Data**: No data migration needed; standardIds can remain empty

---

## Appendix

### Appendix A: File Checklist

#### Backend

- [ ] `services/lessonPlanAIService.js` — New
- [ ] `controllers/lessonPlanController.js` — Add `suggestField`, `detectStandards`, `generateSection`
- [ ] `routes/lessonPlanRoutes.js` — Add `/ai/suggest`, `/ai/detect-standards`, `/ai/generate-section`
- [ ] `models/LessonPlan.js` — Add `standardIds`
- [ ] `models/AITokenUsage.js` — Document new feature values (optional)

#### Frontend

- [ ] `client/src/components/lessonPlan/AISuggestButton.jsx` — New
- [ ] `client/src/components/lessonPlan/StandardsSuggester.jsx` — New
- [ ] `client/src/store/slices/lessonSlice.js` — Add thunks
- [ ] `client/src/pages/LessonPlanPage.jsx` — Integrate AI components

#### Documentation

- [x] `docs/AI_LESSON_PLAN_INTEGRATION_ROADMAP.md` — This document

### Appendix B: Error Handling Matrix

| Error | HTTP | User Message | Log |
|-------|------|--------------|-----|
| Invalid field | 400 | "Invalid field for suggestion" | Yes |
| Missing subjectId/classId | 400 | "Class and Subject are required" | Yes |
| Class/Subject not found | 404 | "Class or Subject not found" | Yes |
| AI service timeout | 500 | "AI suggestion unavailable. Please try again." | Yes |
| No standards for subject/grade | 200 | Return empty standards array | No |
| Rate limit exceeded | 429 | "Too many requests. Please wait a moment." | Yes |

### Appendix C: UX Wireframe Notes

**Basic Tab**:
- Title: input + [✨ Suggest] button (right-aligned)
- Summary: textarea + [✨ Suggest]
- Description: textarea + [✨ Suggest]
- Homework: textarea + [✨ Suggest]
- [Generate from title] button (prominent, below title)

**Detailed Tab**:
- Teaching Objectives: textarea + [✨ Suggest] + [Detect Standards]
- Vocabulary: input + [✨ Suggest]
- StandardsSuggester: appears after "Detect Standards" click; checkboxes; "Apply selected"
- Each stage: procedure textarea + [✨ Suggest]

### Appendix D: Week-by-Week Gantt Summary

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Phase 1 (Foundation) | lessonPlanAIService, suggest endpoint, AISuggestButton, Title+Summary integration |
| 2 | Phase 2 (Auto-Complete) | All fields Suggest, generate-section, Generate from title button |
| 3 | Phase 3 (Standards) | standardIds, detect-standards endpoint, StandardsSuggester, persistence |
| 4 | Phase 4 (Polish) | Rate limiting, error handling, optional debounced suggest |
| 5 | Phase 4 (Analytics) | Analytics dashboard, documentation |

---

*End of document*
