import { answerRatio, pickFocusConcerns } from './supportPlanBuilder.js';
import { resolveApprovedBank, questionSnapshot } from './supportBankService.js';
import { supportError } from './supportAccessService.js';

/**
 * Adaptive question selection. This is a deterministic, stored-reason function,
 * not an AI call: the same case history and cutoff always produce the same
 * survey. Recency uses a three-month half-life.
 */
export const RECENCY_HALF_LIFE_MONTHS = 3;
export const SELECTION_ALGORITHM_VERSION = 'support-selector-v1';

export const monthsOldWeight = (monthsOld) => (
    0.5 ** (Math.max(0, monthsOld) / RECENCY_HALF_LIFE_MONTHS)
);

const academicYearStart = (academicYear) => {
    const parsed = Number.parseInt(String(academicYear || '').slice(0, 4), 10);
    return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
};

const periodIndex = ({ month, academicYear }) => {
    const start = academicYearStart(academicYear);
    const calendarYear = month >= 8 ? start : start + 1;
    return calendarYear * 12 + month;
};

export const surveyPeriod = (survey) => {
    if (survey?.review?.month) {
        return { month: survey.review.month, academicYear: survey.review.academicYear };
    }
    if (survey?.month && survey?.academicYear) {
        return { month: survey.month, academicYear: survey.academicYear };
    }
    return null;
};

const monthsBetween = (fromPeriod, toPeriod) => {
    if (!fromPeriod || !toPeriod) return 0;
    return Math.max(0, periodIndex(toPeriod) - periodIndex(fromPeriod));
};

const answered = (answer) => Boolean(answer) && (
    answer.scaleValue != null
    || Number.isInteger(answer.choiceIndex)
    || String(answer.choiceValue || '').trim() !== ''
    || String(answer.textValue || '').trim() !== ''
);

const perRespondentSeries = (surveys = []) => {
    // One effective completed response per respondent/review/question. Later
    // submits of the same survey replace earlier autosaves, never both.
    const keyed = new Map();
    for (const survey of surveys) {
        if (!survey || survey.status !== 'submitted') continue;
        const period = surveyPeriod(survey);
        const respondent = String(survey.respondent?._id || survey.respondent || '');
        const reviewRef = survey.review?._id || survey.review || null;
        const reviewKey = reviewRef
            ? String(reviewRef)
            : (period ? `${period.academicYear}:${period.month}` : '');
        const stamp = new Date(survey.submittedAt || survey.updatedAt || 0).getTime();
        for (const question of survey.questions || []) {
            const answer = (survey.answers || []).find((row) => row.questionId === question.id);
            if (!answered(answer)) continue;
            const key = `${respondent}:${reviewKey}:${question.id}`;
            const current = keyed.get(key);
            if (!current || stamp >= current.stamp) {
                keyed.set(key, { survey, question, answer, period, stamp, respondent });
            }
        }
    }
    return [...keyed.values()];
};

export const concernScores = ({ surveys = [], reviewPeriod, audience = null }) => {
    const rows = perRespondentSeries(surveys);
    const buckets = new Map();
    for (const row of rows) {
        if (audience && row.survey.audience !== audience) continue;
        const ratio = answerRatio(row.answer, row.question);
        if (ratio === null) continue;
        const concern = row.question.key || 'general';
        if (concern === 'general') continue;
        const months = row.period ? monthsBetween(row.period, reviewPeriod) : 0;
        const weight = monthsOldWeight(months);
        const entry = buckets.get(concern) || {
            key: concern,
            domain: row.question.domain || 'general',
            total: 0,
            weight: 0,
            answers: 0,
            latest: null,
            latestStamp: 0,
            audiences: new Set(),
            respondents: new Set(),
        };
        entry.total += ratio * weight;
        entry.weight += weight;
        entry.answers += 1;
        entry.audiences.add(row.survey.audience);
        entry.respondents.add(row.respondent);
        if (row.stamp >= entry.latestStamp) {
            entry.latestStamp = row.stamp;
            entry.latest = { score: ratio, period: row.period, audience: row.survey.audience };
        }
        buckets.set(concern, entry);
    }
    return [...buckets.values()].map((entry) => ({
        key: entry.key,
        domain: entry.domain,
        score: Number((entry.total / (entry.weight || 1)).toFixed(3)),
        answers: entry.answers,
        respondents: entry.respondents.size,
        audiences: [...entry.audiences],
        latest: entry.latest,
        weight: Number(entry.weight.toFixed(3)),
    })).sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
};

