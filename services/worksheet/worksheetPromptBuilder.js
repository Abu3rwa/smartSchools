import { getLanguageLabel, normalizeRequestedLanguages } from "../../utils/aiLanguageUtils.js";

const resolveLanguages = (requestedLanguages) => {
    return normalizeRequestedLanguages(requestedLanguages, { max: 2, fallback: ["en"] });
};

const buildLanguageRule = (requestedLanguages) => {
    const resolved = resolveLanguages(requestedLanguages);
    const primary = resolved[0] || "en";
    const secondary = resolved[1] || null;
    const primaryLabel = getLanguageLabel(primary);

    if (!secondary) {
        return `LANGUAGE RULE: Write all text in ${primaryLabel} (${primary}).`;
    }
    const secondaryLabel = getLanguageLabel(secondary);
    return `LANGUAGE RULE: Write bilingual text.
- First in ${primaryLabel} (${primary})
- Then " / "
- Then in ${secondaryLabel} (${secondary})`;
};

export default {
    /**
     * Build prompt for OCR extraction – reads student answers from a worksheet image.
     */
    buildOcrExtractionPrompt(language = 'en', totalQuestions = null) {
        const langLabel = getLanguageLabel(language);
        const questionHint = totalQuestions ? `\nThe worksheet has approximately ${totalQuestions} questions.` : '';

        return `You are an expert OCR and document analysis AI. Extract all student answers from this worksheet image.
${questionHint}
The worksheet is in ${langLabel} (${language}).

INSTRUCTIONS:
1. Identify every question on the worksheet by its number.
2. Read the student's answer for each question. Answers may be handwritten, typed in fillable PDF form fields, or digitally entered text.
3. CRITICAL: Look ONLY at what the student actually wrote, typed, circled, or marked in the answer spaces/form fields. Do NOT infer, guess, or generate answers based on the questions. If an answer line, form field, or response area is empty — the student did not answer.
4. If a question appears unanswered, blank, or has no visible student response in the answer area, you MUST set studentAnswer to "" (empty string). Never fill in what you think the correct answer might be.
5. For multiple choice, identify which option the student circled/marked/selected (e.g. "A", "B", "C", "D"). If nothing is selected, set studentAnswer to "".
6. For true/false, read the student's selection. If nothing is selected, set studentAnswer to "".
7. For written answers, transcribe the student's handwriting or typed text as accurately as possible. If the field/line is blank, set studentAnswer to "".
8. Preserve the original language of the student's answer.
9. The printed question text, instructions, and example text are NOT student answers. Only actual student responses (handwritten, typed in form fields, or digitally entered) count.
10. IMPORTANT: Read the worksheet's main task/instructions (e.g. "Write whether the underlined words are an independent clause or a dependent clause"). Include the full task description in the "worksheetInstructions" field. This is critical for understanding what the student is being asked to do.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "worksheetInstructions": "Read each sentence. Write whether the underlined words are an independent clause or a dependent clause.",
  "questions": [
    { "questionNumber": 1, "questionText": "...", "studentAnswer": "...", "answerType": "short_answer" },
    { "questionNumber": 2, "questionText": "...", "studentAnswer": "A", "answerType": "multiple_choice" }
  ],
  "totalDetected": 10,
  "language": "${language}",
  "confidence": 0.92
}

worksheetInstructions: The main task/directions printed on the worksheet telling students what to do. Extract this verbatim or as a close paraphrase.
answerType must be one of: multiple_choice, true_false, fill_in_blank, short_answer, numeric, matching, essay, diagram, other.
Return ONLY valid JSON. No markdown fences, no explanation text.`;
    },

    /**
     * Build prompt for marking with a model answer key.
     */
    buildModelMarkingPrompt(questions, modelAnswers, config = {}) {
        const { spellingTolerance = 'moderate', partialCreditEnabled = true, worksheetInstructions = '' } = config;

        const instructionsBlock = worksheetInstructions
            ? `\nWORKSHEET TASK INSTRUCTIONS (from the worksheet itself):\n"${worksheetInstructions}"\nUse these instructions to understand what students were asked to do. Evaluate answers relative to this task.\n`
            : '';

        const questionList = questions.map((q, i) => {
            const model = modelAnswers.find(m => m.questionNumber === q.questionNumber);
            return `Q${q.questionNumber}: Student="${q.studentAnswer}" | Correct="${model?.answer || 'N/A'}" | Type=${q.answerType}`;
        }).join('\n');

        return `You are a strict but fair teacher marking student answers against an answer key.
${instructionsBlock}
MARKING RULES:
- Spelling tolerance: ${spellingTolerance} (strict=exact match only, moderate=minor typos OK, lenient=meaning-based)
- Partial credit: ${partialCreditEnabled ? 'enabled (award 0.0-1.0 for partially correct)' : 'disabled (binary correct/incorrect only)'}
- For multiple choice / true-false: exact match required regardless of spelling tolerance.
- For numeric answers: value must match (ignore formatting differences like "1,000" vs "1000").

QUESTIONS TO MARK:
${questionList}

OUTPUT FORMAT (strict JSON, no markdown):
{
  "results": [
    {
      "questionNumber": 1,
      "isCorrect": true,
      "partialCredit": null,
      "pointsEarned": 1,
      "pointsTotal": 1,
      "feedback": "Correct!",
      "confidence": 0.98
    }
  ]
}

- pointsEarned must be between 0 and pointsTotal.
- partialCredit is null if full credit or zero, otherwise a decimal 0.0-1.0.
- confidence is your certainty in this evaluation (0.0-1.0).
- feedback should be brief (1-2 sentences max).
Return ONLY valid JSON.`;
    },

    /**
     * Build prompt for AI knowledge marking (no answer key provided).
     */
    buildAiMarkingPrompt(questions, config = {}) {
        const {
            subject = 'General',
            gradeLevel = 5,
            language = 'en',
            spellingTolerance = 'moderate',
            partialCreditEnabled = true,
            feedbackLevel = 'standard',
            worksheetInstructions = ''
        } = config;
        const langLabel = getLanguageLabel(language);

        const questionList = questions.map(q => {
            return `Q${q.questionNumber} [${q.answerType}]: "${q.questionText}" → Student answer: "${q.studentAnswer}"`;
        }).join('\n');

        const feedbackInstructions = {
            minimal: 'Just state correct/incorrect.',
            standard: 'State correct/incorrect and show the correct answer if wrong.',
            detailed: 'State correct/incorrect, show correct answer, and briefly explain why.',
            instructional: 'State correct/incorrect, show correct answer, explain why, and suggest what to review.'
        };

        const instructionsBlock = worksheetInstructions
            ? `\nWORKSHEET TASK INSTRUCTIONS (from the worksheet itself):\n"${worksheetInstructions}"\nUse these instructions to understand what students were asked to do. Evaluate each answer relative to this task, not in isolation.\n`
            : '';

        return `You are an expert ${subject} teacher for grade ${gradeLevel}. Mark these student answers using your knowledge.
The worksheet is in ${langLabel}.
${instructionsBlock}
MARKING RULES:
- Spelling tolerance: ${spellingTolerance}
- Partial credit: ${partialCreditEnabled ? 'enabled' : 'disabled'}
- Feedback level: ${feedbackLevel} — ${feedbackInstructions[feedbackLevel] || feedbackInstructions.standard}
- Be age-appropriate for grade ${gradeLevel} students.
- Accept semantically correct answers even if worded differently from a textbook answer.

QUESTIONS:
${questionList}

OUTPUT FORMAT (strict JSON, no markdown):
{
  "results": [
    {
      "questionNumber": 1,
      "isCorrect": true,
      "partialCredit": null,
      "pointsEarned": 1,
      "pointsTotal": 1,
      "correctAnswer": "The correct answer text",
      "feedback": "...",
      "confidence": 0.90
    }
  ]
}

Return ONLY valid JSON.`;
    },

    /**
     * Build prompt for AI standards detection from question content.
     */
    buildStandardsDetectionPrompt(questions, standards) {
        const standardsList = standards.map(s => `${s.code}: ${s.name} — ${s.description}`).join('\n');
        const questionsList = questions.map(q => `Q${q.questionNumber}: "${q.questionText}"`).join('\n');

        return `You are a curriculum expert. Match each question to the most relevant standard(s) from the provided standards list.

AVAILABLE STANDARDS:
${standardsList}

QUESTIONS:
${questionsList}

OUTPUT FORMAT (strict JSON, no markdown):
{
  "mappings": [
    { "questionNumber": 1, "standardCode": "MATH.5.NF.1", "confidence": 0.92 },
    { "questionNumber": 2, "standardCode": "MATH.5.NF.3", "confidence": 0.85 }
  ]
}

RULES:
- Only match to standards from the provided list. Do not invent standard codes.
- If no standard clearly matches a question, omit that question from the results.
- confidence is your certainty (0.0-1.0). Only include matches with confidence >= 0.60.
Return ONLY valid JSON.`;
    },

    /**
     * Build prompt for student name identification from a worksheet image.
     */
    buildStudentIdPrompt(rosterNames) {
        const nameList = rosterNames.join(', ');

        return `You are reading a student's worksheet. Identify the student's name written on the paper.

CLASS ROSTER (possible names):
${nameList}

INSTRUCTIONS:
1. Look for the student's name at the top of the worksheet (typically in a "Name:" field).
2. Match the handwritten name to the closest name from the roster.
3. If you cannot read the name or it doesn't match any roster name, return null.

OUTPUT FORMAT (strict JSON):
{
  "name": "Ali Hassan",
  "confidence": 0.88
}

If unreadable: { "name": null, "confidence": 0 }
Return ONLY valid JSON.`;
    },

    buildLanguageRule
};
