/**
 * Writing Assistant — Phase 1 (guided writing and first drafts).
 *
 * Nothing in this file calls the AI. Assessment and comparison arrive in
 * writingAssistantAssessmentService.js, which only teacher routes reach.
 */
import mongoose from 'mongoose';

import WritingAssignment from '../models/WritingAssignment.js';
import WritingProject from '../models/WritingProject.js';
import WritingDraft from '../models/WritingDraft.js';
import WritingAssessment from '../models/WritingAssessment.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';

import {
    DEFAULT_AI_CONSTRAINTS,
    normalizeWritingType,
    presetRubric,
    presetSections
} from '../constants/writingPresets.js';
import {
    STAGE_LABELS,
    buildDraftSections,
    buildTracker,
    buildWorkingSections,
    canMoveTo,
    canStudentSubmit,
    configSnapshotFor,
    sectionTotalWords,
    stageAfterSubmit,
    studentNextAction,
    summarizeBoard,
    validateSubmission,
    workingSectionsFor
} from './writingAssistantLogic.js';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });

const objectId = (value) => {
    if (!mongoose.isValidObjectId(String(value || ''))) return null;
    return String(value);
};

const sameId = (a, b) => String(a || '') === String(b || '');

/* ------------------------------------------------------------------ */
/* Assignment configuration                                            */
/* ------------------------------------------------------------------ */

const normalizeSectionRows = (input) => {
    const rows = Array.isArray(input) ? input : [];
    const seen = new Set();
    const cleaned = [];
    for (const row of rows) {
        const key = String(row?.key || '').trim().toLowerCase().replace(/\s+/g, '_');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const repeatable = row?.repeatable === true;
        const minCount = Math.max(Number(row?.minCount) || 1, 1);
        const maxCount = Math.max(Number(row?.maxCount) || minCount, minCount);
        cleaned.push({
            key,
            label: String(row?.label || key).trim().slice(0, 120),
            kind: String(row?.kind || 'body').trim().slice(0, 40),
            instructions: String(row?.instructions || '').trim().slice(0, 2000),
            required: row?.required !== false,
            repeatable,
            minCount: repeatable ? minCount : 1,
            maxCount: repeatable ? maxCount : 1,
            minWords: Math.max(Number(row?.minWords) || 0, 0),
            criteria: (Array.isArray(row?.criteria) ? row.criteria : [])
                .map((item) => String(item || '').trim().slice(0, 200))
                .filter(Boolean)
                .slice(0, 10)
        });
    }
    return cleaned;
};

const normalizeRubricRows = (input) => {
    const rows = Array.isArray(input) ? input : [];
    const seen = new Set();
    const cleaned = [];
    for (const row of rows) {
        const key = String(row?.key || '').trim().toLowerCase().replace(/\s+/g, '_');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        cleaned.push({
            key,
            label: String(row?.label || key).trim().slice(0, 120),
            description: String(row?.description || '').trim().slice(0, 1000),
            maxScore: Math.min(Math.max(Number(row?.maxScore) || 0, 0), 100),
            appliesToSections: (Array.isArray(row?.appliesToSections) ? row.appliesToSections : ['*'])
                .map((item) => String(item || '').trim())
                .filter(Boolean)
                .slice(0, 12)
        });
    }
    return cleaned;
};

const normalizeSupports = (input = {}) => ({
    wordBank: (Array.isArray(input.wordBank) ? input.wordBank : [])
        .map((item) => String(item || '').trim().slice(0, 60)).filter(Boolean).slice(0, 60),
    transitions: (Array.isArray(input.transitions) ? input.transitions : [])
        .map((item) => String(item || '').trim().slice(0, 80)).filter(Boolean).slice(0, 40),
    sentenceStarters: (Array.isArray(input.sentenceStarters) ? input.sentenceStarters : [])
        .map((item) => String(item || '').trim().slice(0, 160)).filter(Boolean).slice(0, 30),
    guidingQuestions: (Array.isArray(input.guidingQuestions) ? input.guidingQuestions : [])
        .map((item) => String(item || '').trim().slice(0, 240)).filter(Boolean).slice(0, 20),
    modelText: String(input.modelText || '').trim().slice(0, 6000),
    plannerPrompt: String(input.plannerPrompt || '').trim().slice(0, 2000)
});

