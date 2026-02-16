# Lesson Plan "Generate from Title" Enhancement Plan

**Created:** 2026-02-15  
**Issue:** When clicking "Generate from title", not all lesson plan inputs are filled. Time (timing) is not filled by AI. Standards section is not auto-populated from subject's standards.

---

## Current Behavior

1. User selects Class, Subject, enters Title, clicks "✨ Generate from title"
2. Backend `lessonPlanAIService.generateSection()` generates only 4 fields:
   - summary
   - description
   - teachingObjectives
   - vocabulary
3. Frontend maps only those 4 fields to the form
4. **Not generated:** homework, previousKnowledge, characterTraitLinks, techIntegration
5. **Stages:** procedure, materials, **timing** – none are filled by AI
6. **Standards:** StandardsSuggester exists but requires manual "Detect Standards" click; Generate does not auto-detect or fill standardIds

---

## Required Changes

### 1. Expand `generateSection` AI Prompt (lessonPlanAIService.js)

**Generate all lesson plan fields:**
- summary
- description
- teachingObjectives
- vocabulary
- homework
- previousKnowledge
- characterTraitLinks
- techIntegration

**Generate stages with procedure, materials, and timing:**
- For each default stage (Warm Up, Presentation of Content, Guided Practice, Individual Practice, Homework/Take Home Material), AI should output:
  - procedure (step-by-step)
  - materials (comma-separated or short list)
  - timing (e.g. "5 min", "15 min") – **key requirement: timing must be filled**

**Output format:** JSON object including `stages` array with `name`, `procedure`, `materials`, `timing` for each stage.

### 2. Auto-Detect Standards from Subject

**After generating content:**
- Fetch standards for the subject + grade (from Class)
- Call `detectStandardsFromContent` with the combined generated text (title + summary + description + teachingObjectives)
- Return top 5–10 matching standard IDs in the response

**Note:** Standards must be the subject's actual standards - code and description come from the Standard document only. AI selects which standards match; it does not invent or modify standards.

**Orchestration:** The controller (`generateSection` handler) will:
1. Call `lessonPlanAIService.generateSection()` with expanded sourceFields
2. Fetch standards for subject + gradeLevel
3. Call `lessonPlanAIService.detectStandardsFromContent()` with generated lesson text
4. Return `{ generated: {...}, standards: [{ standardId, ... }], tokenUsage }`

### 3. API Response Shape

```json
{
  "success": true,
  "data": {
    "generated": {
      "summary": "...",
      "description": "...",
      "teachingObjectives": "...",
      "vocabulary": "...",
      "homework": "...",
      "previousKnowledge": "...",
      "characterTraitLinks": "...",
      "techIntegration": "...",
      "stages": [
        { "name": "Warm Up", "procedure": "...", "materials": "...", "timing": "5 min" },
        ...
      ]
    },
    "standards": [
      { "standardId": "...", "code": "...", "name": "...", "explanation": "..." }
    ],
    "tokenUsage": { "input": 0, "output": 0, "total": 0 }
  }
}
```

### 4. Frontend Updates (LessonPlanPage.jsx)

- In `handleGenerateFromTitle`, map all generated fields to formData:
  - homework, previousKnowledge, characterTraitLinks, techIntegration
  - stages: full replacement with generated stages (procedure, materials, timing)
  - standardIds: extract from `standards` array (map s.standardId)

---

## Implementation Order

1. **lessonPlanAIService.js** – Expand `generateSection` prompt to include all fields + stages with timing
2. **lessonPlanController.js** – After generateSection, fetch standards, call detectStandardsFromContent, merge into response
3. **LessonPlanPage.jsx** – Update handleGenerateFromTitle to apply all generated fields, stages, and standardIds

---

## Acceptance Criteria

- [x] Clicking "Generate from title" fills: summary, description, teachingObjectives, vocabulary, homework, previousKnowledge, characterTraitLinks, techIntegration
- [x] Each stage (Warm Up, Presentation, etc.) gets procedure, materials, and **timing** filled by AI
- [x] Standards section is auto-populated with detected standards from the subject (no manual "Detect Standards" click required)
- [x] Form reflects all generated content correctly

---

## Files to Modify

| File | Changes |
|------|---------|
| `services/lessonPlanAIService.js` | Expand generateSection prompt; add stages with timing to output |
| `controllers/lessonPlanController.js` | Orchestrate: generateSection + fetch standards + detectStandardsFromContent; return combined |
| `client/src/pages/LessonPlanPage.jsx` | handleGenerateFromTitle: map all fields, stages, standardIds |
