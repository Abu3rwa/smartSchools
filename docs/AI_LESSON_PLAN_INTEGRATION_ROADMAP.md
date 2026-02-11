# AI Lesson Plan Integration Roadmap & Implementation Plan

> **Document Version**: 1.1  
> **Last Updated**: February 11, 2025  
> **Status**: Planning

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

---

## Executive Summary

This document outlines a comprehensive plan to integrate AI capabilities into the lesson plan creation workflow. The primary features include:

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

### Existing AI Infrastructure

- **`utils/connectAi.js`** — Google Gemini 2.5 Flash Lite integration
- **`models/AITokenUsage.js`** — Token tracking for cost/analytics
- **`services/standardsPracticeAIService.js`** — Structured AI prompts, Zod validation, token usage
- **`services/aiservice.js`** — Report generation, `trackTokenUsage`
- **`services/newsletterAiService.js`** — Compact prompts, lesson plan context

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

---

## Detailed Roadmap

### Phase 1: Foundation (Weeks 1–2)

**Goal**: Establish AI service, token tracking, and one end-to-end feature (e.g., suggest for title/summary).

| Milestone | Deliverables | Success Criteria |
|-----------|--------------|------------------|
| 1.1 | Create `lessonPlanAIService.js` | Service exists, can call `connectAi` with lesson plan prompts |
| 1.2 | Add token tracking for `lesson_plan_*` | AITokenUsage records `reportType: 'lesson_plan_suggest'` etc. |
| 1.3 | `POST /api/lessons/ai/suggest` endpoint | Accepts `{ field, currentValue, context }`, returns `{ suggestion }` |
| 1.4 | `AISuggestButton` component | Reusable component with loading state |
| 1.5 | Integrate suggest into Title and Summary | Teacher can click Suggest and see AI-generated text |

### Phase 2: Auto-Complete Expansion (Weeks 2–3)

**Goal**: Extend suggest to all relevant fields and add generate-section capability.

| Milestone | Deliverables | Success Criteria |
|-----------|--------------|------------------|
| 2.1 | Suggest for description, objectives, vocabulary, homework | All fields support Suggest |
| 2.2 | Suggest for each stage (procedure, materials, timing) | Stages have per-field Suggest |
| 2.3 | `POST /api/lessons/ai/generate-section` | Generate multiple fields from title + subject + grade |
| 2.4 | "Generate from title" button in form | One-click to fill summary, description, objectives |

### Phase 3: Standards Detection (Weeks 3–4)

**Goal**: Detect and suggest standards from lesson content.

| Milestone | Deliverables | Success Criteria |
|-----------|--------------|------------------|
| 3.1 | Add `standardIds` to LessonPlan schema | Lesson plans can reference standards |
| 3.2 | `POST /api/lessons/ai/detect-standards` | Returns ranked standards with relevance |
| 3.3 | `StandardsSuggester` component | UI to show suggested standards, accept/reject |
| 3.4 | Persist selected standards on save | `standardIds` saved with lesson plan |
| 3.5 | Display linked standards in lesson card | Lesson cards show standard codes/names |

### Phase 4: Polish & Optimization (Weeks 4–5)

**Goal**: Performance, UX, and cost controls.

| Milestone | Deliverables | Success Criteria |
|-----------|--------------|------------------|
| 4.1 | Debounced inline suggest (optional) | Vocabulary field can suggest as user types |
| 4.2 | Rate limiting / per-user limits | Prevent abuse, control costs |
| 4.3 | Error handling and fallbacks | Graceful failure, retry options |
| 4.4 | Analytics dashboard for lesson plan AI usage | Token/cost tracking per teacher/school |

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

**Migration**: None required if default is empty array; existing docs remain valid.

### Step 3: Add AI Routes and Controller Handlers

**File**: `routes/lessonPlanRoutes.js`

**New Routes**:
```javascript
router.post('/ai/suggest', authorize('teacher', 'admin'), suggestField);
router.post('/ai/detect-standards', authorize('teacher', 'admin'), detectStandards);
router.post('/ai/generate-section', authorize('teacher', 'admin'), generateSection);
```

**File**: `controllers/lessonPlanController.js` (or new `lessonPlanAIController.js`)

**Handlers**:
- `suggestField`: Validate `{ field, currentValue, subjectId, classId, ... }`, call service, track tokens, return `{ suggestion }`
- `detectStandards`: Validate `{ subjectId, classId, lessonText }`, fetch standards, call service, return `{ standards: [{ standardId, code, name, relevance, explanation }] }`
- `generateSection`: Validate `{ title, subjectId, classId, sourceFields }`, call service, return `{ generated: { summary, description, ... } }`

