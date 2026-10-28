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
    const maxDrafts = Number(assignment?.workflow?.maxDrafts) || 4;
    if ((Number(project.draftCount) || 0) >= maxDrafts) {
        return {
            allowed: false,
            reason: `This assignment allows ${maxDrafts} drafts. Ask your teacher if you need another.`
        };
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
/* Recommendation                                                      */
/* ------------------------------------------------------------------ */

export const rubricRatio = ({ scores = [] }) => {
    const max = scores.reduce((sum, row) => sum + (Number(row?.maxScore) || 0), 0);
    if (max <= 0) return null;
    const earned = scores.reduce((sum, row) => sum + (Number(row?.score) || 0), 0);
    return earned / max;
};

/**
 * The AI proposes a path; this decides whether the numbers support it.
 * A student with unresolved criteria and a low rubric ratio is never sent
 * straight to the notebook because the model was generous.
 */
export const guardRecommendation = ({
    aiPath,
    assessment,
    assignment,
    draftNumber
}) => {
    const unresolved = (assessment?.comparison?.criteriaUnresolved || []).length;
    const newIssues = (assessment?.comparison?.newIssues || []).length;
    const ratio = rubricRatio({ scores: assessment?.scores || [] });
    const maxDrafts = Number(assignment?.workflow?.maxDrafts) || 4;
    const outOfDrafts = Number(draftNumber) >= maxDrafts;

    if (outOfDrafts) {
        return {
            path: 'notebook',
            reason: `This assignment allows ${maxDrafts} drafts, so it is time to write the final copy.`
        };
    }
    if (aiPath === 'notebook') {
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
 * The student's progress tracker, trimmed to what the configuration actually uses.
 * A single-draft task never shows a compare step; a task that ends at the notebook
 * check always shows it.
 */
export const buildTracker = ({ assignment, project, hasComparison }) => {
    const maxDrafts = Number(assignment?.workflow?.maxDrafts) || 4;
    const requireNotebook = assignment?.workflow?.requireNotebookCheck !== false;
    const draftNumber = Number(project?.draftCount) || 0;

    const steps = [];
    const push = (key, label) => steps.push({ key, label });

    push('draft_1', 'First draft');
    push('feedback_1', 'First-draft feedback');
    if (maxDrafts >= 2) {
        push('draft_2', 'Second draft');
        if (maxDrafts >= 3 || hasComparison) push('compare', 'Compare drafts');
    }
    push('next_step', maxDrafts >= 2 ? 'Revise or prepare notebook' : 'Prepare notebook');
    if (requireNotebook) push('notebook_check', 'Teacher checks notebook');
    push('completed', 'Done');

    const currentIndex = (() => {
        const stage = project?.stage || 'not_started';
        if (stage === 'not_started' || stage === 'drafting') return 0;
        if (stage === 'submitted') return draftNumber <= 1 ? 0 : Math.max(0, steps.findIndex((step) => step.key === 'draft_2'));
        if (stage === 'feedback_ready') return draftNumber <= 1 ? 1 : 0;
        if (stage === 'feedback_published') return draftNumber <= 1 ? 1 : 2;
        if (stage === 'revising') return 2;
        if (stage === 'compared') return hasComparison ? 3 : 2;
        if (stage === 'ready_for_notebook') return steps.findIndex((step) => step.key === 'next_step');
        if (stage === 'awaiting_notebook_check') return requireNotebook ? steps.length - 2 : steps.length - 1;
        if (stage === 'completed') return steps.length;
        return 0;
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
