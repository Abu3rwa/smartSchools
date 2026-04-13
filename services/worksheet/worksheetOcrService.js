import { connectAi } from '../../utils/connectAi.js';
import { logAIUsage } from '../../utils/aiUsageTracker.js';
import promptBuilder from './worksheetPromptBuilder.js';
import logger from '../../utils/logger.js';

/**
 * Parse JSON from AI response text, handling potential markdown fences.
 */
function parseAiJson(text) {
    let cleaned = text.trim();
    // Strip markdown code fences if present
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(cleaned);
}

/**
 * Extract answers from a worksheet image using AI Vision.
 * Returns structured question/answer pairs.
 */
export async function extractAnswers(imageUrl, language = 'en', totalQuestions = null, schoolId = null) {
    const prompt = promptBuilder.buildOcrExtractionPrompt(language, totalQuestions)
        + '\n\nAnalyze the attached worksheet image and extract all student answers.';

    const result = await connectAi(prompt, {
        modelName: 'gemini-2.5-flash',
        imageUrls: [imageUrl]
    });

    if (schoolId) {
        await logAIUsage(schoolId, 'worksheet_ocr', result);
    }

    const parsed = parseAiJson(result.text);

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error('AI OCR response missing questions array');
    }

    return {
        questions: parsed.questions,
        worksheetInstructions: parsed.worksheetInstructions || '',
        totalDetected: parsed.totalDetected || parsed.questions.length,
        language: parsed.language || language,
        confidence: parsed.confidence || 0,
        tokens: result.totalTokenCount
    };
}

/**
 * Extract model answers from a teacher's answer key image.
 */
export async function extractAnswerKey(imageUrl, language = 'en', schoolId = null) {
    const prompt = `You are reading a teacher's answer key for a worksheet. Extract all correct answers.
The document is in ${language}.

For each question, extract the question number and the correct answer.

OUTPUT FORMAT (strict JSON):
{
  "answers": [
    { "questionNumber": 1, "answer": "evaporation" },
    { "questionNumber": 2, "answer": "B" }
  ],
  "totalQuestions": 10
}

Return ONLY valid JSON.

Analyze the attached answer key image.`;

    const result = await connectAi(prompt, {
        modelName: 'gemini-2.5-flash',
        imageUrls: [imageUrl]
    });

    if (schoolId) {
        await logAIUsage(schoolId, 'worksheet_answer_key_extraction', result);
    }

    const parsed = parseAiJson(result.text);

    if (!parsed.answers || !Array.isArray(parsed.answers)) {
        throw new Error('AI answer key extraction response missing answers array');
    }

    return {
        answers: parsed.answers,
        totalQuestions: parsed.totalQuestions || parsed.answers.length,
        tokens: result.totalTokenCount
    };
}

export default { extractAnswers, extractAnswerKey };
