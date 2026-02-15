# Standards Practice Student Output Enhancement Guide

## Purpose
Improve the Standards Practice student experience so outputs are:
- Structured and consistent
- Friendly and motivating
- Personalized with student names
- Clear about what was right or wrong
- Actionable for improvement

This guide is based on the current implementation in:
- `services/standardsPracticeAIService.js`
- `controllers/practiceController.js`
- `client/src/pages/PracticeSessionPage.jsx`
- `schemas/practiceSchemas.js`

## Current State Summary (Observed)
- Feedback is mostly one field (`feedback`) with variable style and depth.
- No student name is passed to generation/evaluation prompts, so feedback is not personalized.
- Multiple choice and true/false use exact matching only; feedback is generic and often short.
- For wrong multiple choice answers, students may only see the correct label (for example `B`) instead of the full correct option text.
- Short-answer evaluation returns only boolean + feedback, with no explicit reasoning structure.
- The UI shows helpful status/progress, but learning feedback blocks are not standardized into repeatable sections.

## Target Experience
Every answer result should feel like a mini coaching message:
1. Greeting with first name
2. Outcome statement (correct/incorrect) in supportive language
3. Why (conceptual explanation)
4. Next step (what to review/do next)
5. Confidence/motivation line

Students should never feel punished by tone. Even incorrect answers should be framed as progress.

## Student-Facing Voice and Tone Standards
- Tone: warm, respectful, encouraging, teacher-like.
- Style: direct, short sentences, age-appropriate vocabulary.
- Personalization: use first name naturally, not repeatedly.
- Avoid: robotic phrasing, harsh correction, sarcasm, or shame language.

Use rules:
- Use student first name in opening line and optionally once more in next-step guidance.
- Cap output length by grade band:
  - Grade 1-3: 30-60 words
  - Grade 4-6: 50-90 words
  - Grade 7-9: 70-120 words
  - Grade 10-12: 90-160 words

## Personalization Requirements
Minimum personalization payload for prompt context:
- `studentFirstName`
- `gradeLevel`
- `subjectName`
- `standardCode` and `standardName`
- `questionType`
- `difficulty`
- `attemptNumber` (optional but useful for coaching tone)

Personalization behavior:
- Correct response: celebrate effort and precision.
- Incorrect response: reassure first, then teach.
- Repeated struggle (multiple incorrect attempts): give smaller next step and review hint.
- Improving streak: explicitly acknowledge growth.

## Recommended Structured Output Contract (For Consistency)
Define a fixed response shape for answer evaluation content so UI can render consistent sections.

Recommended sections:
- `headline`: short verdict message
- `personalGreeting`: includes first name
- `whatYouDidWell`: specific positive observation
- `correctionOrConfirmation`: what is correct and why
- `nextStep`: one actionable step
- `encouragement`: short motivational close
- `displayAnswer`: student-friendly rendering of the correct answer (not just label)
- `explanation`: concise concept explanation
- `reviewTag`: one short topic label to revisit
- `confidenceLevel`: low/medium/high confidence in evaluation

For multiple choice:
- Always return both:
  - correct option label
  - correct option text
- Student-facing message should prefer option text.

For short answer:
- Keep boolean correctness, but also return reason summary and key concept checks.

## Feedback Templates by Outcome
### When Correct
- Start with name + praise.
- Explain why answer is correct in one concise concept statement.
- Add extension challenge for medium/hard levels.

Template flow:
- `"[Name], nice work!"`
- `"You correctly identified ..."`
- `"This shows you understand ..."`
- `"Next, try ..."`

### When Incorrect
- Start with reassurance.
- Clarify the correct idea without negative tone.
- Tell student exactly what to review next.

Template flow:
- `"[Name], good attempt."`
- `"The best answer is ... because ..."`
- `"A helpful way to remember this is ..."`
- `"Try one more with this tip ..."`

### When Partially Correct (short answer)
- Acknowledge what was right first.
- Identify missing piece precisely.
- Ask for one focused retry.

## Prompting Improvements (No-Code Guidance)
- Add explicit prompt instruction for fixed section order and wording constraints.
- Include student first name and grade reading level target.
- Require feedback to be:
  - supportive
  - concrete
  - no more than a defined word range
- Require no mention of AI or model.
- Require culturally neutral, inclusive language.
- Require a safe fallback response if certainty is low.

## Consistency Rules Across Question Types
- Use one shared feedback framework across `multiple_choice`, `true_false`, and `short_answer`.
- Keep result card order stable:
  1. Verdict
  2. Personalized feedback
  3. Correct answer (student-friendly)
  4. Explanation
  5. Next step
  6. Mastery progress
- Avoid switching between long and very short feedback randomly.

## Make the Output More Appealing to Students
### Content Design
- Keep one key idea per paragraph.
- Use plain words before technical terms.
- Include one “You can do this” style line on incorrect attempts.
- Use “next challenge” language on correct attempts.

### UI Copy Recommendations
- Replace generic labels with coaching language:
  - `Correct Answer` -> `Best Answer and Why`
  - `Explanation` -> `Quick Explanation`
  - `Next Question` -> `Try Another Challenge`
- Add a short “Progress today” message tied to session stats.

### Motivation Layer
- Micro-celebrations for:
  - first correct answer
  - streak milestones
  - difficulty increase success
- Growth messaging:
  - “Accuracy improved from X% to Y% this session.”

## Fairness and Student Trust
- For short answers, accept semantically correct variants and minor spelling errors.
- If answer is marked incorrect, explanation must reference expected concept, not just final phrase.
- Do not over-penalize concise but correct responses.
- Flag low-confidence evaluations for softer language (for example: “You are very close”).

## Safety and Quality Guardrails
- Prohibit harmful/shaming language.
- Prohibit identity-based assumptions.
- Keep feedback school-appropriate and age-appropriate.
- Limit exclamation density to avoid artificial tone.
- Keep grammar and punctuation clean and consistent.

## Analytics to Measure Improvement
Track before/after:
- Average feedback length by question type
- Student retry rate after incorrect answer
- Correct-on-next-attempt rate
- Session completion rate
- Time to next question after feedback
- Student sentiment signals (if collected)

Success indicators:
- Higher continuation rate after incorrect answers
- Improved mastery progression for struggling students
- Lower support complaints about confusing feedback

## Prioritized Enhancement Roadmap
### Phase 1 (Immediate)
- Standardize evaluation output sections.
- Add first-name personalization in feedback.
- Ensure correct answer text is always student-visible.
- Harmonize tone across all question types.

### Phase 2 (Short Term)
- Add partial-credit style guidance for short answers.
- Add per-grade feedback length and readability controls.
- Improve “next step” specificity based on recent mistakes.

### Phase 3 (Medium Term)
- Add adaptive encouragement based on streak and confidence.
- Add teacher-configurable tone profile (formal, warm, concise).
- Add multilingual tone consistency where needed.

## Acceptance Checklist
- Feedback includes student first name naturally.
- Every result follows the same section order.
- Incorrect responses include a clear conceptual correction.
- Correct responses include concise “why it is right.”
- Multiple choice shows correct option text, not label alone.
- Feedback length and vocabulary match grade level.
- Tone is supportive in 100% of sampled outputs.
- No AI references appear in student-facing text.

## Final Recommendation
Treat feedback as a structured coaching object, not a single text string.  
This is the biggest change that will improve consistency, personalization, and student appeal while preserving your current architecture.
