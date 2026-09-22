import { connectAi } from '../utils/connectAi.js';

const parseJson = (value) => {
    const raw = String(value || '').trim();
    const fenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    try {
        return JSON.parse(fenced);
    } catch {
        const firstObject = fenced.indexOf('{');
        const lastObject = fenced.lastIndexOf('}');
        const firstArray = fenced.indexOf('[');
        const lastArray = fenced.lastIndexOf(']');
        const candidates = [
            firstObject >= 0 && lastObject > firstObject ? fenced.slice(firstObject, lastObject + 1) : '',
            firstArray >= 0 && lastArray > firstArray ? fenced.slice(firstArray, lastArray + 1) : ''
        ].filter(Boolean);
        for (const candidate of candidates) {
            try {
                return JSON.parse(candidate);
            } catch {
                // Try the next possible JSON boundary.
            }
        }
        const error = new Error('MAP AI returned an invalid response. Please retry or continue with manual review.');
        error.statusCode = 502;
        error.code = 'MAP_AI_INVALID_JSON';
        throw error;
    }
};

const buildPrompt = (payload, task) => {
    const subjectName = payload?.subjectName || 'the tested subject';
    const gradeLevel = payload?.gradeLevel || 'the student\'s grade level';
    return `You are an educational MAP test preparation assistant for the subject "${subjectName}" at grade level "${gradeLevel}". This is original preparation content, not official MAP content.
Task: ${task}
Hard rules:
- All skills and questions must be real "${subjectName}" academic content (e.g. reading comprehension, grammar, math operations, science concepts) appropriate for grade "${gradeLevel}".
- Never produce skills or questions about reading a score report, interpreting RIT scores, percentiles, growth data, or charts. Those are meta-skills about the report itself and are strictly forbidden.
- The MAP evidence below (RIT score, percentile, goal areas) only tells you which "${subjectName}" academic skills the student is weak or strong in. Use it only to choose which "${subjectName}" skills to target.
- Use only the evidence below. Separate observed evidence from recommendations. Do not diagnose students and do not predict an official MAP score.
Return valid JSON only.
Evidence:
${JSON.stringify(payload)}`;
};

const callJson = async (payload, task) => {
    const response = await connectAi(buildPrompt(payload, task));
    return parseJson(response.text);
};

const mapPrepAiService = {
    async analyzeEvidence(payload) {
        return callJson(payload, 'Analyze this confirmed MAP CSV evidence in one pass. Return strengths, needsPracticeSkills, masteredSkills, recommendedSkills, limitations, evidenceSummary, and topicGroups. Group only the provided instructionalArea and standard evidence; do not invent MAP evidence. Return topicGroups with name, description, status (priority, strength, or mixed), sourceEvidenceIds (exact mapEvidenceId values from the input), skillCount, scoreBandRange, evidenceSummary, and confidence (low, medium, or high). Use priority when any source has INTRODUCE, strength when all sources have REINFORCE, and mixed otherwise. If fewer than 3 evidence rows exist, state that in limitations. Return valid JSON only.');
        const task = 'Analyze this confirmed MAP CSV evidence in one pass. Return strengths, needsPracticeSkills, masteredSkills, recommendedSkills, limitations, and evidenceSummary, plus topicGroups. Group only the provided instructionalArea and standard evidence; do not invent MAP evidence. Return no more than 8 topicGroups; merge related groups when necessary and preserve every sourceEvidenceId. Return topicGroups with name, description, status (priority, strength, or mixed), sourceEvidenceIds (exact mapEvidenceId values from the input), skillCount, scoreBandRange, evidenceSummary, and confidence (low, medium, or high). Use priority when any source has INTRODUCE, strength when all sources have REINFORCE, and mixed otherwise. If fewer than 3 evidence rows exist, state that in limitations. Return valid JSON only.';
        const result = await callJson(payload, task);
        if (!Array.isArray(result?.topicGroups) || result.topicGroups.length <= 8) return result;
        return callJson(payload, `${task} The previous response violated the maximum. Return exactly 8 or fewer groups now. Do not discard sourceEvidenceIds; merge pedagogically related groups and list the merged evidence IDs in the surviving group.`);
    },
    async analyzeRound(payload) {
        return callJson(payload, 'Analyze the MAP evidence and the prior round to identify which subject-area academic skills need practice. Return strengths, needsPracticeSkills, masteredSkills, recommendedSkills, limitations, and evidenceSummary. Every skill name must be a subject academic skill, never a report-reading or data-interpretation skill.');
    },
    async generateQuestionDrafts(payload) {
        return callJson(payload, 'Generate original teacher-reviewable subject-matter practice questions (e.g. grammar, reading comprehension, math problems) that test the target skills. If topicName/topicDescription is provided, focus every question on that single topic only. Return questions with questionText, questionType, options, correctAnswer for objective questions, explanation, skillCode, skillName, domain, difficulty, and displayOrder. Never generate questions about reading MAP reports, RIT scores, percentiles, or charts.');
    },
    async generateReport(payload) {
        return callJson(payload, 'Draft a teacher-reviewable progress report using verified MAP data and quiz evidence. Return strengths, growthAreas, nextSteps, limitations, and narrative.');
    },
    async suggestShortAnswerGrades(payload) {
        return callJson(payload, 'Suggest grades only for these completed short answers. Return one suggestion per answer with questionId, suggestedScore, rationale, confidence, and flags. The teacher must confirm every suggestion.');
    }
};

export default mapPrepAiService;
