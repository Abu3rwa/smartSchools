/**
 * Prompt building and response parsing for the Writing Assistant.
 * Imported only by teacher-triggered code, never by a student request path.
 */
import {
    alignSections,
    countWords,
    draftDiffSummary,
    guardRecommendation,
    rubricRatio
} from './writingAssistantLogic.js';

const MAX_STUDENT_CHARS = 12000;
const MAX_LIST_ITEMS = 6;
const MAX_TEXT_CHARS = 700;

const clean = (value, max = MAX_TEXT_CHARS) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
};

const stringList = (value, max = MAX_LIST_ITEMS) => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => clean(item, 260)).filter(Boolean).slice(0, max);
};

const clampScore = (value, maxScore) => {
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0) return 0;
    return Math.min(score, maxScore);
};

/** The student's own writing, section-labelled, with a hard budget. */
export const renderDraftForPrompt = (draft) => {
    let budget = MAX_STUDENT_CHARS;
    const blocks = [];
    for (const section of draft?.sections || []) {
        const heading = `${section.label || section.key} (draft ${draft.number}, ${section.words ?? countWords(section.text)} words)`;
        const body = clean(section.text, budget);
        if (!body) {
            blocks.push(`${heading}\n[empty]`);
            continue;
        }
        const cost = heading.length + body.length + 2;
        if (cost > budget) break;
        budget -= cost;
        blocks.push(`${heading}\n${body}`);
    }
    return blocks.join('\n\n');
};

const renderRubric = (snapshot) => {
    if (!(snapshot.rubric || []).length) return 'No rubric was supplied. Judge against the section criteria only.';
    return (snapshot.rubric || [])
        .map((criterion) => {
            const scope = (criterion.appliesToSections || ['*']).join(', ');
            return `- ${criterion.label} (0–${criterion.maxScore} points, applies to: ${scope})${criterion.description ? `: ${criterion.description}` : ''}`;
        })
        .join('\n');
};

const renderCriteria = (snapshot) => (snapshot.sections || [])
    .map((section) => `- ${section.label}${(section.criteria || []).length ? `: ${section.criteria.join('; ')}` : ''}`)
    .join('\n');

const guardrailBlock = (snapshot, aiConstraints) => `Rules you must follow:
- Writing is a process. Teach and guide; never rewrite. Do not supply replacement sentences, model paragraphs, or answers the student has not attempted.
- Every improvement must quote the student's own words as evidence, and say why that matters for this assignment.
- Judge only what the assignment asks for. A student must not be marked down for a technique that was never required at their level.
- Do not treat longer text or more complicated sentences as automatically better. Reward clarity, support, and cohesion.
- Keep wording a ${snapshot.expectedLevel || 'school-age'} student can act on. No assessment jargon.
${aiConstraints ? `- Teacher constraints: ${clean(aiConstraints, 900)}` : ''}
- Reply with a single JSON object and nothing else.`;

export const buildFeedbackPrompt = ({
    snapshot,
    draft,
    studentName = '',
    goal = '',
    aiConstraints = '',
    language = 'en'
}) => `You are a writing teacher giving feedback on one submitted draft.

Assignment: ${clean(snapshot.title, 200)} (${snapshot.writingType})
Topic: ${clean(snapshot.topic, 300)}
Instructions given to the student: ${clean(snapshot.instructions, 1200) || 'None.'}
Length target: ${snapshot.minWords || 0}-${snapshot.maxWords || 0} words
Expected level: ${clean(snapshot.expectedLevel, 200) || 'Not stated'}
Student: ${clean(studentName, 80) || 'Unnamed'}${goal ? `\nIndividual goal for this student: ${clean(goal, 400)}` : ''}
Draft number: ${draft.number}
Structure required:
${renderCriteria(snapshot)}
Rubric:
${renderRubric(snapshot)}

The student's draft:
<<<
${renderDraftForPrompt(draft)}
>>>

${guardrailBlock(snapshot, aiConstraints)}
Write the feedback in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}.

JSON shape:
{
  "sections": [
    {
      "key": "<section key exactly as listed above>",
      "index": <number, matching the draft>,
      "strengths": ["<what is working well>"],
      "improvements": ["<what needs improvement>"],
      "evidence": "<a short quote from the student's own writing>",
      "why": "<why this matters for this assignment>",
      "nextStep": "<one specific action the student can take>",
      "score": <number 0 to the criterion maximum>
    }
  ],
  "overall": {
    "summary": "<3-4 sentences on the piece as a whole>",
    "organisation": "<how the pieces are ordered>",
    "centralIdea": "<whether one idea is held>",
    "flow": "<how paragraphs join>",
    "repetition": "<anything repeated or missing>",
    "requirements": "<how far the assignment brief is met>",
    "nextPriorities": ["<up to 3 things, most important first>"]
  },
  "scores": [
    { "key": "<rubric key>", "score": <number>, "explanation": "<why>" }
  ],
  "recommendation": { "path": "revise", "reason": "<one sentence>" }
}

Give one "sections" entry for every section the student wrote, including empty ones. Use only the section keys listed above.`;