const audienceMatches = (survey, audience, subjectId) => {
    if (survey.audience !== audience) return false;
    if (audience === 'teacher') return String(survey.subject?._id || survey.subject || '') === String(subjectId || '');
    return true;
};

const scopeSurveys = ({ surveys, audience, subjectId }) => (
    surveys.filter((survey) => audienceMatches(survey, audience, subjectId))
);

const anchorOrder = (questions, concerns) => {
    const focus = new Set(concerns);
    return [...questions].sort((a, b) => {
        const aFocus = focus.has(a.concern) ? 0 : 1;
        const bFocus = focus.has(b.concern) ? 0 : 1;
        if (aFocus !== bFocus) return aFocus - bFocus;
        return String(a.ref).localeCompare(String(b.ref));
    });
};

const dedupe = (rows) => {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        if (!row || seen.has(row.ref)) continue;
        seen.add(row.ref);
        out.push(row);
    }
    return out;
};

export const selectionConfig = ({ audience, settings, length }) => {
    const maxLength = Math.min(
        Number(settings?.maxSurveyLength) || 10,
        Math.max(Number(length) || Number(settings?.defaultSurveyLength) || 6, 1),
    );
    return {
        maxLength,
        anchorTarget: audience === 'teacher' ? 2 : audience === 'parent' ? 2 : 1,
        followUpTarget: audience === 'teacher' ? 2 : audience === 'parent' ? 2 : 1,
    };
};

/**
 * Choose one survey's questions.
 * Returns snapshots in the survey shape plus the stored reason for each pick.
 */
