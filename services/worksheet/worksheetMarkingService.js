import { connectAi } from '../../utils/connectAi.js';
import { logAIUsage } from '../../utils/aiUsageTracker.js';
import promptBuilder from './worksheetPromptBuilder.js';
import logger from '../../utils/logger.js';

/**
 * Parse JSON from AI response text.
 */
function parseAiJson(text) {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(cleaned);
}

/**
 * Mark answers using a model answer key (Mode A).
 */
export async function markWithModelAnswers(questions, modelAnswers, config, schoolId = null) {
    const prompt = promptBuilder.buildModelMarkingPrompt(questions, modelAnswers, config);
    const result = await connectAi(prompt);

    if (schoolId) {
        await logAIUsage(schoolId, 'worksheet_model_marking', result);
    }

    const parsed = parseAiJson(result.text);

    if (!parsed.results || !Array.isArray(parsed.results)) {
        throw new Error('AI marking response missing results array');
    }

    // Merge AI results with question data
    return questions.map(q => {
        const aiResult = parsed.results.find(r => r.questionNumber === q.questionNumber);
        const model = modelAnswers.find(m => m.questionNumber === q.questionNumber);

        return {
            questionNumber: q.questionNumber,
            studentAnswer: q.studentAnswer || '',
            correctAnswer: model?.answer || aiResult?.correctAnswer || '',
            isCorrect: aiResult?.isCorrect ?? null,
            partialCredit: aiResult?.partialCredit ?? null,
            pointsEarned: aiResult?.pointsEarned ?? 0,
            pointsTotal: aiResult?.pointsTotal ?? 1,
            feedback: aiResult?.feedback || '',
            confidence: aiResult?.confidence ?? 0,
            markSource: 'model'
        };
    });
}

/**
 * Mark answers using AI knowledge (Mode B).
 */
export async function markWithAiKnowledge(questions, config, schoolId = null) {
    const prompt = promptBuilder.buildAiMarkingPrompt(questions, config);
    const result = await connectAi(prompt);

    if (schoolId) {
        await logAIUsage(schoolId, 'worksheet_ai_marking', result);
    }

    const parsed = parseAiJson(result.text);

    if (!parsed.results || !Array.isArray(parsed.results)) {
        throw new Error('AI marking response missing results array');
    }

    return questions.map(q => {
        const aiResult = parsed.results.find(r => r.questionNumber === q.questionNumber);

        return {
            questionNumber: q.questionNumber,
            studentAnswer: q.studentAnswer || '',
            correctAnswer: aiResult?.correctAnswer || '',
            isCorrect: aiResult?.isCorrect ?? null,
            partialCredit: aiResult?.partialCredit ?? null,
            pointsEarned: aiResult?.pointsEarned ?? 0,
            pointsTotal: aiResult?.pointsTotal ?? 1,
            feedback: aiResult?.feedback || '',
            confidence: aiResult?.confidence ?? 0,
            markSource: 'ai'
        };
    });
}

/**
 * Mark answers in hybrid mode: use model answers where available, AI for the rest.
 */
export async function markHybrid(questions, modelAnswers, config, schoolId = null) {
    const hasModelAnswer = (qNum) => modelAnswers.some(m => m.questionNumber === qNum && m.answer);

    const modelQuestions = questions.filter(q => hasModelAnswer(q.questionNumber));
    const aiQuestions = questions.filter(q => !hasModelAnswer(q.questionNumber));

    const results = [];

    if (modelQuestions.length > 0) {
        const modelResults = await markWithModelAnswers(modelQuestions, modelAnswers, config, schoolId);
        results.push(...modelResults);
    }

    if (aiQuestions.length > 0) {
        const aiResults = await markWithAiKnowledge(aiQuestions, config, schoolId);
        results.push(...aiResults);
    }

    // Sort by question number
    return results.sort((a, b) => a.questionNumber - b.questionNumber);
}

/**
 * Route to the appropriate marking function based on mode.
 */
export async function markAnswers(questions, modelAnswers, markingMode, config, schoolId = null) {
    switch (markingMode) {
        case 'model':
            return markWithModelAnswers(questions, modelAnswers || [], config, schoolId);
        case 'ai':
            return markWithAiKnowledge(questions, config, schoolId);
        case 'hybrid':
        default:
            return markHybrid(questions, modelAnswers || [], config, schoolId);
    }
}

export default { markAnswers, markWithModelAnswers, markWithAiKnowledge, markHybrid };