export const buildComparisonPrompt = ({
    snapshot,
    previousDraft,
    currentDraft,
    previousAssessment,
    studentName = '',
    goal = '',
    aiConstraints = '',
    language = 'en'
}) => {
    const priorFeedback = (previousAssessment?.sections || [])
        .map((section) => `- ${section.label || section.key}: ${section.nextStep || (section.improvements || [])[0] || 'no next step recorded'}`)
        .join('\n') || 'No earlier feedback was recorded.';

    return `You are comparing two submitted drafts by the same student on the same assignment, and saying what the revision achieved.

Assignment: ${clean(snapshot.title, 200)} (${snapshot.writingType})
Expected level: ${clean(snapshot.expectedLevel, 200) || 'Not stated'}
Length target: ${snapshot.minWords || 0}-${snapshot.maxWords || 0} words
Student: ${clean(studentName, 80) || 'Unnamed'}${goal ? `\nIndividual goal: ${clean(goal, 400)}` : ''}
Structure required:
${renderCriteria(snapshot)}
Rubric:
${renderRubric(snapshot)}

Feedback given on draft ${previousDraft.number} (the next steps the student was asked to act on):
${priorFeedback}

Draft ${previousDraft.number}:
<<<
${renderDraftForPrompt(previousDraft)}
>>>

Draft ${currentDraft.number}:
<<<
${renderDraftForPrompt(currentDraft)}
>>>

${guardrailBlock(snapshot, aiConstraints)}
Be specific and encouraging. Say which requested feedback was actually applied and which was not.
Name any new problem the revision introduced. Do not count a synonym swap as an improvement.
Write the feedback in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}.

JSON shape:
{
  "changedBySection": [
    { "key": "<section key>", "index": <number>, "summary": "<what changed and whether it matters>", "meaningful": <true|false>, "kind": "changed" }
  ],
  "criteriaImproved": ["<rubric or section criterion labels that got stronger>"],
  "criteriaUnresolved": ["<criteria still not met>"],
  "feedbackApplied": [
    { "key": "<section key>", "note": "<the feedback you gave before>", "applied": <true|false> }
  ],
  "newIssues": ["<anything worse than before>"],
  "encouragement": "<one or two sentences the student should read first>",
  "overall": { "summary": "<how the piece as a whole moved>", "nextPriorities": ["<up to 3>"] },
  "scores": [ { "key": "<rubric key>", "score": <number>, "explanation": "<change since the last draft>" } ],
  "recommendation": { "path": "revise" | "notebook", "reason": "<one sentence>" }
}`;
};

/** Models wrap JSON in prose or fences often enough that it has to be handled. */
export const extractJsonObject = (raw) => {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const candidates = [];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) candidates.push(fenced[1]);
    candidates.push(text);
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate.trim());
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
            // try the next candidate
        }
    }
    return null;
};

