import aiService from './aiservice.js';

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

const toEvidenceEntry = (item) => ({
    evidenceType: normalizeEvidenceType(item?.evidenceType || item?.type),
    structuredNote: String(item?.structuredNote || item?.note || '').trim().slice(0, 600),
    aiConfidence: normalizeScoreConfidence(item?.aiConfidence),
    createdAt: item?.createdAt ? new Date(item.createdAt).toISOString() : null,
});

class PlpAiService {
    async classifyObservation(rawText, availableTraits = [], studentContext = {}) {
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

        const prompt = `You are classifying a teacher classroom observation into a school's character trait system.

Teacher raw observation:
"""
${cleanText}
"""

Student context:
${JSON.stringify(studentContext, null, 2)}

Available traits (you MUST choose traitId from this list or null):
${JSON.stringify(traitList, null, 2)}

Rules:
1) Return STRICT JSON only, no markdown.
2) If observation is too vague, purely academic, or not character-related, set traitId to null.
3) Never invent trait IDs or names.
4) structuredNote should be a concise, clear rewrite preserving meaning.
5) rationale should be one short sentence.

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
        } catch (_error) {
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
            structuredNote: String(parsed?.structuredNote || cleanText).trim().slice(0, 1000),
            rationale: String(parsed?.rationale || '').trim().slice(0, 300),
        };
    }

    async suggestTraitScore(traitId, evidenceList = [], cyclePeriod = {}) {
        const cleanTraitId = String(traitId || '').trim();
        const entries = Array.isArray(evidenceList)
            ? evidenceList.map(toEvidenceEntry).filter((entry) => entry.structuredNote || entry.createdAt)
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

Rules:
1) Return STRICT JSON only (no markdown, no extra keys).
2) suggestedScore must be a number between 0 and 5.
3) Consider evidenceType, aiConfidence, recency, and note content.
4) Keep rationale to one or two short sentences and reference the evidence pattern.

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
                rationale: String(parsed?.rationale || '').trim().slice(0, 300) || 'Score suggested from available evidence.',
                evidenceCount: entries.length,
            };
        } catch (_error) {
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
}

export default new PlpAiService();