const normalizeWorkflow = (input = {}) => ({
    teacherPublishesFeedback: input.teacherPublishesFeedback !== false,
    maxDrafts: Math.min(Math.max(Number(input.maxDrafts) || 4, 1), 20),
    requireNotebookCheck: input.requireNotebookCheck !== false,
    autoSuggestNextStep: input.autoSuggestNextStep !== false
});

/**
 * Teachers pick a writing type and get its structure; sending explicit sections
 * wins, so an edited preset survives a save.
 */
const resolveStructure = (payload) => {
    const writingType = normalizeWritingType(payload.writingType);
    const provided = normalizeSectionRows(payload.sections);
    if (provided.length) {
        return { writingType, sections: provided, rubric: normalizeRubricRows(payload.rubric) };
    }
    return {
        writingType,
        sections: normalizeSectionRows(presetSections(writingType)),
        rubric: normalizeRubricRows(
            Array.isArray(payload.rubric) && payload.rubric.length ? payload.rubric : presetRubric()
        )
    };
};

const assertVisibleToTeacher = (assignment, userId, isAdmin) => {
    if (isAdmin || sameId(assignment.assignedBy, userId)) return;
    throw forbidden('Only the teacher who created this writing task or a school admin can change it.');
};

const resolveAudience = async ({ schoolId, classId, studentIds, academicYear }) => {
    if (studentIds?.length) {
        const query = {
            school: schoolId,
            _id: { $in: studentIds.map(objectId).filter(Boolean) },
            status: 'active'
        };
        if (academicYear) query.academicYear = academicYear;
        const found = await Student.find(query).select('_id').lean();
        return { classId: classId || null, students: found.map((row) => row._id) };
    }
    if (classId) {
        const classQuery = { _id: classId, school: schoolId };
        if (academicYear) classQuery.academicYear = academicYear;
        const classDoc = await Class.findOne(classQuery).select('_id').lean();
        if (!classDoc) throw notFound(academicYear ? `Class not found in ${academicYear}` : 'Class not found');
        const inClass = await Student.find({
            school: schoolId,
            currentClass: classId,
            status: 'active',
            ...(academicYear ? { academicYear } : {})
        }).select('_id').lean();
        return { classId, students: inClass.map((row) => row._id) };
    }
    throw badRequest('Choose a class or at least one student.');
};

export const createAssignment = async ({
    schoolId,
    academicYear = null,
    userId,
    payload = {}
}) => {
    const title = String(payload.title || '').trim();
    if (!title) throw badRequest('A writing task needs a title.');

    const structure = resolveStructure(payload);
    if (!structure.sections.length) throw badRequest('Add at least one section to the writing structure.');

    const audience = await resolveAudience({
        schoolId,
        classId: objectId(payload.classId || payload.class),
        studentIds: payload.studentIds,
        academicYear
    });
    if (!audience.students.length) throw badRequest('No students matched that class.');

    const goals = (Array.isArray(payload.goals) ? payload.goals : [])
        .map((row) => ({
            student: objectId(row?.student),
            text: String(row?.text || '').trim().slice(0, 500)
        }))
        .filter((row) => row.student && row.text);

    const assignment = await WritingAssignment.create({
        school: schoolId,
        academicYear: academicYear || undefined,
        title: title.slice(0, 200),
        instructions: String(payload.instructions || '').trim().slice(0, 6000),
        writingType: structure.writingType,
        topic: String(payload.topic || '').trim().slice(0, 500),
        assignedBy: userId,
        class: audience.classId || undefined,
        students: audience.students,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        isActive: payload.isActive !== false,
        isTemplate: payload.isTemplate === true,
        minWords: Math.max(Number(payload.minWords) || 0, 0),
        maxWords: Math.max(Number(payload.maxWords) || 0, 0),
        expectedLevel: String(payload.expectedLevel || '').trim().slice(0, 200),
        goals,
        sections: structure.sections,
        supports: normalizeSupports(payload.supports),
        rubric: structure.rubric,
        workflow: normalizeWorkflow(payload.workflow),
        aiConstraints: String(payload.aiConstraints || DEFAULT_AI_CONSTRAINTS).trim().slice(0, 2000)
    });

    return assignment.toObject();
};