const evidenceIsReal = (evidence, draft) => {
    const quote = String(evidence || '').trim();
    if (quote.length < 4) return false;
    const haystack = (draft?.sections || [])
        .map((section) => String(section.text || ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
    return haystack.includes(quote.replace(/\s+/g, ' ').toLowerCase());
};

const validSectionRef = (snapshot, key) => (snapshot?.sections || []).some(
    (section) => section.key === key
);

const validRubricKeys = (snapshot) => new Set((snapshot?.rubric || []).map((criterion) => criterion.key));

export const normalizeFeedback = ({ parsed, draft, snapshot }) => {
    if (!parsed) {
        return { ok: false, error: 'The AI reply could not be read as JSON.' };
    }

    const maxFor = (key) => {
        const criterion = (snapshot?.rubric || []).find((row) => row.key === key);
        return criterion ? Number(criterion.maxScore) || 0 : 0;
    };

    const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
        .filter((row) => row && validSectionRef(snapshot, row?.key))
        .map((row) => {
            const definition = (snapshot.sections || []).find((item) => item.key === row.key);
            const index = Number.isFinite(Number(row.index)) ? Number(row.index) : 0;
            const evidence = clean(row.evidence, 300);
            const limit = maxFor((snapshot.rubric || [])[0]?.key) || 5;
            return {
                key: row.key,
                index,
                label: clean(definition?.label || row.key, 120),
                strengths: stringList(row.strengths),
                improvements: stringList(row.improvements),
                evidence: evidenceIsReal(evidence, draft) ? evidence : '',
                why: clean(row.why, 400),
                nextStep: clean(row.nextStep, 400),
                score: clampScore(row.score, limit),
                maxScore: limit
            };
        });

    const knownKeys = validRubricKeys(snapshot);
    const scores = (Array.isArray(parsed.scores) ? parsed.scores : [])
        .filter((row) => row && knownKeys.has(row.key))
        .map((row) => {
            const criterion = (snapshot.rubric || []).find((item) => item.key === row.key);
            return {
                key: row.key,
                label: clean(criterion?.label || row.key, 120),
                score: clampScore(row.score, criterion?.maxScore),
                maxScore: Number(criterion?.maxScore) || 0,
                explanation: clean(row.explanation, 400)
            };
        });

    const overallSource = parsed.overall || {};
    const overall = {
        summary: clean(overallSource.summary, 1200),
        organisation: clean(overallSource.organisation, 600),
        centralIdea: clean(overallSource.centralIdea, 600),
        flow: clean(overallSource.flow, 600),
        repetition: clean(overallSource.repetition, 600),
        requirements: clean(overallSource.requirements, 600),
        nextPriorities: stringList(overallSource.nextPriorities, 3)
    };

    if (!sections.length && !overall.summary) {
        return { ok: false, error: 'The AI reply contained no usable feedback.' };
    }

    return {
        ok: true,
        sections,
        overall,
        scores,
        totalScore: scores.reduce((sum, row) => sum + row.score, 0),
        recommendation: {
            path: parsed?.recommendation?.path === 'notebook' ? 'notebook' : 'revise',
            reason: clean(parsed?.recommendation?.reason, 400)
        }
    };
};

export const normalizeComparison = ({
    parsed,
    previousDraft,
    currentDraft,
    previousAssessment,
    snapshot
}) => {
    if (!parsed) {
        return { ok: false, error: 'The AI reply could not be read as JSON.' };
    }

    const alignment = alignSections(previousDraft?.sections, currentDraft?.sections);
    const summary = draftDiffSummary(alignment);
    const knownKeys = validRubricKeys(snapshot);

    const seen = new Set(alignment.matched.map((row) => `${row.key}:${row.index}`));
    const changedBySection = (Array.isArray(parsed.changedBySection) ? parsed.changedBySection : [])
        .filter((row) => row && validSectionRef(snapshot, row?.key))
        .map((row) => {
            const index = Number.isFinite(Number(row.index)) ? Number(row.index) : 0;
            const definition = (snapshot.sections || []).find((item) => item.key === row.key);
            return {
                key: row.key,
                index,
                label: clean(definition?.label || row.key, 120),
                summary: clean(row.summary, 500),
                meaningful: row.meaningful === true,
                kind: row.kind === 'added' || row.kind === 'removed'
                    ? row.kind
                    : (seen.has(`${row.key}:${index}`) ? 'changed' : 'added')
            };
        });

    // Sections the student added or deleted are reported even if the AI ignored them.
    for (const section of alignment.added) {
        const id = `${section.key}:${section.index}`;
        if (changedBySection.some((row) => `${row.key}:${row.index}` === id)) continue;
        const definition = (snapshot.sections || []).find((item) => item.key === section.key);
        changedBySection.push({
            key: section.key,
            index: section.index,
            label: clean(definition?.label || section.key, 120),
            summary: 'A new section appears in this draft.',
            meaningful: countWords(section.text) > 0,
            kind: 'added'
        });
    }
    for (const section of alignment.removed) {
        const id = `${section.key}:${section.index}`;
        if (changedBySection.some((row) => `${row.key}:${row.index}` === id)) continue;
        const definition = (snapshot.sections || []).find((item) => item.key === section.key);
        changedBySection.push({
            key: section.key,
            index: section.index,
            label: clean(definition?.label || section.key, 120),
            summary: 'A section from the previous draft is no longer there.',
            meaningful: true,
            kind: 'removed'
        });
    }

    const priorNotes = new Map(
        (previousAssessment?.sections || []).map((section) => [
            `${section.key}:${section.index}`,
            section.nextStep || (section.improvements || [])[0] || ''
        ])
    );
    const feedbackApplied = (Array.isArray(parsed.feedbackApplied) ? parsed.feedbackApplied : [])
        .filter((row) => row && validSectionRef(snapshot, row?.key))
        .map((row) => {
            const index = Number.isFinite(Number(row.index)) ? Number(row.index) : 0;
            const id = `${row.key}:${index}`;
            return {
                key: row.key,
                index,
                note: clean(row.note, 400) || priorNotes.get(id) || '',
                applied: row.applied === true
            };
        });

    const overallSource = parsed.overall || {};
    return {
        ok: true,
        alignment,
        summary,
        changedBySection,
        criteriaImproved: stringList(parsed.criteriaImproved, 8),
        criteriaUnresolved: stringList(parsed.criteriaUnresolved, 8),
        feedbackApplied,
        newIssues: [
            ...stringList(parsed.newIssues, 6),
            ...alignment.removed.map((section) => `Section “${section.label || section.key}” was removed.`)
        ],
        wordDelta: summary.wordDelta,
        encouragement: clean(parsed.encouragement, 600),
        overall: {
            summary: clean(overallSource.summary, 1200),
            nextPriorities: stringList(overallSource.nextPriorities, 3)
        },
        scores: (Array.isArray(parsed.scores) ? parsed.scores : [])
            .filter((row) => row && knownKeys.has(row.key))
            .map((row) => {
                const criterion = (snapshot.rubric || []).find((item) => item.key === row.key);
                return {
                    key: row.key,
                    label: clean(criterion?.label || row.key, 120),
                    score: clampScore(row.score, criterion?.maxScore),
                    maxScore: Number(criterion?.maxScore) || 0,
                    explanation: clean(row.explanation, 400)
                };
            }),
        recommendation: {
            path: parsed?.recommendation?.path === 'notebook' ? 'notebook' : 'revise',
            reason: clean(parsed?.recommendation?.reason, 400)
        }
    };
};

/** The teacher-visible recommendation, held to the numbers. */
export const decideRecommendation = ({ normalized, assignment, draftNumber }) => {
    const ratio = rubricRatio({ scores: normalized.scores || [] });
    const comparison = normalized.comparison || {
        criteriaUnresolved: normalized.criteriaUnresolved || [],
        newIssues: normalized.newIssues || []
    };
    const decision = guardRecommendation({
        aiPath: normalized.recommendation?.path,
        assessment: {
            comparison,
            scores: normalized.scores || []
        },
        assignment,
        draftNumber
    });
    return { ...decision, ratio };
};
