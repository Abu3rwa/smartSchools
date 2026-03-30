import { getLanguageLabel, normalizeRequestedLanguages } from "../../utils/aiLanguageUtils.js";

export default {
  _resolveRequestedLanguages(requestedLanguages) {
    return normalizeRequestedLanguages(requestedLanguages, {
      max: 2,
      fallback: ["en"],
    });
  },

  _buildPromptLanguageRule(requestedLanguages) {
    const resolved = this._resolveRequestedLanguages(requestedLanguages);
    const primary = resolved[0] || "en";
    const secondary = resolved[1] || null;
    const primaryLabel = getLanguageLabel(primary);
    const secondaryLabel = secondary ? getLanguageLabel(secondary) : null;

    if (!secondary) {
      return `LANGUAGE RULE: Write all natural-language text fields in ${primaryLabel} (${primary}) only.`;
    }

    return `LANGUAGE RULE: Write bilingual text for each natural-language field.
- First segment in ${primaryLabel} (${primary})
- Then " / "
- Then equivalent segment in ${secondaryLabel} (${secondary})
Do not change JSON keys or structural fields.`;
  },

  _buildGeneratePrompt({
    standard,
    subjectName,
    requestedLanguages = ["en"],
    difficulty,
    questionType,
    trueFalseTargetAnswer = null,
    studentFirstName,
    questionMemory,
    recentAttempts,
    contextHints = {},
    retryNotes = [],
  }) {
    const typeInstructions = {
      multiple_choice: `Generate a multiple-choice question with exactly 4 options.
Use labels A, B, C, D only in that order.
The "correctAnswer" must be one of: "A", "B", "C", "D".
Exactly one option can be correct.
Do not use "all of the above", "none of the above", or trick wording where multiple options are true.`,
      short_answer: `Generate a short-answer question.
    Set "options" to [].
    The question must be fully self-contained.
    If the student needs a sentence set, passage excerpt, example, chart, or data to answer, include it directly inside "questionText".
    Never ask the student to identify, revise, compare, or explain a sentence that is not shown.
    For sentence-editing or passage-analysis prompts, place each sentence on its own new line inside "questionText".
    For sentence-based language questions, include a clear task such as "Task: Add the missing commas." or "Task: Rewrite the sentence correctly.".
    The "correctAnswer" should be concise (1-2 sentences max).`,
      true_false: `Generate a true/false question.
Set "options" to exactly:
[{"label":"True","text":"True"},{"label":"False","text":"False"}]
The "correctAnswer" must be "True" or "False".
Write one clear factual statement that is definitely true or definitely false.
Avoid ambiguous or opinion-based wording.`,
    };

    const avoidExamples = questionMemory.recentQuestions
      .slice(0, 8)
      .map((q, index) => `${index + 1}. ${q}`)
      .join("\n");
    const recentAttemptSummary = recentAttempts
      .slice(0, 6)
      .map((a, index) => {
        const status = a?.isCorrect ? "correct" : "incorrect";
        return `${index + 1}. ${a?.questionType || "unknown"} | ${a?.difficulty || "medium"} | ${status}${a?.topic ? ` | topic: ${a.topic}` : ""}`;
      })
      .join("\n");
    const topicHints =
      Array.isArray(contextHints?.recentTopics) &&
      contextHints.recentTopics.length > 0
        ? contextHints.recentTopics.slice(0, 4).join(", ")
        : "none";
    const mistakeHints =
      Array.isArray(contextHints?.recentMistakes) &&
      contextHints.recentMistakes.length > 0
        ? contextHints.recentMistakes.slice(0, 4).join(", ")
        : "none";
    const retrySection =
      retryNotes.length > 0
        ? `\nPREVIOUS OUTPUT ISSUES TO FIX:\n- ${retryNotes.join("\n- ")}\n`
        : "";
    const outputOptionsShape =
      questionType === "multiple_choice"
        ? `[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}]`
        : questionType === "true_false"
          ? `[{"label":"True","text":"True"},{"label":"False","text":"False"}]`
          : "[]";
    const trueFalseTargetInstruction =
      questionType === "true_false" && trueFalseTargetAnswer
        ? `\nTRUE/FALSE TARGET: The correct answer for this question must be "${trueFalseTargetAnswer}".\nWrite a natural statement that makes "${trueFalseTargetAnswer}" correct.`
        : "";

    return `You are an expert ${subjectName} teacher creating one standards-aligned practice question.

GRADE: ${standard?.gradeLevel ?? "unknown"}
STANDARD CODE: ${standard?.code || "N/A"}
STANDARD NAME: ${standard?.name || "N/A"}
STANDARD DESCRIPTION: ${standard?.description || "N/A"}
STANDARD CATEGORY: ${standard?.category || "N/A"}
REQUESTED DIFFICULTY: ${difficulty}
REQUESTED QUESTION TYPE: ${questionType}
${typeInstructions[questionType] || typeInstructions.multiple_choice}
${trueFalseTargetInstruction}
${this._buildPromptLanguageRule(requestedLanguages)}

SESSION AWARENESS:
- Recent topics practiced: ${topicHints}
- Recent mistakes to avoid repeating directly: ${mistakeHints}
- Recent attempt pattern:
${recentAttemptSummary || "none"}

REPEAT AVOIDANCE:
- Do not produce exact or near-duplicate wording of any previous question.
- Avoid reusing the same scenario/context if only numbers or names change.
- Prior question stems:
${avoidExamples || "none"}

REQUIRED OUTPUT BEHAVIOR:
- Do not include a student name in questionText.
- Keep questionText age-appropriate, directly tied to the standard, and complete enough to answer without missing context.
- If the task refers to sentences, evidence, or a passage, include that content inside questionText.
- If questionText includes a sentence, passage, or example, also include a clear instruction telling the student exactly what to do.
- Prefer structured wording for language questions, for example:
  Instruction: Read the sentence.
  Sentence: ...
  Task: Add the missing commas.
- The "instruction" field must be a short, explicit direction telling the student exactly what to do (e.g., "Choose the correct verb form to complete the sentence." or "Select the option that best matches the main idea."). It must never be empty.
- The "skill" field should identify the broad skill being tested (e.g., "grammar", "reading comprehension", "vocabulary", "math operations").
- The "subskill" field should narrow it further (e.g., "verb tense", "main idea", "context clues", "fractions").
- Set "gradingMode" to "exact_match" when the question has one specific correct answer that must match exactly (fill-in-blank, choose the correct word/form, word bank completion, verb conjugation, single-word vocabulary).
- Set "gradingMode" to "normalized_match" for answers that are a single word or short phrase where minor formatting differences (capitalization, punctuation) are acceptable but the core content must match.
- Set "gradingMode" to "conceptual" when the answer requires explanation, description, or can be expressed in multiple valid ways.
- "acceptableAnswers" should list all valid answer variations (e.g., ["had hidden", "Had hidden"]). Include common valid alternative forms. Leave as [] for conceptual answers.
- "evaluationCriteria" should describe exactly what makes an answer correct for this question. For example: "Student must use the past perfect form: 'had' + past participle. The auxiliary 'had' is essential." Leave as "" for conceptual or multiple-choice questions.
- Keep explanations clear and teacher-like.
- Do not mention AI or model behavior.
- Return STRICT JSON only. No markdown, no code fences, no extra text.
${retrySection}
OUTPUT JSON SHAPE:
{
  "instruction": "Short explicit direction for the student",
  "questionText": "...",
  "questionType": "${questionType}",
  "options": ${outputOptionsShape},
  "correctAnswer": "...",
  "explanation": "...",
  "difficulty": "${difficulty}",
  "skill": "broad skill name",
  "subskill": "specific subskill name",
  "gradingMode": "exact_match or normalized_match or conceptual",
  "acceptableAnswers": ["alternative answer form 1"],
  "evaluationCriteria": "What exactly makes the answer correct"
}`;
  },

  _buildEvaluatePrompt({
    questionText,
    correctAnswer,
    studentAnswer,
    standard,
    studentFirstName,
    subjectName,
    requestedLanguages = ["en"],
    questionType,
    difficulty,
    gradeLevel,
    attemptNumber,
    recentPerformance = {},
    evaluationCriteria = "",
    retryNotes = [],
  }) {
    const studentName = this._normalizeStudentName(studentFirstName);
    const resolvedGradeLevel =
      Number(gradeLevel) || standard?.gradeLevel || "unknown";
    const subject = subjectName || "the subject";
    const standardCode = standard?.code || "N/A";
    const standardName = standard?.name || "Unnamed Standard";
    const sameCodeAndName =
      standardCode &&
      standardName &&
      String(standardCode).trim() === String(standardName).trim();
    const standardLabel = sameCodeAndName
      ? standardName
      : `${standardCode} - ${standardName}`;
    const wordRange = this._getWordRangeByGrade(resolvedGradeLevel);
    const incorrectStreak = recentPerformance?.incorrectStreak || 0;
    const correctStreak = recentPerformance?.correctStreak || 0;
    const safeAttemptNumber = Number.isFinite(Number(attemptNumber))
      ? Math.max(1, Number(attemptNumber))
      : 1;
    const retrySection =
      retryNotes.length > 0
        ? `\nPREVIOUS OUTPUT ISSUES TO FIX:\n- ${retryNotes.join("\n- ")}\n`
        : "";

    const subjectRules = this._buildSubjectEvaluationRules(subject);

    return `You are evaluating a student's short-answer response.

STUDENT FIRST NAME: ${studentName}
GRADE LEVEL: ${resolvedGradeLevel}
SUBJECT: ${subject}
QUESTION TYPE: ${questionType}
STANDARD: ${standardLabel}
DIFFICULTY: ${difficulty}
ATTEMPT NUMBER: ${safeAttemptNumber}
RECENT CORRECT STREAK: ${correctStreak}
RECENT INCORRECT STREAK: ${incorrectStreak}
QUESTION: ${questionText}
EXPECTED ANSWER: ${correctAnswer}
STUDENT'S ANSWER: ${studentAnswer}
${evaluationCriteria ? `EVALUATION CRITERIA: ${evaluationCriteria}` : ""}

Rules:
${evaluationCriteria ? `- CRITICAL: When EVALUATION CRITERIA are provided, they take priority over general leniency rules. The student's answer MUST satisfy ALL stated criteria to be marked correct. Do NOT consider an answer correct if it partially matches the expected answer but fails one or more evaluation criteria.
` : ""}- Be fair on wording differences if concept is correct.
- CRITICAL: Only mark "isCorrect": false when the student's answer fails the SPECIFIC skill being tested (the STANDARD). Judge the targeted skill, not peripheral errors. If the mistake is unrelated to the standard being tested, still mark "isCorrect": true and mention the off-topic issue gently.
${subjectRules}
- Personalize warmly for a student by first name.
- Keep language age-appropriate and teacher-like.
- Focus feedback on the specific skill in the standard and question.
- Do not give strong praise for an incorrect answer.
- Avoid vague phrases like "great effort" or "fantastic" when the answer is wrong.
- If a likely typo or minor formatting issue is unrelated to the tested skill, mention it gently but still mark "isCorrect": true.
- ${this._buildPromptLanguageRule(requestedLanguages)}
- Keep "feedback" between ${wordRange.minWords} and ${wordRange.maxWords} words.
- Put first name in feedbackParts.personalGreeting.
- Keep feedbackParts.whatYouDidWell empty if there is no meaningful success to highlight.
- Keep feedbackParts.correctionOrConfirmation focused on the best answer and the tested skill.
- Keep feedbackParts.nextStep to one concrete action focused on the tested skill.
- Do not mention AI/model behavior.
- Return STRICT JSON only. No markdown/code fences/extra text.
${retrySection}
Output JSON:
{
  "isCorrect": true or false,
  "feedback": "One concise clear paragraph for the student focused on the tested skill",
  "feedbackParts": {
    "headline": "Short verdict headline",
    "personalGreeting": "Friendly line with student first name",
    "whatYouDidWell": "One specific positive observation about the tested skill, or empty if none",
    "correctionOrConfirmation": "Explain the best answer and the tested skill in 1-2 short sentences",
    "nextStep": "One concrete next step focused on the tested skill",
    "encouragement": "Short motivational close",
    "displayAnswer": "Student-friendly answer display",
    "explanation": "Quick skill explanation",
    "reviewTag": "Short topic to review",
    "confidenceLevel": "low or medium or high",
    "reasonSummary": "One short sentence describing why this was correct/incorrect",
    "conceptChecks": {
      "matched": ["concept phrase"],
      "missing": ["concept phrase"]
    }
  }
}`;
  },

  _buildTrueFalsePairPrompt({
    standard,
    subjectName,
    requestedLanguages = ["en"],
    difficulty,
    studentFirstName,
    recentAttempts = [],
    contextHints = {},
    retryNotes = [],
  }) {
    const safeName = this._normalizeStudentName(studentFirstName);
    const recentAttemptSummary = recentAttempts
      .slice(0, 5)
      .map((a, index) => {
        const status = a?.isCorrect ? "correct" : "incorrect";
        return `${index + 1}. ${a?.difficulty || "medium"} | ${status}${a?.questionText ? ` | ${a.questionText}` : ""}`;
      })
      .join("\n");
    const topicHints =
      Array.isArray(contextHints?.recentTopics) &&
      contextHints.recentTopics.length > 0
        ? contextHints.recentTopics.slice(0, 4).join(", ")
        : "none";
    const retrySection =
      retryNotes.length > 0
        ? `\nPREVIOUS OUTPUT ISSUES TO FIX:\n- ${retryNotes.join("\n- ")}\n`
        : "";

    return `You are an expert ${subjectName} teacher creating clear, non-tricky true/false practice content.

STUDENT FIRST NAME: ${safeName}
GRADE: ${standard?.gradeLevel ?? "unknown"}
STANDARD CODE: ${standard?.code || "N/A"}
STANDARD NAME: ${standard?.name || "N/A"}
STANDARD DESCRIPTION: ${standard?.description || "N/A"}
REQUESTED DIFFICULTY: ${difficulty}
${this._buildPromptLanguageRule(requestedLanguages)}

TASK:
- Produce one objectively TRUE statement and one objectively FALSE statement about the same concept in this standard.
- Keep each statement clear, direct, and student-friendly.
- FALSE statement must be wrong because of one specific incorrect detail.
- Avoid trick wording, ambiguity, and legalistic phrasing.
- Avoid phrases like "regardless of whether", "unless", or double negatives.
- Do not mention AI.

SESSION CONTEXT:
- Recent topics: ${topicHints}
- Recent attempts:
${recentAttemptSummary || "none"}

Return STRICT JSON only:
{
  "trueStatement": "...",
  "falseStatement": "...",
  "explanationTrue": "...",
  "explanationFalse": "...",
  "difficulty": "${difficulty}"
}
${retrySection}`;
  },

  _classifySubjectDomain(subjectName = "") {
    const normalized = String(subjectName || "").toLowerCase().trim();
    if (!normalized || normalized === "the subject") return "general";
    if (
      /(math|mathematics|algebra|geometry|calculus|arithmetic|statistics|trigonometry)/i.test(
        normalized,
      )
    ) {
      return "math";
    }
    if (
      /(science|biology|chemistry|physics|earth science|environmental|anatomy|ecology)/i.test(
        normalized,
      )
    ) {
      return "science";
    }
    if (
      /(english|language arts|ela|reading|writing|literature|grammar|spelling)/i.test(
        normalized,
      )
    ) {
      return "ela";
    }
    if (
      /(social studies|history|geography|civics|government|economics)/i.test(
        normalized,
      )
    ) {
      return "social_studies";
    }
    return "general";
  },

  _buildSubjectEvaluationRules(subjectName = "") {
    const domain = this._classifySubjectDomain(subjectName);

    if (domain === "math") {
      return `- MATH SUBJECT RULES:
- Accept equivalent numeric forms: fractions, decimals, percentages, and simplified expressions (e.g. 3/4 = 0.75 = 75%). Mark correct if mathematically equivalent.
- Accept answers with or without units if the unit is obvious from context.
- Do NOT mark wrong for spelling, grammar, or wording issues in a math answer. Only mark wrong if the mathematical concept, value, or procedure is incorrect.
- Focus feedback on the mathematical concept, not on language mechanics.
- If a computation is wrong, explain the specific math error clearly.`;
    }

    if (domain === "science") {
      return `- SCIENCE SUBJECT RULES:
- Accept scientifically equivalent expressions and reasonable synonyms for scientific terms.
- Do NOT mark wrong for spelling, grammar, or wording issues unless the misspelling changes the scientific meaning (e.g. "meiosis" vs "mitosis").
- Accept correct scientific notation, unit conversions, and equivalent measurements.
- Focus feedback on the scientific concept and reasoning, not on language mechanics.
- If the concept is wrong, explain the specific scientific error clearly.`;
    }

    if (domain === "social_studies") {
      return `- SOCIAL STUDIES SUBJECT RULES:
- Accept reasonable paraphrasing if the key historical/geographical/civic concept is present.
- Do NOT mark wrong for minor spelling errors, grammar issues, or date formatting differences unless they change the factual meaning.
- Accept equivalent names for historical events, figures, or concepts (e.g. "WWI" = "World War I" = "The Great War").
- Focus feedback on factual accuracy and conceptual understanding, not on language mechanics.`;
    }

    if (domain === "ela") {
      return `- ELA SUBJECT RULES:
- If the question tests verb tense, grammar, or sentence structure, do NOT mark wrong for unrelated spelling mistakes, typos, or capitalization errors.
- Only count spelling errors as wrong when the standard or question explicitly tests spelling.
- For grammar, punctuation, capitalization, spelling, or sentence-structure questions, explain the language mistake directly and briefly.
- If the answer is incorrect, say clearly what language rule was missed or misused.
- Do not criticize story choices, realism, topic selection, or creativity unless the question explicitly asks about those.
- If the student has a minor spelling typo unrelated to the tested skill, mention it gently but still mark "isCorrect": true.`;
    }

    return `- GENERAL SUBJECT RULES:
- Focus on whether the student demonstrates the core concept tested by the standard.
- Do NOT mark wrong for peripheral issues (spelling, grammar, formatting) that are unrelated to the tested skill.
- Accept reasonable paraphrasing and equivalent expressions.
- If the answer is wrong, explain what concept was missed.`;
  },
};