export const updateAssignment = async ({
    schoolId,
    assignmentId,
    userId,
    isAdmin = false,
    payload = {}
}) => {
    const id = objectId(assignmentId);
    if (!id) throw notFound('Writing task not found.');
    const assignment = await WritingAssignment.findOne({ school: schoolId, _id: id });
    if (!assignment) throw notFound('Writing task not found.');
    assertVisibleToTeacher(assignment, userId, isAdmin);

    const structure = payload.sections || payload.writingType
        ? resolveStructure({ ...payload, sections: payload.sections ?? assignment.sections, writingType: payload.writingType ?? assignment.writingType })
        : null;

    if (payload.title !== undefined) {
        const title = String(payload.title || '').trim();
        if (!title) throw badRequest('A writing task needs a title.');
        assignment.title = title.slice(0, 200);
    }
    if (payload.instructions !== undefined) assignment.instructions = String(payload.instructions || '').trim().slice(0, 6000);
    if (payload.topic !== undefined) assignment.topic = String(payload.topic || '').trim().slice(0, 500);
    if (payload.expectedLevel !== undefined) assignment.expectedLevel = String(payload.expectedLevel || '').trim().slice(0, 200);
    if (payload.minWords !== undefined) assignment.minWords = Math.max(Number(payload.minWords) || 0, 0);
    if (payload.maxWords !== undefined) assignment.maxWords = Math.max(Number(payload.maxWords) || 0, 0);
    if (payload.dueDate !== undefined) assignment.dueDate = payload.dueDate ? new Date(payload.dueDate) : undefined;
    if (payload.isActive !== undefined) assignment.isActive = payload.isActive !== false;
    if (payload.isTemplate !== undefined) assignment.isTemplate = payload.isTemplate === true;
    if (payload.supports !== undefined) assignment.supports = normalizeSupports(payload.supports);
    if (payload.workflow !== undefined) assignment.workflow = normalizeWorkflow(payload.workflow);
    if (payload.aiConstraints !== undefined) assignment.aiConstraints = String(payload.aiConstraints || '').trim().slice(0, 2000);
    if (payload.rubric !== undefined && !structure) assignment.rubric = normalizeRubricRows(payload.rubric);
    if (structure) {
        assignment.writingType = structure.writingType;
        assignment.sections = structure.sections;
        assignment.rubric = structure.rubric;
    }
    if (payload.studentIds || payload.classId || payload.class) {
        const audience = await resolveAudience({
            schoolId,
            classId: objectId(payload.classId || payload.class),
            studentIds: payload.studentIds,
            academicYear: assignment.academicYear
        });
        if (!audience.students.length) throw badRequest('No students matched that class.');
        assignment.class = audience.classId || undefined;
        assignment.students = audience.students;
    }
    if (payload.goals !== undefined) {
        assignment.goals = (Array.isArray(payload.goals) ? payload.goals : [])
            .map((row) => ({ student: objectId(row?.student), text: String(row?.text || '').trim().slice(0, 500) }))
            .filter((row) => row.student && row.text);
    }

    await assignment.save();
    return assignment.toObject();
};

export const listAssignments = async ({
    schoolId,
    userId,
    isAdmin = false,
    classId,
    academicYear,
    search = '',
    includeTemplates = false
} = {}) => {
    const query = { school: schoolId, isTemplate: includeTemplates === true };
    if (!isAdmin) query.assignedBy = userId;
    if (objectId(classId)) query.class = classId;
    if (academicYear) query.academicYear = academicYear;
    if (search) {
        query.title = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const rows = await WritingAssignment.find(query)
        .sort({ createdAt: -1 })
        .lean();

    const counts = rows.length
        ? await WritingProject.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), assignment: { $in: rows.map((row) => row._id) } } },
            { $group: { _id: { assignment: '$assignment', stage: '$stage' }, projects: { $sum: 1 }, drafts: { $sum: '$draftCount' } } }
        ], { skipTenantFilter: true })
        : [];
    const countById = new Map();
    for (const row of counts) {
        const key = String(row._id.assignment);
        const bucket = countById.get(key) || { projects: 0, drafts: 0, stages: {} };
        bucket.projects += row.projects;
        bucket.drafts += row.drafts;
        bucket.stages[row._id.stage] = (bucket.stages[row._id.stage] || 0) + row.projects;
        countById.set(key, bucket);
    }

    return rows.map((row) => ({
        ...row,
        totalPoints: (row.rubric || []).reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0),
        audienceSize: (row.students || []).length,
        projectCount: countById.get(String(row._id))?.projects || 0,
        draftCount: countById.get(String(row._id))?.drafts || 0,
        stageCounts: countById.get(String(row._id))?.stages || {}
    }));
};

