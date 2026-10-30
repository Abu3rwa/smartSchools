/**
 * Pure Writing Assistant logic: no database, no AI, no request handling.
 * Everything the workflow decides lives here so it can be tested directly.
 */
import { normalizeWritingType } from '../constants/writingPresets.js';

export const countWords = (text) => {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return 0;
    return cleaned.split(' ').filter(Boolean).length;
};

export const sectionTotalWords = (sections = []) => (sections || []).reduce(
    (sum, section) => sum + countWords(section?.text),
    0
);

/** Section slot identity: the same key repeated is the same kind of paragraph. */
export const sectionSlot = (section, fallbackIndex = 0) => ({
    key: String(section?.key || '').trim(),
    index: Number.isFinite(Number(section?.index)) ? Number(section.index) : fallbackIndex
});

export const slotId = (section) => {
    const { key, index } = sectionSlot(section);
    return `${key}:${index}`;
};

/** Turn an assignment's section definitions into the student's blank working slots. */
export const buildWorkingSections = (assignment) => {
    const slots = [];
    for (const definition of assignment?.sections || []) {
        const repeats = definition.repeatable
            ? Math.max(1, Number(definition.minCount) || 1)
            : 1;
        for (let index = 0; index < repeats; index += 1) {
            slots.push({
                key: definition.key,
                index,
                label: definition.repeatable ? `${definition.label} ${index + 1}` : definition.label,
                text: ''
            });
        }
    }
    return slots;
};

/**
 * Where an editable working copy comes from: the student's own autosave, else
 * the last sent draft (a revision starts from what the teacher read), else the
 * assignment's empty structure.
 */
export const workingSectionsFor = ({ autosave, draft, assignment } = {}) => {
    if (Array.isArray(autosave?.sections) && autosave.sections.length) return autosave.sections;
    if (Array.isArray(draft?.sections) && draft.sections.length) {
        return draft.sections.map((row) => ({
            key: row?.key || '',
            index: Number(row?.index) || 0,
            text: String(row?.text || '')
        }));
    }
    return buildWorkingSections(assignment);
};

const definitionFor = (assignment, key) => (assignment?.sections || []).find(
    (definition) => definition.key === key
);

/**
 * Everything the student has typed, matched against the assignment structure.
 * `ok` is false when a required section is missing or empty, a repeatable
 * section is out of its allowed range, or the piece is under/over the word limit.
 */
export const validateSubmission = ({ assignment, sections = [] }) => {
    const errors = [];
    const counts = new Map();
    const perSectionWords = [];

    for (const section of sections) {
        const { key, index } = sectionSlot(section);
        if (!key) {
            errors.push({ code: 'unknown_section', message: 'A section is missing its identifier.' });
            continue;
        }
        counts.set(key, (counts.get(key) || 0) + 1);
        perSectionWords.push({ key, index, words: countWords(section?.text) });
    }

    for (const definition of assignment?.sections || []) {
        const seen = counts.get(definition.key) || 0;
        if (definition.required && seen === 0) {
            errors.push({
                code: 'missing_required',
                key: definition.key,
                message: `${definition.label} is required.`
            });
            continue;
        }
        const maxCount = definition.repeatable
            ? Math.max(Number(definition.maxCount) || 1, 1)
            : 1;
        const minCount = definition.required ? Math.max(Number(definition.minCount) || 1, 1) : 0;
        if (seen > maxCount) {
            errors.push({
                code: 'too_many',
                key: definition.key,
                message: `${definition.label} can be used ${maxCount} time${maxCount === 1 ? '' : 's'}.`
            });
        }
        if (definition.repeatable && seen > 0 && seen < minCount) {
            errors.push({
                code: 'too_few',
                key: definition.key,
                message: `Add ${minCount - seen} more ${definition.label.toLowerCase()} section${minCount - seen === 1 ? '' : 's'}.`
            });
        }
        if (definition.required && seen > 0) {
            const empty = perSectionWords.filter(
                (row) => row.key === definition.key && row.words === 0
            );
            if (empty.length) {
                errors.push({
                    code: 'empty_section',
                    key: definition.key,
                    message: `${definition.label} still needs writing.`
                });
            }
        }
        if (definition.minWords > 0) {
            const short = perSectionWords.filter(
                (row) => row.key === definition.key && row.words < definition.minWords
            );
            for (const row of short) {
                errors.push({
                    code: 'section_too_short',
                    key: definition.key,
                    index: row.index,
                    message: `${definition.label} needs at least ${definition.minWords} words (currently ${row.words}).`
                });
            }
        }
    }

    const totalWords = sectionTotalWords(sections);
    const minWords = Number(assignment?.minWords) || 0;
    const maxWords = Number(assignment?.maxWords) || 0;
    if (minWords > 0 && totalWords < minWords) {
        errors.push({
            code: 'too_short',
            message: `${totalWords} words so far — the assignment needs at least ${minWords}.`
        });
    }
    if (maxWords > 0 && totalWords > maxWords) {
        errors.push({
            code: 'too_long',
            message: `${totalWords} words — the limit is ${maxWords}.`
        });
    }

    const unknownKeys = [...counts.keys()].filter((key) => !definitionFor(assignment, key));
    for (const key of unknownKeys) {
        errors.push({
            code: 'unknown_section',
            key,
            message: 'A section in this draft is not part of the assignment.'
        });
    }

    return { ok: errors.length === 0, errors, totalWords, perSectionWords };
};