export const selectQuestions = async ({
    schoolId,
    caseDoc = null,
    audience,
    subjectId = null,
    reviewPeriod,
    surveys = [],
    settings = null,
    length = null,
    bank = null,
    goalConcerns = [],
    difficultyConcerns = [],
    overrides = null,
}) => {
    const approved = bank || await resolveApprovedBank({ schoolId, audience });
    if (approved.length === 0) {
        throw supportError(500, 'BANK_EMPTY', 'No approved questions are available for this survey.');
    }
    const config = selectionConfig({ audience, settings, length });

    if (Array.isArray(overrides) && overrides.length > 0) {
        const byRef = new Map(approved.map((row) => [row.ref, row]));
        const picked = dedupe(overrides.map((row) => byRef.get(String(row?.ref || row?.id || row))));
        if (picked.length !== overrides.length) {
            throw supportError(400, 'QUESTION_NOT_ELIGIBLE', 'One of those questions is not approved for this audience.');
        }
        if (picked.length > config.maxLength) {
            throw supportError(400, 'SURVEY_TOO_LONG', `This survey allows ${config.maxLength} questions.`);
        }
        const snapshots = picked.map((row) => questionSnapshot(row, {
            id: row.ref,
            reason: 'selected_by_operator',
        }));
        return {
            mode: 'manual',
            questions: snapshots.map((row) => row.question),
            refs: snapshots.map((row) => row.ref),
            scores: [],
            algorithm: SELECTION_ALGORITHM_VERSION,
            cutoff: new Date(),
        };
    }

    const scoped = scopeSurveys({ surveys, audience, subjectId });
    const scores = concernScores({ surveys: scoped, reviewPeriod, audience });
    const baseline = approved.filter((row) => (row.followUpFor || []).length === 0);
    const followUpsByConcern = new Map();
    for (const row of approved) {
        for (const concern of row.followUpFor || []) {
            if (!followUpsByConcern.has(concern)) followUpsByConcern.set(concern, []);
            followUpsByConcern.get(concern).push(row);
        }
    }

    const hasBaseline = scoped.some((survey) => survey.status === 'submitted');
    if (!hasBaseline) {
        const pool = dedupe([
            ...baseline.filter((row) => row.trendAnchor),
            ...baseline.filter((row) => !row.trendAnchor && row.required !== false),
            ...baseline,
        ]);
        const picked = pool.slice(0, config.maxLength);
        const snapshots = picked.map((row) => questionSnapshot(row, { id: row.ref, reason: 'new_scope_baseline' }));
        return {
            mode: 'baseline',
            questions: snapshots.map((row) => row.question),
            refs: snapshots.map((row) => row.ref),
            scores,
            algorithm: SELECTION_ALGORITHM_VERSION,
            cutoff: new Date(),
        };
    }

    const focus = pickFocusConcerns(scores, 3);
    const ranked = [...scores].sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
    const goalSet = new Set(goalConcerns);
    const difficultySet = new Set(difficultyConcerns);

    const followUpPicks = [];
    const teacherScores = concernScores({
        surveys: scopeSurveys({ surveys, audience: 'teacher' }),
        reviewPeriod,
        audience: 'teacher',
    });
    const parentScores = concernScores({
        surveys: scopeSurveys({ surveys, audience: 'parent' }),
        reviewPeriod,
        audience: 'parent',
    });
    const reasonFor = (concern) => {
        if (goalSet.has(concern)) return 'active_goal';
        if (difficultySet.has(concern)) return 'task_difficulty';
        const entry = ranked.find((row) => row.key === concern);
        const teacher = teacherScores.find((row) => row.key === concern);
        const parent = parentScores.find((row) => row.key === concern);
        if (teacher && parent && Math.abs(teacher.score - parent.score) >= 0.35) {
            return 'contradictory_evidence';
        }
        if (entry && entry.score < 0.5) return 'repeat_concern';
        return 'trend_follow_up';
    };

    const orderedConcerns = [
        ...focus,
        ...ranked.map((row) => row.key).filter((key) => !focus.includes(key)),
    ];
    for (const concern of orderedConcerns) {
        if (followUpPicks.length >= config.followUpTarget) break;
        const options = followUpsByConcern.get(concern);
        if (!options?.length) continue;
        const row = [...options].sort((a, b) => a.ref.localeCompare(b.ref))[0];
        followUpPicks.push({ row, reason: reasonFor(concern) });
    }

    const anchors = anchorOrder(
        baseline.filter((row) => row.trendAnchor && row.required !== false),
        focus,
    ).slice(0, config.anchorTarget);

    const picked = [...anchors, ...followUpPicks.map((row) => row.row)];
    const seen = new Set(picked.map((row) => row.ref));

    // Fill up to the configured length with the remaining required baseline
    // questions, in stable order. A shorter survey deliberately drops these.
    for (const row of [...baseline].sort((a, b) => {
        if (a.required !== b.required) return a.required ? -1 : 1;
        return String(a.ref).localeCompare(String(b.ref));
    })) {
        if (picked.length >= config.maxLength) break;
        if (seen.has(row.ref)) continue;
        if (row.required === false) continue;
        picked.push(row);
        seen.add(row.ref);
    }
    while (picked.length > config.maxLength) {
        // Follow-ups go first, anchors stay so month-to-month trends survive.
        const index = picked.findIndex((row) => (row.followUpFor || []).length > 0);
        picked.splice(index >= 0 ? index : picked.length - 1, 1);
    }

    const anchorCount = picked.filter((row) => row.trendAnchor).length;
    const snapshots = picked.map((row) => {
        if (row.trendAnchor && !(row.followUpFor || []).length) {
            return questionSnapshot(row, { id: row.ref, reason: 'trend_anchor' });
        }
        const match = followUpPicks.find((entry) => entry.row.ref === row.ref);
        return questionSnapshot(row, { id: row.ref, reason: match?.reason || 'required_core' });
    });

    return {
        mode: 'follow_up',
        questions: snapshots.map((row) => row.question),
        refs: snapshots.map((row) => row.ref),
        scores,
        focusKeys: focus,
        anchorCount,
        comparable: anchorCount >= Math.min(2, config.anchorTarget),
        algorithm: SELECTION_ALGORITHM_VERSION,
        cutoff: new Date(),
    };
};

/** Compact comparison series for the case page and reports. */
export const buildComparison = ({ surveys = [], reviewPeriod, audiences = ['teacher', 'parent'] }) => (
    audiences.map((audience) => ({
        audience,
        scores: concernScores({ surveys: scopeSurveys({ surveys, audience }), reviewPeriod, audience }),
    }))
);