export const getAssignment = async ({ schoolId, assignmentId }) => {
    const id = objectId(assignmentId);
    if (!id) throw notFound('Writing task not found.');
    const assignment = await WritingAssignment.findOne({ school: schoolId, _id: id }).lean();
    if (!assignment) throw notFound('Writing task not found.');
    return {
        ...assignment,
        totalPoints: (assignment.rubric || []).reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0)
    };
};

/**
 * Hide the task from students without deleting any writing. Same convention as
 * the reading module: results stay reviewable by the teacher.
 */
export const deactivateAssignment = async ({ schoolId, assignmentId, userId, isAdmin = false }) => {
    const id = objectId(assignmentId);
    if (!id) throw notFound('Writing task not found.');
    const assignment = await WritingAssignment.findOne({ school: schoolId, _id: id });
    if (!assignment) throw notFound('Writing task not found.');
    assertVisibleToTeacher(assignment, userId, isAdmin);
    assignment.isActive = false;
    await assignment.save();
    return { _id: assignment._id, isActive: false };
};

export const saveAsTemplate = async ({ schoolId, assignmentId, userId, isAdmin = false }) => {
    const source = await getAssignment({ schoolId, assignmentId });
    assertVisibleToTeacher({ assignedBy: source.assignedBy }, userId, isAdmin);
    const copy = await WritingAssignment.create({
        school: schoolId,
        title: `${source.title} (template)`.slice(0, 200),
        instructions: source.instructions,
        writingType: source.writingType,
        topic: source.topic,
        assignedBy: userId,
        isActive: true,
        isTemplate: true,
        minWords: source.minWords,
        maxWords: source.maxWords,
        expectedLevel: source.expectedLevel,
        sections: source.sections,
        supports: source.supports,
        rubric: source.rubric,
        workflow: source.workflow,
        aiConstraints: source.aiConstraints
    });
    return copy.toObject();
};

/** A template becomes a live task by copying its configuration and choosing a new audience. */
export const instantiateTemplate = async ({ schoolId, templateId, userId, academicYear = null, payload = {} }) => {
    const template = await getAssignment({ schoolId, assignmentId: templateId });
    if (template.isTemplate !== true) throw badRequest('That task is not a template.');
    return createAssignment({
        schoolId,
        academicYear,
        userId,
        payload: {
            ...template,
            ...payload,
            classId: payload.classId || payload.class,
            sections: template.sections,
            rubric: template.rubric,
            supports: template.supports,
            workflow: template.workflow,
            goals: payload.goals || [],
            isTemplate: false
        }
    });
};

/* ------------------------------------------------------------------ */
/* Projects, autosave and submissions                                  */
/* ------------------------------------------------------------------ */

export const ensureProject = async ({ schoolId, assignment, studentId, classId }) => {
    const existing = await WritingProject.findOne({
        school: schoolId,
        assignment: assignment._id,
        student: studentId
    });
    if (existing) return existing;

    const seeded = buildWorkingSections(assignment);
    const created = await WritingProject.create({
        school: schoolId,
        assignment: assignment._id,
        student: studentId,
        class: classId || assignment.class,
        academicYear: assignment.academicYear,
        stage: 'not_started',
        autosave: { title: '', sections: seeded, updatedAt: null }
    });
    return created;
};

/**
 * The student's working copy. Autosave never produces a draft version, so a
 * teacher can always tell the saved-in-progress text apart from a submission.
 */
