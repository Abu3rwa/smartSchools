import { connectAi } from '../../utils/connectAi.js';
import { logAIUsage } from '../../utils/aiUsageTracker.js';
import Standard from '../../models/Standard.js';
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
 * Auto-detect standards from question content using AI.
 * Matches against the school's standards library.
 */
export async function detectStandards(questions, subjectId, schoolId) {
    // Fetch standards for this subject from the school's library
    const standards = await Standard.find({
        school: schoolId,
        subject: subjectId,
        isActive: true
    }).select('code name description').lean();

    if (!standards.length) {
        logger.info(`No standards found for subject ${subjectId} in school ${schoolId}`);
        return [];
    }

    const questionsWithText = questions.filter(q => q.questionText);
    if (!questionsWithText.length) return [];

    const prompt = promptBuilder.buildStandardsDetectionPrompt(questionsWithText, standards);
    const result = await connectAi(prompt);

    await logAIUsage(schoolId, 'worksheet_standards_detection', result);

    const parsed = parseAiJson(result.text);

    if (!parsed.mappings || !Array.isArray(parsed.mappings)) {
        return [];
    }

    // Resolve standard codes to ObjectIds
    const standardMap = new Map(standards.map(s => [s.code, s._id]));

    return parsed.mappings
        .filter(m => m.confidence >= 0.60 && standardMap.has(m.standardCode))
        .map(m => ({
            questionNumber: m.questionNumber,
            standardId: standardMap.get(m.standardCode),
            standardCode: m.standardCode,
            confidence: m.confidence,
            confirmed: false
        }));
}

export default { detectStandards };
