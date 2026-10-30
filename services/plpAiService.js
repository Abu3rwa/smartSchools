import aiService from './aiservice.js';
import {
    CONTENT_RULES,
    PRIVACY_RULES,
    STUDENT_TOKEN,
    fillStudentTokens,
    scrubForPrompt
} from './aiPromptSafety.js';

const EVIDENCE_TYPES = ['observation', 'incident', 'positive_example', 'reflection'];
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];
const SCORE_CONFIDENCE_LEVELS = ['high', 'medium', 'low'];

const toPlainTrait = (trait) => ({
    id: String(trait?._id || ''),
    code: String(trait?.code || '').trim(),
    title: String(trait?.name || '').trim(),
    description: String(trait?.description || '').trim(),
    themeCode: String(trait?.themeCode || '').trim(),
});

const normalizeEvidenceType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return EVIDENCE_TYPES.includes(normalized) ? normalized : 'observation';
};

const normalizeConfidence = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return CONFIDENCE_LEVELS.includes(normalized) ? normalized : 'low';
};

const normalizeScoreConfidence = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return SCORE_CONFIDENCE_LEVELS.includes(normalized) ? normalized : 'low';
};

const clampScore = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed * 10) / 10;
    return Math.max(0, Math.min(5, rounded));
};

const formatObservationTextFallback = (value) => {
    const compact = String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
    if (!compact) return '';

    const typoRules = [
        [/\becouraging\b/gi, 'encouraging'],
        [/\byouo\b/gi, 'you'],
        [/\byour did\b/gi, 'you did'],
        [/\bteh\b/gi, 'the'],
        [/\brecieve\b/gi, 'receive'],
        [/\bseperate\b/gi, 'separate'],
        [/\bstudnets\b/gi, 'students'],
        [/\bwich\b/gi, 'which'],
        [/\bthier\b/gi, 'their'],
    ];

    let corrected = compact;
    for (const [pattern, replacement] of typoRules) {
        corrected = corrected.replace(pattern, replacement);
    }

    const sentenceCased = corrected.replace(/(^|[.!?]\s+)([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    return sentenceCased;
};

const toEvidenceEntry = (item) => ({
    evidenceType: normalizeEvidenceType(item?.evidenceType || item?.type),
    structuredNote: String(item?.structuredNote || item?.note || '').trim().slice(0, 600),
    aiConfidence: normalizeScoreConfidence(item?.aiConfidence),
    createdAt: item?.createdAt ? new Date(item.createdAt).toISOString() : null,
});

class PlpAiService {
    async proofreadObservationText(rawText, { name = '', roster = [] } = {}) {
        const cleanText = String(rawText || '').trim();
        if (!cleanText) return '';

        // The teacher's own words may name the child or a classmate. The model
        // sees the token, and the name is put back on the way out.
        const safeText = scrubForPrompt(cleanText, { name, roster, phoneNumbers: false });

        const prompt = `You are proofreading a teacher observation note.

Original note:
"""
${safeText}
"""

${PRIVACY_RULES}

${CONTENT_RULES}

Rules:
1) Return STRICT JSON only.
2) Fix grammar, spelling, capitalization, and punctuation.
3) Preserve the original meaning and details; do not invent new facts.
4) Keep the same point of view and classroom context.
5) Keep the note concise and professional.
6) Keep ${STUDENT_TOKEN} exactly where it appears. Never replace it with a name.

Required JSON schema:
{
  "proofreadText": "string"
}`;

        try {
            const aiResult = await aiService.generateStructuredJson({
                prompt,
                modelName: process.env.PLP_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
                maxRetries: 1,
            });
            const proofreadText = String(aiResult?.parsed?.proofreadText || '').trim();
            if (!proofreadText) {
                return formatObservationTextFallback(cleanText).slice(0, 1000);
            }
            return fillStudentTokens(formatObservationTextFallback(proofreadText).slice(0, 1000), name);
        } catch {
            return formatObservationTextFallback(cleanText).slice(0, 1000);
        }
    }

    async classifyObservation(rawText, availableTraits = [], studentContext = {}, { name = '', roster = [] } = {}) {
        const cleanText = String(rawText || '').trim();
        if (!cleanText) {
            return {
                traitId: null,
                confidence: 'low',
                evidenceType: 'observation',
                structuredNote: '',
                rationale: 'Observation text is empty and needs manual review.',
            };
        }

        const traitList = Array.isArray(availableTraits) ? availableTraits.map(toPlainTrait) : [];
        if (traitList.length === 0) {
            return {
                traitId: null,
                confidence: 'low',
                evidenceType: 'observation',
                structuredNote: cleanText,
                rationale: 'No active trait configuration was found for this school.',
            };
        }

        const safeText = scrubForPrompt(cleanText, { name, roster, phoneNumbers: false });

        const prompt = `You are classifying a teacher classroom observation into a school's character trait system.

Teacher raw observation:
"""
${safeText}
"""

Student context (identifiers removed on purpose):
${JSON.stringify(studentContext, null, 2)}

${PRIVACY_RULES}

${CONTENT_RULES}

Available traits (you MUST choose traitId from this list or null):
${JSON.stringify(traitList, null, 2)}

Rules:
1) Return STRICT JSON only, no markdown.
2) If observation is too vague, purely academic, or not character-related, set traitId to null.
3) Never invent trait IDs or names.
4) structuredNote should be a concise, clear rewrite preserving meaning, keeping ${STUDENT_TOKEN} exactly where it appears.
5) rationale should be one short sentence about the observed behaviour only.
6) Never make a religious, moral or family judgement about the child.

Required JSON schema:
{
  "traitId": "string | null",
  "confidence": "high | medium | low",
  "evidenceType": "observation | incident | positive_example | reflection",
  "structuredNote": "string",
  "rationale": "string"
}`;

        let parsed = null;
        try {
            const aiResult = await aiService.generateStructuredJson({
                prompt,
                modelName: process.env.PLP_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
                maxRetries: 1,
            });
            parsed = aiResult?.parsed || null;
        } catch {
            return {
                traitId: null,
                confidence: 'low',
                evidenceType: 'observation',
                structuredNote: cleanText,
                rationale: 'AI classification was unavailable, so this observation needs manual review.',
            };
        }

        const traitIdCandidate = parsed?.traitId == null ? null : String(parsed.traitId).trim();
        const traitExists = traitIdCandidate
            ? traitList.some((trait) => trait.id === traitIdCandidate)
            : false;

        return {
            traitId: traitExists ? traitIdCandidate : null,
            confidence: normalizeConfidence(parsed?.confidence),
            evidenceType: normalizeEvidenceType(parsed?.evidenceType),
            structuredNote: fillStudentTokens(String(parsed?.structuredNote || cleanText).trim().slice(0, 1000), name),
            rationale: fillStudentTokens(String(parsed?.rationale || '').trim().slice(0, 300), name),
        };
    }

    async suggestTraitScore(traitId, evidenceList = [], cyclePeriod = {}, { name = '', roster = [] } = {}) {
        const cleanTraitId = String(traitId || '').trim();
        const entries = Array.isArray(evidenceList)
            ? evidenceList.map(toEvidenceEntry)
                .filter((entry) => entry.structuredNote || entry.createdAt)
                .map((entry) => ({
                    ...entry,
                    structuredNote: scrubForPrompt(entry.structuredNote, { name, roster, phoneNumbers: false })
                }))
            : [];

        if (!cleanTraitId || entries.length === 0) {
            return {
                suggestedScore: null,
                confidence: 'low',
                rationale: 'No evidence logged yet.',
                evidenceCount: 0,
            };
        }

        const prompt = `You are suggesting a 0-5 character trait score for a student based on logged evidence.

Trait ID:
${cleanTraitId}

Scoring period:
${JSON.stringify(cyclePeriod || {}, null, 2)}

Evidence list:
${JSON.stringify(entries, null, 2)}

${PRIVACY_RULES}

${CONTENT_RULES}

Rules:
1) Return STRICT JSON only (no markdown, no extra keys).
2) suggestedScore must be a number between 0 and 5.
3) Consider evidenceType, aiConfidence, recency, and note content.
4) Keep rationale to one or two short sentences and reference the evidence pattern only.
5) Judge the observed behaviour only, never the child, their faith or their family. Keep ${STUDENT_TOKEN} exactly where it appears.

Required JSON schema:
{
  "suggestedScore": 0,
  "confidence": "high | medium | low",
  "rationale": "string",
  "evidenceCount": 0
}`;

        try {
            const aiResult = await aiService.generateStructuredJson({
                prompt,
                modelName: process.env.PLP_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
                maxRetries: 1,
            });
            const parsed = aiResult?.parsed || {};
            const suggestedScore = clampScore(parsed?.suggestedScore);
            return {
                suggestedScore,
                confidence: normalizeScoreConfidence(parsed?.confidence),
                rationale: fillStudentTokens(String(parsed?.rationale || '').trim().slice(0, 300), name) || 'Score suggested from available evidence.',
                evidenceCount: entries.length,
            };
        } catch {
            const confidenceWeights = { high: 1, medium: 0.7, low: 0.4 };
            const evidenceTypeWeights = {
                positive_example: 1.3,
                reflection: 1.0,
                observation: 0.9,
                incident: -1.1,
            };

            const now = Date.now();
            let weightedTotal = 0;
            let weightBase = 0;
            for (const entry of entries) {
                const typeWeight = evidenceTypeWeights[entry.evidenceType] ?? 0.9;
                const confidenceWeight = confidenceWeights[entry.aiConfidence] ?? 0.4;
                const ageDays = entry.createdAt ? Math.max(0, (now - new Date(entry.createdAt).getTime()) / 86400000) : 30;
                const recencyWeight = ageDays <= 14 ? 1 : ageDays <= 45 ? 0.8 : 0.6;
                const unitWeight = confidenceWeight * recencyWeight;
                weightedTotal += typeWeight * unitWeight;
                weightBase += unitWeight;
            }

            const normalizedSignal = weightBase > 0 ? (weightedTotal / weightBase) : 0;
            const mappedScore = clampScore(2.5 + (normalizedSignal * 1.5));
            return {
                suggestedScore: mappedScore,
                confidence: entries.length >= 4 ? 'medium' : 'low',
                rationale: 'Score estimated from evidence type trends, confidence, and recency because AI scoring was unavailable.',
                evidenceCount: entries.length,
            };
        }
    }

    /**
     * Ranks which of a student's existing spelling/MAP practice items fits a goal.
     * The model may only pick from the ids it is given, and every returned id is
     * checked against that list, so a hallucinated link can never reach the plan.
     */
    async suggestPracticeLinks(goal = {}, candidates = []) {
        const list = (Array.isArray(candidates) ? candidates : []).slice(0, 30).map((candidate) => ({
            id: String(candidate?.targetId || ''),
            kind: String(candidate?.kind || ''),
            label: String(candidate?.label || ''),
            detail: String(candidate?.detail || ''),
        })).filter((candidate) => candidate.id && candidate.label);

        if (!list.length) {
            return { suggestions: [], unavailable: false, reason: 'no_candidates' };
        }

        const goalContext = {
            goalType: String(goal?.goalType || '').trim(),
            title: String(goal?.title || '').trim().slice(0, 200),
            description: String(goal?.description || '').trim().slice(0, 600),
            successCriteria: String(goal?.successCriteria || '').trim().slice(0, 600),
        };

        const prompt = `You are choosing which of a student's existing practice work supports a Personal Learning Plan goal.

Goal:
${JSON.stringify(goalContext, null, 2)}

Candidate practice items (you MUST choose id values from this list only):
${JSON.stringify(list, null, 2)}

Rules:
1) Return STRICT JSON only, no markdown.
2) Choose at most 5 items that genuinely work toward the goal. An empty list is a valid answer.
3) Never invent ids, labels, or facts about the student.
4) reason must be one short sentence for a teacher, explaining the fit with the success criteria.
5) Prefer spelling practice for literacy goals and MAP practice for measured academic goals; character goals often need no links.

Required JSON schema:
{
  "selections": [
    { "id": "string", "reason": "string" }
  ]
}`;

        let parsed = null;
        try {
            const aiResult = await aiService.generateStructuredJson({
                prompt,
                modelName: process.env.PLP_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
                maxRetries: 1,
            });
            parsed = aiResult?.parsed || null;
        } catch {
            return { suggestions: [], unavailable: true, reason: 'ai_unavailable' };
        }

        const byId = new Map(list.map((candidate) => [candidate.id, candidate]));
        const seen = new Set();
        const suggestions = (Array.isArray(parsed?.selections) ? parsed.selections : [])
            .map((selection) => {
                const candidate = byId.get(String(selection?.id || '').trim());
                if (!candidate || seen.has(candidate.id)) return null;
                seen.add(candidate.id);
                return {
                    kind: candidate.kind,
                    targetId: candidate.id,
                    label: candidate.label,
                    detail: candidate.detail,
                    reason: String(selection?.reason || '').trim().slice(0, 300),
                };
            })
            .filter(Boolean)
            .slice(0, 5);

        return { suggestions, unavailable: false, reason: '' };
    }
}

export default new PlpAiService();