export const autosaveProject = async ({ schoolId, projectId, studentId, payload = {} }) => {
    const id = objectId(projectId);
    if (!id) throw notFound('Writing project not found.');
    const project = await WritingProject.findOne({ school: schoolId, _id: id, student: studentId });
    if (!project) throw notFound('Writing project not found.');

    if (project.stage === 'completed' || project.stage === 'awaiting_notebook_check') {
        throw badRequest('This writing task is closed for editing.');
    }

    const sections = (Array.isArray(payload.sections) ? payload.sections : [])
        .map((row, index) => ({
            key: String(row?.key || '').trim(),
            index: Number.isFinite(Number(row?.index)) ? Number(row.index) : index,
            text: String(row?.text || '').slice(0, 30000)
        }))
        .filter((row) => row.key);

    if (!sections.length) throw badRequest('There is nothing to save.');

    project.autosave = {
        title: String(payload.title || '').trim().slice(0, 200),
        sections,
        updatedAt: new Date()
    };
    project.wordCount = sectionTotalWords(sections);
    project.lastEditedAt = new Date();
    if (project.stage === 'not_started') project.stage = 'drafting';
    if (project.stage === 'feedback_published') project.stage = 'revising';
    await project.save();

    return {
        projectId: String(project._id),
        stage: project.stage,
        wordCount: project.wordCount,
        savedAt: project.autosave.updatedAt
    };
};

/**
 * Freeze the working copy as the next draft number. Rejected when the structure
 * or length does not meet the assignment, or when the teacher has locked a stage.
 */
export const submitDraft = async ({ schoolId, projectId, studentId, payload = {} }) => {
    const id = objectId(projectId);
    if (!id) throw notFound('Writing project not found.');

    const project = await WritingProject.findOne({ school: schoolId, _id: id, student: studentId });
    if (!project) throw notFound('Writing project not found.');

    const assignment = await WritingAssignment.findOne({ school: schoolId, _id: project.assignment }).lean();
    if (!assignment) throw notFound('Writing task not found.');

    const gate = canStudentSubmit({ project, assignment });
    if (!gate.allowed) throw badRequest(gate.reason);

    const incoming = Array.isArray(payload.sections) && payload.sections.length
        ? payload.sections
        : project.autosave?.sections || [];
    const working = incoming.map((row, index) => ({
        key: String(row?.key || '').trim(),
        index: Number.isFinite(Number(row?.index)) ? Number(row.index) : index,
        text: String(row?.text || '')
    }));

    const check = validateSubmission({ assignment, sections: working });
    if (!check.ok) {
        throw Object.assign(new Error(check.errors[0].message), {
            statusCode: 400,
            errors: check.errors
        });
    }

    if (!canMoveTo(project, 'submitted')) {
        throw badRequest('Your teacher has set this task to a fixed stage. Ask them to unlock it first.');
    }

    const number = (Number(project.draftCount) || 0) + 1;
    const draftSections = buildDraftSections({ assignment, sections: working });
    const draft = await WritingDraft.create({
        school: schoolId,
        project: project._id,
        assignment: assignment._id,
        student: studentId,
        number,
        title: String(payload.title || project.autosave?.title || '').trim().slice(0, 200),
        sections: draftSections,
        totalWords: sectionTotalWords(draftSections),
        submittedAt: new Date(),
        submissionSource: 'student',
        configSnapshot: configSnapshotFor(assignment)
    });

    project.draftCount = number;
    project.latestDraft = draft._id;
    project.stage = stageAfterSubmit();
    project.status = 'in_progress';
    // The next revision must start from exactly what was sent, including edits
    // made inside the submit sheet before the autosave timer fired.
    project.autosave = {
        title: draft.title,
        sections: draftSections.map(({ key, index, text }) => ({ key, index, text })),
        updatedAt: new Date()
    };
    project.wordCount = draft.totalWords;
    project.lastEditedAt = new Date();
    await project.save();

    return {
        draft: draft.toObject(),
        project: {
            id: String(project._id),
            stage: project.stage,
            draftCount: project.draftCount,
            wordCount: draft.totalWords
        }
    };
};

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

const rosterFor = async (assignment) => {
    const ids = (assignment.students || []).map((row) => String(row));
    if (!ids.length) return [];
    const found = await Student.find({ school: assignment.school, _id: { $in: ids } })
        .select('firstName lastName studentId currentClass')
        .lean();
    return found;
};

/**
 * Students open a task by assignment id. The project row is created on first
 * open so the workspace has somewhere to autosave.
 */