**Authorization**: Reuse `authorize('teacher', 'admin')`; ensure tenant isolation (school from `req.user` or request body).

### Step 4: Frontend Integration

**File**: `client/src/store/slices/lessonSlice.js`

**New Thunks**:
```javascript
suggestField: createAsyncThunk(
  'lessons/suggestField',
  async ({ field, currentValue, subjectId, classId, ... }, { rejectWithValue }) => {
    const res = await api.post('/api/lessons/ai/suggest', { field, currentValue, subjectId, classId, ... });
    if (!res.data.success) throw new Error(res.data.message);
    return res.data.data;
  }
),
detectStandards: createAsyncThunk(...),
generateSection: createAsyncThunk(...)
```

**File**: `client/src/components/lessonPlan/AISuggestButton.jsx`

**Props**: `{ field, currentValue, subjectId, classId, onSuggestion }`

**Behavior**: On click, dispatch `suggestField`, show loading spinner, on success call `onSuggestion(suggestion)` so parent can update form state.

**File**: `client/src/pages/LessonPlanPage.jsx`

**Integrations**:
- Add `<AISuggestButton>` next to title, summary, description, teachingObjectives, vocabulary, homework
- For stages: add Suggest button per procedure textarea
- Add "Generate from title" button that calls `generateSection` and merges result into form
- Add StandardsSuggester in Detailed tab: shows detected standards, checkboxes to select, persist via `standardIds` in payload

### Step 5: Token Tracking

**File**: `models/AITokenUsage.js`

**Existing**: Use the `feature` field (indexed, flexible) for lesson plan AI analytics. Values: `'lesson_plan_suggest'`, `'lesson_plan_detect_standards'`, `'lesson_plan_generate_section'`.

**File**: `services/lessonPlanAIService.js` or controller

**Action**: After each `connectAi` call, create `AITokenUsage` document with `feature`, `user`, `school`, `inputTokens`, `outputTokens`, `estimatedCost`.

### Step 6: Standards Detection Logic

**Flow**:
1. Client sends `{ subjectId, classId, lessonText }` (lessonText = title + summary + description + teachingObjectives)
2. Backend loads Class to get `grade`, loads Subject to get name
3. Backend queries `Standard.find({ subject: subjectId, gradeLevel: grade, school: schoolId, isActive: true })`
4. If many standards (>20), optionally limit to top 50 by relevance or category
5. Build prompt: list standards (code, name, description), ask AI to return JSON array of `{ standardId, relevanceScore, explanation }` for top 5–10 matches
6. Return to client for UI display

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

| Component | What to Test |
|-----------|--------------|
| `lessonPlanAIService.suggestFieldContent` | Mock connectAi; verify prompt structure, output parsing |
| `lessonPlanAIService.detectStandardsFromContent` | Mock connectAi + Standard.find; verify JSON parse, top N |
| Controller handlers | Mock service; verify 200/400/403, response shape |

### Integration Tests

| Scenario | Steps |
|----------|-------|
| Suggest flow | POST /ai/suggest with valid payload → 200, suggestion present |
| Detect standards | POST /ai/detect-standards → 200, standards array |
| Tenant isolation | Request with wrong schoolId → 403 |

### E2E Tests (Optional)

- Open lesson modal → click Suggest on title → verify suggestion appears in field
- Fill lesson → click Detect Standards → verify standards list → save → verify standardIds persisted

### Manual QA Checklist

- [ ] Suggest works for each field type
- [ ] Standards detection returns relevant results for Math/ELA sample lessons
- [ ] Generate from title populates all requested fields
- [ ] Token usage recorded in AITokenUsage
- [ ] Rate limit enforced (if implemented)
- [ ] Graceful degradation when API key missing

---

## Appendix: File Checklist

### Backend

- [ ] `services/lessonPlanAIService.js` — New
- [ ] `controllers/lessonPlanController.js` — Add `suggestField`, `detectStandards`, `generateSection`
- [ ] `routes/lessonPlanRoutes.js` — Add `/ai/suggest`, `/ai/detect-standards`, `/ai/generate-section`
- [ ] `models/LessonPlan.js` — Add `standardIds`
- [ ] `models/AITokenUsage.js` — Document new feature values (optional doc update)

### Frontend

- [ ] `client/src/components/lessonPlan/AISuggestButton.jsx` — New
- [ ] `client/src/components/lessonPlan/StandardsSuggester.jsx` — New
- [ ] `client/src/store/slices/lessonSlice.js` — Add thunks
- [ ] `client/src/pages/LessonPlanPage.jsx` — Integrate AI components

### Documentation

- [x] `docs/AI_LESSON_PLAN_INTEGRATION_ROADMAP.md` — This document