/** Shape stored on the immutable draft, with word counts computed here. */
export const buildDraftSections = ({ assignment, sections = [] }) => {
    const orderOf = (key) => {
        const index = (assignment?.sections || []).findIndex((definition) => definition.key === key);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const rows = [];
    for (const section of sections) {
        const { key, index } = sectionSlot(section);
        if (!key) continue;
        const definition = definitionFor(assignment, key);
        if (!definition) continue;
        rows.push({
            key,
            index,
            label: definition.repeatable
                ? `${definition.label} ${index + 1}`
                : definition.label,
            text: String(section?.text || '').trim(),
            words: countWords(section?.text)
        });
    }
    return rows.sort((a, b) => {
        if (a.key === b.key) return a.index - b.index;
        const orderA = orderOf(a.key);
        const orderB = orderOf(b.key);
        if (orderA !== orderB) return orderA - orderB;
        return String(a.key).localeCompare(String(b.key));
    });
};

export const configSnapshotFor = (assignment) => ({
    writingType: normalizeWritingType(assignment?.writingType),
    title: assignment?.title || '',
    instructions: assignment?.instructions || '',
    topic: assignment?.topic || '',
    minWords: Number(assignment?.minWords) || 0,
    maxWords: Number(assignment?.maxWords) || 0,
    expectedLevel: assignment?.expectedLevel || '',
    sections: (assignment?.sections || []).map((definition) => ({
        key: definition.key,
        label: definition.label,
        kind: definition.kind,
        instructions: definition.instructions || '',
        required: definition.required !== false,
        minWords: Number(definition.minWords) || 0,
        criteria: definition.criteria || []
    })),
    rubric: (assignment?.rubric || []).map((criterion) => ({
        key: criterion.key,
        label: criterion.label,
        description: criterion.description || '',
        maxScore: Number(criterion.maxScore) || 0,
        appliesToSections: criterion.appliesToSections || ['*']
    }))
});

/* ------------------------------------------------------------------ */
/* Workflow stage machine                                              */
/* ------------------------------------------------------------------ */

export const SUBMITTABLE_STAGES = [
    'not_started',
    'drafting',
    'feedback_published',
    'revising',
    'compared'
];

/** A submission always waits for the teacher, whatever draft number it is. */
export const stageAfterSubmit = () => 'submitted';

export const stageAfterAssessment = () => 'feedback_ready';

/** A comparison and a first-draft feedback note do not land the student in the same place. */
export const stageAfterPublish = (kind = 'feedback', path = 'revise') => {
    if (kind !== 'comparison') return 'feedback_published';
    return path === 'notebook' ? 'ready_for_notebook' : 'compared';
};

/** Project status follows the published recommendation until a teacher overrides it. */
export const statusAfterPublish = (path) => (
    path === 'notebook' ? 'ready_for_final' : 'needs_revision'
);

/** Stages a publication may move the student out of. */
export const PUBLISHABLE_FROM = {
    feedback: ['submitted', 'feedback_ready'],
    comparison: ['submitted', 'feedback_ready', 'feedback_published', 'revising', 'compared']
};

/**
 * Teachers can lock a stage. While a lock exists, automatic transitions are refused
 * so an AI recommendation can never move a student past what the teacher decided.
 */
export const canMoveTo = (project, nextStage) => {
    const lockedTo = project?.teacherOverride?.stageLockedTo;
    if (!lockedTo) return true;
    return nextStage === lockedTo;
};

export const canStudentSubmit = ({ project, assignment }) => {
    if (!project) return { allowed: false, reason: 'This writing task has not been opened yet.' };
    if (project.stage === 'completed') {
        return { allowed: false, reason: 'This assignment is finished.' };
    }
    if (project.stage === 'awaiting_notebook_check') {
        return { allowed: false, reason: 'Your teacher is checking your notebook copy.' };
    }
    if (project.stage === 'ready_for_notebook') {
        return { allowed: false, reason: 'You are ready to write your final copy in your notebook.' };
    }
    if (!SUBMITTABLE_STAGES.includes(project.stage)) {
        return { allowed: false, reason: 'This draft is with your teacher right now.' };
    }
    return { allowed: true, reason: '' };
};

/* ------------------------------------------------------------------ */
/* Draft comparison                                                    */
/* ------------------------------------------------------------------ */

/**
 * Match sections between two versions by key + index. A body paragraph the student
 * added shows up as `added`, one they deleted as `removed`; neither is treated as
 * an unchanged section.
 */
export const alignSections = (previousSections = [], currentSections = []) => {
    const previousById = new Map(previousSections.map((section) => [slotId(section), section]));
    const currentById = new Map(currentSections.map((section) => [slotId(section), section]));
    const matched = [];
    const added = [];
    const removed = [];

    for (const section of currentSections) {
        const id = slotId(section);
        const before = previousById.get(id);
        if (!before) {
            added.push(section);
            continue;
        }
        const beforeText = String(before.text || '').trim();
        const afterText = String(section.text || '').trim();
        matched.push({
            key: section.key,
            index: section.index,
            before,
            after: section,
            changed: beforeText !== afterText,
            wordDelta: countWords(afterText) - countWords(beforeText)
        });
    }

    for (const section of previousSections) {
        if (!currentById.has(slotId(section))) removed.push(section);
    }

    const changedCount = matched.filter((row) => row.changed).length;
    return {
        matched,
        added,
        removed,
        changedCount,
        unchangedCount: matched.length - changedCount
    };
};

export const draftDiffSummary = (alignment) => ({
    changedSections: alignment.changedCount,
    addedSections: alignment.added.length,
    removedSections: alignment.removed.length,
    wordDelta: alignment.matched.reduce((sum, row) => sum + row.wordDelta, 0)
        + alignment.added.reduce((sum, row) => sum + countWords(row.text), 0)
        - alignment.removed.reduce((sum, row) => sum + countWords(row.text), 0)
});

/* ------------------------------------------------------------------ */
/* Revision tasks                                                      */
/* ------------------------------------------------------------------ */

/**
 * The priorities a student was given, keyed so the next draft can be checked
 * against them one by one. Ids are positional: rewording a task keeps its
 * identity, and feedback saved before tasks existed keys the same way.
 */
export const tasksFromPriorities = (priorities = []) => (priorities || [])
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((text, index) => ({ id: `t${index + 1}`, text }));

/** The tasks a revision is checked against, stored or derived from the priorities. */
export const tasksForCheckback = (assessment) => {
    const stored = (assessment?.tasks || []).filter((row) => row?.id && row?.text);
    return stored.length ? stored : tasksFromPriorities(assessment?.overall?.nextPriorities);
};

/**
 * The running record of a student's tasks across drafts. Ids are positional, so
 * a task with the same words keeps its history, and a reworded slot starts over.
 * A task that survives two comparisons is flagged as stalled for the teacher.
 * The ledger never moves a student: only the teacher publishes a path.
 */
export const mergeRevisionLedger = ({
    ledger = [],
    tasks = [],
    taskResults = [],
    draftNumber = 1
}) => {
    const results = new Map((taskResults || []).map((row) => [String(row.id), row]));
    const known = new Map((ledger || []).filter((row) => row?.id).map((row) => [row.id, row]));
    const next = [];
    const asked = new Set();

    for (const task of tasks || []) {
        if (!task?.id || !task?.text) continue;
        asked.add(task.id);
        const before = known.get(task.id);
        const result = results.get(task.id);
        const reworded = Boolean(before && before.text && before.text !== task.text);
        const base = !before || reworded
            ? {
                id: task.id,
                text: task.text,
                introducedDraft: draftNumber,
                checks: 0,
                unresolvedStreak: 0,
                status: 'open'
            }
            : { ...before, text: task.text };

        if (!result) {
            next.push({ ...base, status: 'open' });
            continue;
        }

        const applied = result.applied === true;
        const streak = applied ? 0 : (Number(base.unresolvedStreak) || 0) + 1;
        next.push({
            ...base,
            checks: (Number(base.checks) || 0) + 1,
            unresolvedStreak: streak,
            lastCheckedDraft: draftNumber,
            status: applied ? 'resolved' : (streak >= 2 ? 'stalled' : 'open'),
            ...(applied ? { resolvedDraft: draftNumber } : {}),
            ...(result.note ? { note: result.note } : {})
        });
    }

    // A task the teacher stopped asking for is not a failure. Closing the entry
    // keeps an old stall from blocking the notebook forever.
    for (const row of known.values()) {
        if (asked.has(row.id)) continue;
        next.push(row.status === 'resolved' ? row : { ...row, status: 'dropped' });
    }

    return next;
};

export const stalledTasksFrom = (ledger = []) => (ledger || []).filter(
    (row) => row?.status === 'stalled'
);

export const ledgerSummary = (ledger = []) => (ledger || []).reduce(
    (sum, row) => {
        if (Object.hasOwn(sum, row?.status)) sum[row.status] += 1;
        return sum;
    },
    { open: 0, resolved: 0, stalled: 0, dropped: 0 }
);

/* ------------------------------------------------------------------ */
/* Spelling word targets                                               */
/* ------------------------------------------------------------------ */

// Words are matched whole and case-insensitively; contractions stay one token.
const SPELLING_TOKEN = /[a-z0-9]+(?:['’][a-z]+)*/g;

export const textTokens = (value) => String(value || '').toLowerCase().match(SPELLING_TOKEN) || [];

/**
 * Words the assignment already gives the student. Suggesting one back would be
 * busywork, so title, topic, instructions, word bank and model text are excluded.
 */
export const assignmentOwnedTokens = (assignment = {}) => new Set(textTokens([
    assignment?.title,
    assignment?.topic,
    assignment?.instructions,
    (assignment?.supports?.wordBank || []).join(' '),
    assignment?.supports?.modelText
].join(' ')));

/**
 * Turn the AI's choices into at most three usable targets. Anything that is not
 * on the student's own missed-word list is dropped, as is a word already used in
 * the draft or one the assignment itself supplied. An empty list is a fine result.
 */
export const selectSpellingTargets = ({
    suggestions = [],
    candidates = [],
    assignment = {},
    draftText = ''
} = {}) => {
    const allowed = new Map(
        (candidates || [])
            .map((row) => [String(row?.word || '').trim().toLowerCase(), row])
            .filter(([word]) => word)
    );
    const owned = assignmentOwnedTokens(assignment);
    const used = new Set(textTokens(draftText));
    const seen = new Set();
    const picked = [];

    for (const raw of suggestions || []) {
        const key = String(raw?.word ?? raw ?? '').trim().toLowerCase();
        if (!key || seen.has(key) || used.has(key) || owned.has(key)) continue;
        const candidate = allowed.get(key);
        if (!candidate) continue;
        seen.add(key);
        picked.push({
            word: candidate.word,
            grade: candidate.grade || '',
            week: Number(candidate.week) || 0
        });
        if (picked.length === 3) break;
    }
    return picked;
};

/**
 * A win is a fact, not a model claim: a target appears in the draft as the same
 * whole word. The server computes this from the text, never the AI.
 */
export const verifiedSpellingWins = ({ targets = [], draftText = '' } = {}) => {
    const used = new Set(textTokens(draftText));
    return (targets || [])
        .filter((row) => row?.word && used.has(String(row.word).toLowerCase()))
        .map((row) => ({ word: row.word }));
};

/* ------------------------------------------------------------------ */
/* Recommendation                                                      */
/* ------------------------------------------------------------------ */

export const rubricRatio = ({ scores = [] }) => {
    const max = scores.reduce((sum, row) => sum + (Number(row?.maxScore) || 0), 0);
    if (max <= 0) return null;
    const earned = scores.reduce((sum, row) => sum + (Number(row?.score) || 0), 0);
    return earned / max;
};

/* ------------------------------------------------------------------ */
/* Differentiation profile                                             */
/* ------------------------------------------------------------------ */

export const WRITING_TIERS = ['emerging', 'developing', 'secure'];

/**
 * How much support this student needs, from their own marked drafts rather than
 * from a grade label. The newest three marked drafts decide it so one weak piece
 * does not follow a student around.
 */
export const writingTierFrom = ({ assessments = [] } = {}) => {
    const seen = new Set();
    const ratios = [];
    for (const row of assessments || []) {
        if (row?.aiStatus && row.aiStatus !== 'done') continue;
        const draft = String(row?.draft || '');
        if (draft && seen.has(draft)) continue;
        if (draft) seen.add(draft);
        const ratio = rubricRatio({ scores: row?.scores || [] });
        if (ratio !== null && Number.isFinite(ratio)) ratios.push(ratio);
        if (ratios.length === 3) break;
    }
    if (!ratios.length) return 'unknown';
    const average = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
    if (average >= 0.8) return 'secure';
    if (average >= 0.55) return 'developing';
    return 'emerging';
};

/** Spelling grade and accuracy, used only to pitch spelling corrections. */
export const spellingProfileFrom = (analysis) => {
    const grade = String(analysis?.grade || '');
    const metrics = analysis?.metrics || {};
    const hasAttempts = Number(metrics.attempts) > 0;
    const accuracy = hasAttempts ? Number(metrics.accuracy) : NaN;
    return {
        grade,
        accuracy: Number.isFinite(accuracy) ? accuracy : null
    };
};

export const buildWritingProfile = ({ assessments = [], spelling = null } = {}) => {
    const { grade, accuracy } = spellingProfileFrom(spelling);
    return {
        tier: writingTierFrom({ assessments }),
        spellingGrade: grade,
        spellingAccuracy: accuracy
    };
};

/**
 * The AI proposes a path; this decides whether the numbers support it.
 * A student with unresolved criteria and a low rubric ratio is never sent
 * straight to the notebook because the model was generous. A draft count never
 * decides anything: only the teacher publishes the piece as ready.
 */
export const guardRecommendation = ({ aiPath, assessment, stalled = 0 }) => {
    const unresolved = (assessment?.comparison?.criteriaUnresolved || []).length;
    const newIssues = (assessment?.comparison?.newIssues || []).length;
    const ratio = rubricRatio({ scores: assessment?.scores || [] });

    if (aiPath === 'notebook') {
        if (stalled > 0) {
            return {
                path: 'revise',
                reason: 'A task from an earlier round is still not done, so another draft is the better next step.'
            };
        }
        const weak = (ratio !== null && ratio < 0.7) || unresolved >= 2 || newIssues >= 2;
        if (weak) {
            return {
                path: 'revise',
                reason: 'The rubric still has clear gaps, so another draft is the better next step.'
            };
        }
        return { path: 'notebook', reason: assessment?.recommendation?.reason || 'The writing meets the criteria.' };
    }
    return { path: 'revise', reason: assessment?.recommendation?.reason || 'Work through the remaining priorities first.' };
};

/* ------------------------------------------------------------------ */
/* Progress views                                                      */
/* ------------------------------------------------------------------ */

export const STAGE_LABELS = {
    not_started: 'Not started',
    drafting: 'Writing',
    submitted: 'Draft submitted',
    feedback_ready: 'Feedback ready',
    feedback_published: 'Feedback published',
    revising: 'Revising',
    compared: 'Drafts compared',
    ready_for_notebook: 'Ready for notebook',
    awaiting_notebook_check: 'Notebook to check',
    completed: 'Completed'
};

// An AI reply is capped at two minutes per model, so a run still "running"
// after five minutes died with the server or its request. It must never wedge
// the draft: the teacher can retry. The client shows its retry at the same age.
export const STALE_RUN_MS = 5 * 60 * 1000;

export const staleRunCutoff = (now = Date.now()) => new Date(now - STALE_RUN_MS);

export const summarizeBoard = (projects = []) => {
    const counts = {};
    for (const stage of Object.keys(STAGE_LABELS)) counts[stage] = 0;
    let unassessed = 0;
    let unpublished = 0;
    for (const project of projects) {
        counts[project.stage] = (counts[project.stage] || 0) + 1;
        if (project.stage === 'submitted') unassessed += 1;
        if (project.stage === 'feedback_ready') unpublished += 1;
    }
    return {
        counts,
        total: projects.length,
        notStarted: counts.not_started + counts.drafting,
        awaitingAssessment: unassessed,
        awaitingPublish: unpublished,
        revising: counts.revising + counts.compared + counts.feedback_published,
        readyForNotebook: counts.ready_for_notebook,
        notebookToCheck: counts.awaiting_notebook_check,
        completed: counts.completed
    };
};

/**
 * The student's progress tracker. Revising is a repeatable stage: there is no
 * fixed number of drafts, so the tracker never promises a "second and final"
 * draft. The teacher alone marks the piece ready for the notebook.
 */
export const buildTracker = ({ assignment, project, hasComparison }) => {
    const requireNotebook = assignment?.workflow?.requireNotebookCheck !== false;

    const steps = [];
    const push = (key, label) => {
        steps.push({ key, label });
        return steps.length - 1;
    };

    const draftIndex = push('draft_1', 'My draft');
    const feedbackIndex = push('feedback_1', 'Teacher feedback');
    const reviseIndex = push('draft_2', 'Revise');
    const compareIndex = hasComparison ? push('compare', 'Compare drafts') : null;
    const readyIndex = push('next_step', 'Ready to finish');
    const notebookIndex = requireNotebook ? push('notebook_check', 'Teacher checks the notebook') : null;
    push('completed', 'Done');

    const stage = project?.stage || 'not_started';
    const currentIndex = (() => {
        if (stage === 'not_started' || stage === 'drafting') return draftIndex;
        if (stage === 'submitted' || stage === 'feedback_ready') return feedbackIndex;
        if (stage === 'feedback_published' || stage === 'revising') return reviseIndex;
        if (stage === 'compared') return compareIndex ?? reviseIndex;
        if (stage === 'ready_for_notebook') return readyIndex;
        if (stage === 'awaiting_notebook_check') return notebookIndex ?? steps.length - 1;
        if (stage === 'completed') return steps.length;
        return draftIndex;
    })();

    return steps.map((step, index) => ({
        ...step,
        state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
    }));
};

/** The one thing the student should do next, in language a student can act on. */
export const studentNextAction = ({ project, assignment, publishedAssessment }) => {
    const stage = project?.stage || 'not_started';
    const draftNumber = Number(project?.draftCount) || 0;
    const label = (verb) => `${verb} draft ${draftNumber + 1}`;

    switch (stage) {
        case 'not_started':
            return { action: 'start', label: 'Start my first draft', primary: true };
        case 'drafting':
            return { action: 'continue', label: 'Keep writing', primary: true };
        case 'submitted':
            return {
                action: 'wait',
                label: `Your teacher is reviewing draft ${Math.max(1, draftNumber)}`,
                primary: false
            };
        case 'feedback_ready':
            return {
                action: 'wait',
                label: `Your teacher is reviewing draft ${Math.max(1, draftNumber)}`,
                primary: false
            };
        case 'feedback_published':
        case 'revising':
            return { action: 'revise', label: label('Start my'), primary: true };
        case 'compared': {
            const path = publishedAssessment?.recommendation?.path;
            if (path === 'notebook') {
                return { action: 'notebook', label: 'Write my final notebook copy', primary: true };
            }
            return { action: 'revise', label: label('Start my'), primary: true };
        }
        case 'ready_for_notebook':
            return { action: 'notebook', label: 'Write my final notebook copy', primary: true };
        case 'awaiting_notebook_check':
            return { action: 'wait', label: 'Waiting for your teacher to check your notebook', primary: false };
        case 'completed':
            return { action: 'done', label: 'Completed', primary: false };
        default:
            return { action: 'continue', label: 'Keep writing', primary: true };
    }
};

export const assignmentRosterSize = ({ assignment, studentCount = 0 }) => {
    if ((assignment?.students || []).length) return assignment.students.length;
    return Number(studentCount) || 0;
};