export const openProject = async ({ schoolId, studentId, assignmentId, academicYear = null }) => {
    const id = objectId(assignmentId);
    if (!id) throw notFound('Writing task not found.');
    const assignment = await WritingAssignment.findOne({
        school: schoolId,
        _id: id,
        isActive: true,
        isTemplate: false
    });
    if (!assignment) throw notFound('Writing task not found.');
    if (!(assignment.students || []).some((row) => sameId(row, studentId))) {
        throw forbidden('This writing task is not assigned to you.');
    }
    if (academicYear && assignment.academicYear && assignment.academicYear !== academicYear) {
        throw notFound('Writing task not found in this academic year.');
    }

    const student = await Student.findOne({ school: schoolId, _id: studentId })
        .select('currentClass')
        .lean();
    const project = await ensureProject({
        schoolId,
        assignment,
        studentId,
        classId: student?.currentClass
    });
    if (!project.firstOpenedAt) {
        project.firstOpenedAt = new Date();
        await project.save();
    }
    return getStudentProject({ schoolId, projectId: project._id, studentId });
};

/** Teacher board: every assigned student, whether or not they have opened the task. */
export const getTeacherBoard = async ({ schoolId, assignmentId, classId }) => {
    const assignment = await getAssignment({ schoolId, assignmentId });
    const filter = { school: schoolId, assignment: assignment._id };
    if (objectId(classId)) filter.class = classId;

    const [projects, roster] = await Promise.all([
        WritingProject.find(filter)
            .populate('latestDraft', 'number title totalWords submittedAt sections')
            .populate('latestAssessment', 'kind aiStatus publish recommendation totalScore')
            .sort({ updatedAt: -1 })
            .lean(),
        rosterFor(assignment)
    ]);

    const byStudent = new Map(projects.map((row) => [String(row.student), row]));
    const rowFor = ({ studentId, name, code, classId, project }) => {
        const stage = project?.stage || 'not_started';
        return {
            studentId,
            name,
            studentIdCode: code,
            classId,
            hasProject: Boolean(project),
            stage,
            stageLabel: STAGE_LABELS[stage] || stage,
            draftCount: project?.draftCount || 0,
            wordCount: project?.wordCount || 0,
            lastEditedAt: project?.lastEditedAt || project?.autosave?.updatedAt || null,
            submittedAt: project?.latestDraft?.submittedAt || null,
            latestDraftId: project?.latestDraft?._id ? String(project.latestDraft._id) : '',
            assessmentId: project?.latestAssessment?._id ? String(project.latestAssessment._id) : '',
            assessmentStatus: project?.latestAssessment?.aiStatus || '',
            published: project?.latestAssessment?.publish?.state === 'published',
            recommendation: project?.latestAssessment?.recommendation?.path || '',
            projectId: project?._id ? String(project._id) : '',
            notebook: project?.notebook?.state || 'not_requested'
        };
    };

    const rows = roster.map((student) => rowFor({
        studentId: String(student._id),
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        code: student.studentId || '',
        classId: student.currentClass ? String(student.currentClass) : '',
        project: byStudent.get(String(student._id))
    }));

    const missing = projects.filter((row) => !roster.some((student) => sameId(student._id, row.student)));
    for (const project of missing) {
        rows.push(rowFor({
            studentId: String(project.student),
            name: 'No longer on the class list',
            code: '',
            classId: project.class ? String(project.class) : '',
            project
        }));
    }

    return {
        assignment,
        summary: summarizeBoard(rows),
        rows
    };
};

export const getClassProgress = async ({ schoolId, assignmentId }) => {
    const board = await getTeacherBoard({ schoolId, assignmentId });
    const grouped = new Map();
    for (const row of board.rows) {
        const key = row.classId || 'unassigned';
        if (!grouped.has(key)) grouped.set(key, { classId: key, total: 0, submitted: 0, completed: 0, drafts: 0 });
        const bucket = grouped.get(key);
        bucket.total += 1;
        bucket.drafts += row.draftCount;
        if (row.draftCount > 0) bucket.submitted += 1;
        if (row.stage === 'completed') bucket.completed += 1;
    }
    const classIds = [...grouped.keys()].filter(objectId);
    const classes = classIds.length
        ? await Class.find({ school: schoolId, _id: { $in: classIds } }).select('name').lean()
        : [];
    const nameById = new Map(classes.map((row) => [String(row._id), row.name]));
    return {
        assignment: { id: String(board.assignment._id), title: board.assignment.title },
        classes: [...grouped.values()].map((row) => ({
            ...row,
            name: nameById.get(row.classId) || 'Not in a class'
        })),
        summary: board.summary
    };
};

const publishedForDraft = (assessments, draftId) => (assessments || []).find(
    (assessment) => sameId(assessment.draft, draftId)
) || null;

/**
 * Everything a student may see for one project. Only the published assessment of
 * the current draft is returned, and no unpublished AI output leaves the server.
 */
export const getStudentProject = async ({ schoolId, projectId, studentId }) => {
    const id = objectId(projectId);
    if (!id) throw notFound('Writing task not found.');

    const project = await WritingProject.findOne({ school: schoolId, _id: id, student: studentId })
        .populate('latestDraft')
        .lean();
    if (!project) throw notFound('Writing task not found.');

    const assignment = await WritingAssignment.findOne({ school: schoolId, _id: project.assignment }).lean();
    if (!assignment || assignment.isActive === false) throw notFound('Writing task not found.');

    const drafts = await WritingDraft.find({ school: schoolId, project: project._id })
        .select('number title sections totalWords submittedAt')
        .sort({ number: 1 })
        .lean();

    const assessments = await WritingAssessment.find({
        school: schoolId,
        project: project._id,
        'publish.state': 'published'
    })
        .select('draft previousDraft kind sections overall scores totalScore comparison recommendation publish publishedAt')
        .sort({ createdAt: -1 })
        .lean();

    const published = assessments;
    const latestPublished = publishedForDraft(published, project.latestDraft?._id) || published[0] || null;
    const goal = (assignment.goals || []).find((row) => sameId(row.student, studentId))?.text || '';
    const hasAutosave = Boolean(project.autosave?.sections?.length);
    const working = workingSectionsFor({
        autosave: project.autosave,
        draft: project.latestDraft,
        assignment
    });
    const workingTitle = hasAutosave ? project.autosave?.title || '' : project.latestDraft?.title || '';

    return {
        project: {
            id: String(project._id),
            stage: project.stage,
            status: project.status,
            draftCount: project.draftCount,
            wordCount: project.wordCount,
            notebook: project.notebook?.state || 'not_requested',
            autosave: {
                title: workingTitle,
                sections: working,
                savedAt: project.autosave?.updatedAt || null
            },
            firstOpenedAt: project.firstOpenedAt,
            canSubmit: canStudentSubmit({ project, assignment })
        },
        assignment: {
            id: String(assignment._id),
            title: assignment.title,
            instructions: assignment.instructions,
            writingType: assignment.writingType,
            topic: assignment.topic,
            dueDate: assignment.dueDate,
            minWords: assignment.minWords,
            maxWords: assignment.maxWords,
            expectedLevel: assignment.expectedLevel,
            goal,
            sections: assignment.sections,
            supports: assignment.supports,
            rubric: assignment.rubric,
            totalPoints: (assignment.rubric || []).reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0),
            workflow: assignment.workflow
        },
        drafts: drafts.map((draft) => ({
            id: String(draft._id),
            number: draft.number,
            title: draft.title,
            totalWords: draft.totalWords,
            submittedAt: draft.submittedAt,
            sections: draft.sections
        })),
        feedback: published.map((assessment) => ({
            id: String(assessment._id),
            draftId: String(assessment.draft),
            kind: assessment.kind,
            publishedAt: assessment.publish?.publishedAt,
            sections: assessment.sections,
            overall: assessment.overall,
            scores: assessment.scores,
            totalScore: assessment.totalScore,
            comparison: assessment.comparison,
            recommendation: assessment.recommendation
        })),
        tracker: buildTracker({
            assignment,
            project,
            hasComparison: assessments.some((row) => row.kind === 'comparison')
        }),
        nextAction: studentNextAction({ project, assignment, publishedAssessment: latestPublished })
    };
};

/** Student feed: one card per live writing task, with the single next action. */
export const getStudentFeed = async ({ schoolId, studentId, academicYear = null }) => {
    const query = { school: schoolId, students: studentId, isActive: true, isTemplate: false };
    if (academicYear) query.academicYear = academicYear;

    const assignments = await WritingAssignment.find(query).sort({ dueDate: 1, createdAt: -1 }).lean();
    if (!assignments.length) return { assignments: [], totals: { open: 0, awaitingTeacher: 0, ready: 0, completed: 0 } };

    const projects = await WritingProject.find({
        school: schoolId,
        student: studentId,
        assignment: { $in: assignments.map((row) => row._id) }
    }).lean();
    const projectByAssignment = new Map(projects.map((row) => [String(row.assignment), row]));

    // The tracker shows a compare step only once a comparison really exists.
    const compared = projects.length
        ? await WritingAssessment.find({
            school: schoolId,
            project: { $in: projects.map((row) => row._id) },
            kind: 'comparison',
            'publish.state': 'published'
        }).select('project').lean()
        : [];
    const hasComparisonByProject = new Set(compared.map((row) => String(row.project)));

    const cards = assignments.map((assignment) => {
        const project = projectByAssignment.get(String(assignment._id)) || {
            stage: 'not_started',
            draftCount: 0,
            wordCount: 0
        };
        const action = studentNextAction({
            project,
            assignment,
            publishedAssessment: null
        });
        return {
            id: String(assignment._id),
            projectId: project._id ? String(project._id) : '',
            tracker: buildTracker({
                assignment,
                project,
                hasComparison: project._id ? hasComparisonByProject.has(String(project._id)) : false
            }),
            title: assignment.title,
            writingType: assignment.writingType,
            topic: assignment.topic,
            dueDate: assignment.dueDate,
            stage: project.stage,
            status: project.status || 'in_progress',
            draftCount: project.draftCount || 0,
            wordCount: project.wordCount || 0,
            minWords: assignment.minWords,
            maxWords: assignment.maxWords,
            maxDrafts: assignment.workflow?.maxDrafts || 4,
            nextAction: action,
            notebook: project.notebook?.state || 'not_requested',
            lastEditedAt: project.lastEditedAt || null,
            sectionCount: (assignment.sections || []).length,
            totalPoints: (assignment.rubric || []).reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0)
        };
    });

    const totals = cards.reduce((acc, card) => {
        if (card.stage === 'completed') acc.completed += 1;
        else if (card.stage === 'submitted' || card.stage === 'feedback_ready') acc.awaitingTeacher += 1;
        else if (card.stage === 'ready_for_notebook' || card.stage === 'awaiting_notebook_check') acc.ready += 1;
        else acc.open += 1;
        return acc;
    }, { open: 0, awaitingTeacher: 0, ready: 0, completed: 0 });

    return { assignments: cards, totals };
};

/**
 * The student says the handwritten final copy is in the notebook. This is the
 * only way into the check stage; the teacher still decides when it is complete.
 */
export const markNotebookWritten = async ({ schoolId, projectId, studentId }) => {
    const id = objectId(projectId);
    if (!id) throw notFound('Writing project not found.');
    const project = await WritingProject.findOne({ school: schoolId, _id: id, student: studentId });
    if (!project) throw notFound('Writing project not found.');

    if (project.stage !== 'ready_for_notebook' && project.notebook?.state !== 'requested') {
        throw badRequest('Your teacher has not said this piece is ready for the notebook yet.');
    }
    project.set('notebook', {
        ...(project.notebook || {}),
        state: 'requested',
        requestedAt: new Date()
    });
    project.stage = 'awaiting_notebook_check';
    await project.save();
    return { projectId: String(project._id), stage: project.stage, notebook: 'requested' };
};

/** Teacher view of one student's whole history, including unpublished assessments. */
export const getProjectHistory = async ({ schoolId, projectId }) => {
    const id = objectId(projectId);
    if (!id) throw notFound('Writing project not found.');
    const project = await WritingProject.findOne({ school: schoolId, _id: id })
        .populate('student', 'firstName lastName studentId')
        .lean();
    if (!project) throw notFound('Writing project not found.');

    const [assignment, drafts, assessments] = await Promise.all([
        WritingAssignment.findOne({ school: schoolId, _id: project.assignment }).lean(),
        WritingDraft.find({ school: schoolId, project: project._id }).sort({ number: 1 }).lean(),
        WritingAssessment.find({ school: schoolId, project: project._id })
            .select('-aiOriginal')
            .sort({ createdAt: -1 })
            .lean()
    ]);

    return {
        project: {
            ...project,
            id: String(project._id),
            student: {
                id: String(project.student?._id || project.student),
                name: `${project.student?.firstName || ''} ${project.student?.lastName || ''}`.trim(),
                code: project.student?.studentId || ''
            }
        },
        assignment,
        drafts,
        assessments,
        tracker: buildTracker({
            assignment,
            project,
            hasComparison: assessments.some((row) => row.kind === 'comparison')
        })
    };
};
