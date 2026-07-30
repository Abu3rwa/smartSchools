import GrammarTest from '../models/GrammarTest.js';
import StandardAssignment from '../models/StandardAssignment.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import Standard from '../models/Standard.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    resolveTeacherProfile,
    isTeacherAuthorizedForClassSubject,
    getTeacherClassIds,
} from '../helpers/teacherScoping.js';
import {
    getClassIdsForAcademicYear,
    isClassInAcademicYear,
    resolveAcademicYearForRequest,
} from '../helpers/academicYearScope.js';
import {
    generateGrammarQuestionPool,
    generateGrammarQuestion,
    normalizeGrammarLevels,
    GRAMMAR_LEVELS,
} from '../services/grammarAssessmentService.js';
import notificationService from '../services/notificationService.js';
import logger from '../utils/logger.js';

// ── Constants ──────────────────────────────────────────────────────────────

const GRAMMAR_STANDARD_CATEGORY = 'grammar_assessment';
const DEFAULT_QUESTION_COUNT = 10;
const MAX_QUESTION_COUNT = 50;
const ALLOWED_QUESTION_TYPES = ['multiple_choice', 'true_false'];
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard'];

// ── Helpers ────────────────────────────────────────────────────────────────

const normalizeSemester = (value) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const s = Math.trunc(n);
    return [1, 2].includes(s) ? s : null;
};

const resolveSemesterFromDate = (d = new Date()) => {
    const date = d instanceof Date ? d : new Date(d);
    return date.getMonth() + 1 >= 8 ? 1 : 2;
};

const parsePositiveInt = (value, fallback = null) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const int = Math.trunc(n);
    return int >= 1 ? int : fallback;
};

const sanitizeQuestionTypes = (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return [...ALLOWED_QUESTION_TYPES];
    const filtered = raw.filter(t => ALLOWED_QUESTION_TYPES.includes(t));
    return filtered.length > 0 ? filtered : [...ALLOWED_QUESTION_TYPES];
};

const sanitizeDifficulties = (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return [...ALLOWED_DIFFICULTIES];
    const filtered = raw.filter(d => ALLOWED_DIFFICULTIES.includes(d));
    return filtered.length > 0 ? filtered : [...ALLOWED_DIFFICULTIES];
};

const sanitizeGrammarLevels = (raw) => {
    const normalized = normalizeGrammarLevels(raw, { fallbackAll: false });
    return normalized.length > 0 ? normalized : [...GRAMMAR_LEVELS];
};

const resolveOrCreateGrammarStandard = async ({ schoolId, subjectId, classDoc, subjectDoc, userId }) => {
    const parsedGrade = Math.trunc(Number(classDoc?.grade));
    const gradeLevel = Number.isFinite(parsedGrade) ? Math.min(12, Math.max(1, parsedGrade)) : 1;

    const existing = await Standard.findOne({
        school: schoolId,
        subject: subjectId,
        gradeLevel,
        category: GRAMMAR_STANDARD_CATEGORY,
    }).sort({ updatedAt: -1 });
    if (existing) return existing;

    const code = `GRAMMAR-G${gradeLevel}-${String(subjectId).slice(-6).toUpperCase()}`;
    try {
        return await Standard.create({
            school: schoolId,
            code,
            name: `Grammar Assessment (Grade ${gradeLevel})`,
            description: `Grammar assessment mapping for ${subjectDoc?.name || 'English'} grade ${gradeLevel}.`,
            subject: subjectId,
            gradeLevel,
            category: GRAMMAR_STANDARD_CATEGORY,
            masteryThreshold: 80,
            masteryMinQuestions: 5,
            isActive: false,
            createdBy: userId,
        });
    } catch (err) {
        if (err?.code === 11000) {
            const conflict = await Standard.findOne({ school: schoolId, code });
            if (conflict) return conflict;
        }
        throw err;
    }
};

const buildLinkedAssignment = async ({
    schoolId,
    teacherId,
    classDoc,
    subjectId,
    standard,
    grammarTest,
    title,
    academicYear,
    semester,
    practiceConfig,
    assessmentConfig,
    students,
    notifyParents,
    notifyStudents,
    questionCount,
}) => {
    const assignment = await StandardAssignment.create({
        school: schoolId,
        teacher: teacherId,
        class: classDoc._id,
        subject: subjectId,
        standard: standard._id,
        title,
        academicYear,
        semester,
        students: students || [],
        notifyParents,
        notifyStudents,
        practiceConfig: {
            sessionType: 'assessment',
            questionLimit: practiceConfig.questionLimit || null,
            timeLimitSeconds: practiceConfig.timeLimitSeconds || null,
            allowedQuestionTypes: practiceConfig.allowedQuestionTypes || ALLOWED_QUESTION_TYPES,
            allowedDifficulties: practiceConfig.allowedDifficulties || ALLOWED_DIFFICULTIES,
            enableGrammarLeveling: true,
            grammarLevels: grammarTest.grammarLevels || [...GRAMMAR_LEVELS],
            availability: practiceConfig.availability || { startAt: null, endAt: null },
            lockStudentOptions: practiceConfig.lockStudentOptions || false,
        },
        assessmentConfig: {
            maxMarks: assessmentConfig.maxMarks || 100,
            passMarks: assessmentConfig.passMarks || 50,
            resultsVisibility: assessmentConfig.resultsVisibility || 'immediate',
            resultsReleaseAt: assessmentConfig.resultsReleaseAt || null,
        },
        questionWorkflow: {
            requireApprovalBeforeStudentAccess: true,
            preGeneratedQuestionCount: questionCount,
            aiLanguages: ['en'],
            status: 'draft',
            currentPoolVersion: 1,
        },
        isActive: true,
    });
    return assignment;
};

const syncAssignmentAvailability = async (assignment, isEnabled, practiceConfig) => {
    if (!assignment) return;
    const update = {
        'practiceConfig.availability': practiceConfig?.availability || assignment.practiceConfig?.availability || {},
    };
    // If disabled, cut off access by setting endAt to now
    if (!isEnabled) {
        update['practiceConfig.availability.endAt'] = new Date();
    }
    await StandardAssignment.findByIdAndUpdate(assignment._id, { $set: update });
};

const populateGrammarTest = (query) =>
    query
        .populate('class', 'name grade section academicYear')
        .populate('subject', 'name code')
        .populate('teacher', 'employeeId')
        .populate({ path: 'teacher', populate: { path: 'user', select: 'firstName lastName' } })
        .populate('students', 'firstName lastName studentId');

// ── Controller Exports ─────────────────────────────────────────────────────

/**
 * GET /api/grammar-tests
 */
export const getGrammarTests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, classId, subjectId, semester, academicYear } = req.query;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);
    const effectiveSemester = normalizeSemester(semester);

    const schoolScopedClassIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear: effectiveAcademicYear,
        candidateClassIds: classId ? [classId] : null,
        departmentId: req.departmentId,
    });

    if (schoolScopedClassIds.length === 0) {
        return res.json({ success: true, data: { tests: [], pagination: { page: +page, limit: +limit, total: 0, pages: 0 } } });
    }

    const query = { isActive: true };

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        query.teacher = teacher._id;
        const teacherClassIds = await getTeacherClassIds(teacher._id);
        const teacherClassSet = new Set(teacherClassIds.map(id => id.toString()));
        const allowed = schoolScopedClassIds.filter(id => teacherClassSet.has(id));
        if (allowed.length === 0) {
            return res.json({ success: true, data: { tests: [], pagination: { page: +page, limit: +limit, total: 0, pages: 0 } } });
        }
        query.class = { $in: allowed };
    } else {
        query.class = { $in: schoolScopedClassIds };
    }

    if (subjectId) query.subject = subjectId;
    if (effectiveSemester) {
        query.$or = [
            { semester: effectiveSemester },
            { semester: { $exists: false } },
            { semester: null },
        ];
    }

    const [tests, total] = await Promise.all([
        populateGrammarTest(GrammarTest.find(query))
            .sort({ createdAt: -1 })
            .skip((+page - 1) * +limit)
            .limit(+limit),
        GrammarTest.countDocuments(query),
    ]);

    res.json({
        success: true,
        data: {
            tests,
            pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / +limit) },
            academicYear: effectiveAcademicYear,
            semester: effectiveSemester,
        },
    });
});

/**
 * GET /api/grammar-tests/:id
 */
export const getGrammarTest = asyncHandler(async (req, res) => {
    const test = await populateGrammarTest(GrammarTest.findById(req.params.id));
    if (!test || !test.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }
    res.json({ success: true, data: { test } });
});

/**
 * POST /api/grammar-tests
 */
export const createGrammarTest = asyncHandler(async (req, res) => {
    const {
        classId,
        subjectId,
        title,
        grammarLevels,
        practiceConfig = {},
        assessmentConfig = {},
        students = [],
        notifyParents = true,
        notifyStudents = true,
        semester,
        preGeneratedQuestionCount,
    } = req.body;

    if (!classId || !subjectId) {
        return res.status(400).json({ success: false, message: 'classId and subjectId are required' });
    }

    const effectiveAcademicYear = resolveAcademicYearForRequest(req);

    const classDoc = await Class.findById(classId);
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found' });
    if (!isClassInAcademicYear(classDoc, effectiveAcademicYear)) {
        return res.status(400).json({ success: false, message: `Selected class is not in academic year ${effectiveAcademicYear}` });
    }

    const classSubjectEntry = (classDoc.subjects || []).find(s => s.subject?.toString() === subjectId);
    if (!classSubjectEntry) {
        return res.status(400).json({ success: false, message: 'Subject is not configured for the selected class' });
    }

    const subjectDoc = await Subject.findById(subjectId).select('name code').lean();
    if (!subjectDoc) return res.status(404).json({ success: false, message: 'Subject not found' });

    let teacherId;
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        teacherId = teacher._id;
        const ok = await isTeacherAuthorizedForClassSubject(teacherId, classId, subjectId);
        if (!ok) return res.status(403).json({ success: false, message: 'Not authorized for this class/subject' });
    } else {
        teacherId = req.body.teacherId || classSubjectEntry.teacher || classDoc.classTeacher;
        if (!teacherId) {
            return res.status(400).json({ success: false, message: 'Unable to resolve teacher for this class/subject' });
        }
    }

    const studentIds = Array.isArray(students) ? Array.from(new Set(students.map(String))) : [];
    if (studentIds.length > 0) {
        const count = await Student.countDocuments({ _id: { $in: studentIds }, currentClass: classId, status: 'active', academicYear: classDoc.academicYear });
        if (count !== studentIds.length) {
            return res.status(400).json({ success: false, message: 'One or more selected students are not active members of the selected class' });
        }
    }

    const resolvedLevels = sanitizeGrammarLevels(grammarLevels);
    const resolvedTypes = sanitizeQuestionTypes(practiceConfig.allowedQuestionTypes);
    const resolvedDifficulties = sanitizeDifficulties(practiceConfig.allowedDifficulties);
    const resolvedQuestionCount = Math.min(
        parsePositiveInt(preGeneratedQuestionCount, DEFAULT_QUESTION_COUNT),
        MAX_QUESTION_COUNT
    );
    const resolvedSemester = normalizeSemester(semester) || resolveSemesterFromDate(new Date());
    const resolvedTitle = (String(title || '').trim()) || `Grammar Test – ${classDoc?.name || `Grade ${classDoc?.grade || ''}`}`.trim();

    const standard = await resolveOrCreateGrammarStandard({
        schoolId: req.schoolId,
        subjectId,
        classDoc,
        subjectDoc,
        userId: req.user?._id,
    });

    const resolvedPracticeConfig = {
        questionLimit: parsePositiveInt(practiceConfig.questionLimit, null),
        timeLimitSeconds: parsePositiveInt(practiceConfig.timeLimitSeconds, null),
        allowedQuestionTypes: resolvedTypes,
        allowedDifficulties: resolvedDifficulties,
        availability: {
            startAt: practiceConfig.availability?.startAt ? new Date(practiceConfig.availability.startAt) : null,
            endAt: practiceConfig.availability?.endAt ? new Date(practiceConfig.availability.endAt) : null,
        },
        lockStudentOptions: Boolean(practiceConfig.lockStudentOptions),
    };

    const resolvedAssessmentConfig = {
        maxMarks: parsePositiveInt(assessmentConfig.maxMarks, 100),
        passMarks: parsePositiveInt(assessmentConfig.passMarks, 50),
        resultsVisibility: ['immediate', 'manual_release'].includes(assessmentConfig.resultsVisibility)
            ? assessmentConfig.resultsVisibility : 'immediate',
        resultsReleaseAt: assessmentConfig.resultsReleaseAt ? new Date(assessmentConfig.resultsReleaseAt) : null,
    };

    // Generate question pool from the static grammar bank
    const generatedQuestions = generateGrammarQuestionPool({
        questionCount: resolvedQuestionCount,
        allowedQuestionTypes: resolvedTypes,
        allowedDifficulties: resolvedDifficulties,
        levels: resolvedLevels,
        seedPrefix: `grammartest|${classId}|${subjectId}`,
    });

    // Create the internal linked StandardAssignment (backbone for student practice flow)
    const tempGrammarTest = { grammarLevels: resolvedLevels };
    const linkedAssignment = await buildLinkedAssignment({
        schoolId: req.schoolId,
        teacherId,
        classDoc,
        subjectId,
        standard,
        grammarTest: tempGrammarTest,
        title: resolvedTitle,
        academicYear: classDoc.academicYear || effectiveAcademicYear,
        semester: resolvedSemester,
        practiceConfig: resolvedPracticeConfig,
        assessmentConfig: resolvedAssessmentConfig,
        students: studentIds,
        notifyParents,
        notifyStudents,
        questionCount: resolvedQuestionCount,
    });

    // Create StandardQuestionPool for the linked assignment (draft state)
    await StandardQuestionPool.create({
        school: req.schoolId,
        assignment: linkedAssignment._id,
        standard: standard._id,
        class: classDoc._id,
        subject: subjectId,
        questions: generatedQuestions,
        generatedQuestionCount: resolvedQuestionCount,
        currentVersion: 1,
        status: 'draft',
        isActive: true,
    });

    // Create the GrammarTest record
    const grammarTest = await GrammarTest.create({
        school: req.schoolId,
        teacher: teacherId,
        class: classId,
        subject: subjectId,
        title: resolvedTitle,
        academicYear: classDoc.academicYear || effectiveAcademicYear,
        semester: resolvedSemester,
        students: studentIds,
        grammarLevels: resolvedLevels,
        practiceConfig: resolvedPracticeConfig,
        assessmentConfig: resolvedAssessmentConfig,
        isEnabled: true,
        questions: generatedQuestions,
        questionWorkflow: {
            status: 'draft',
            preGeneratedQuestionCount: resolvedQuestionCount,
        },
        linkedAssignment: linkedAssignment._id,
        notifyParents,
        notifyStudents,
    });

    // Fire-and-forget notifications
    if (notifyParents || notifyStudents) {
        const targetStudentIds = studentIds.length > 0
            ? studentIds
            : (await Student.find({ currentClass: classId, status: 'active', academicYear: classDoc.academicYear }).select('_id').lean()).map(s => s._id);
        const notifPayload = {
            _id: grammarTest._id,
            title: resolvedTitle,
            assignmentTypeName: 'Grammar Test',
            assignmentTypeKey: 'grammar_test',
            dueDate: null,
            instructions: '',
        };
        for (const sid of targetStudentIds) {
            if (notifyParents) {
                notificationService.sendAssignmentPostedNotification({ studentId: sid, assignment: notifPayload, createdBy: req.user._id?.toString() })
                    .catch(err => logger.error('grammar_test_parent_notif_failed', { studentId: String(sid), error: err?.message }));
            }
            if (notifyStudents) {
                notificationService.sendStudentAssignmentPostedNotification({ studentId: sid, assignment: notifPayload, createdBy: req.user._id?.toString() })
                    .catch(err => logger.error('grammar_test_student_notif_failed', { studentId: String(sid), error: err?.message }));
            }
        }
    }

    const populated = await populateGrammarTest(GrammarTest.findById(grammarTest._id));
    res.status(201).json({
        success: true,
        message: 'Grammar test created successfully',
        data: { test: populated },
    });
});

/**
 * PUT /api/grammar-tests/:id
 */
export const updateGrammarTest = asyncHandler(async (req, res) => {
    const grammarTest = await GrammarTest.findById(req.params.id);
    if (!grammarTest || !grammarTest.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || grammarTest.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this grammar test' });
        }
    }

    const {
        title,
        grammarLevels,
        practiceConfig = {},
        assessmentConfig = {},
        students,
        notifyParents,
        notifyStudents,
        semester,
        isEnabled,
        preGeneratedQuestionCount,
    } = req.body;

    // Update scalar fields
    if (title !== undefined) grammarTest.title = String(title || '').trim() || grammarTest.title;
    if (grammarLevels !== undefined) grammarTest.grammarLevels = sanitizeGrammarLevels(grammarLevels);
    if (notifyParents !== undefined) grammarTest.notifyParents = Boolean(notifyParents);
    if (notifyStudents !== undefined) grammarTest.notifyStudents = Boolean(notifyStudents);
    if (semester !== undefined) grammarTest.semester = normalizeSemester(semester) ?? grammarTest.semester;
    if (isEnabled !== undefined) grammarTest.isEnabled = Boolean(isEnabled);

    // Update students
    if (Array.isArray(students)) {
        const studentIds = Array.from(new Set(students.map(String)));
        if (studentIds.length > 0) {
            const count = await Student.countDocuments({ _id: { $in: studentIds }, currentClass: grammarTest.class, status: 'active' });
            if (count !== studentIds.length) {
                return res.status(400).json({ success: false, message: 'One or more selected students are not active members of the class' });
            }
        }
        grammarTest.students = studentIds;
    }

    // Update practiceConfig fields
    if (practiceConfig.questionLimit !== undefined) grammarTest.practiceConfig.questionLimit = parsePositiveInt(practiceConfig.questionLimit, null);
    if (practiceConfig.timeLimitSeconds !== undefined) grammarTest.practiceConfig.timeLimitSeconds = parsePositiveInt(practiceConfig.timeLimitSeconds, null);
    if (practiceConfig.allowedQuestionTypes !== undefined) grammarTest.practiceConfig.allowedQuestionTypes = sanitizeQuestionTypes(practiceConfig.allowedQuestionTypes);
    if (practiceConfig.allowedDifficulties !== undefined) grammarTest.practiceConfig.allowedDifficulties = sanitizeDifficulties(practiceConfig.allowedDifficulties);
    if (practiceConfig.lockStudentOptions !== undefined) grammarTest.practiceConfig.lockStudentOptions = Boolean(practiceConfig.lockStudentOptions);
    if (practiceConfig.availability) {
        grammarTest.practiceConfig.availability = {
            startAt: practiceConfig.availability.startAt ? new Date(practiceConfig.availability.startAt) : null,
            endAt: practiceConfig.availability.endAt ? new Date(practiceConfig.availability.endAt) : null,
        };
    }

    // Update assessmentConfig fields
    if (assessmentConfig.maxMarks !== undefined) grammarTest.assessmentConfig.maxMarks = parsePositiveInt(assessmentConfig.maxMarks, 100);
    if (assessmentConfig.passMarks !== undefined) grammarTest.assessmentConfig.passMarks = parsePositiveInt(assessmentConfig.passMarks, 50);
    if (assessmentConfig.resultsVisibility !== undefined) {
        if (['immediate', 'manual_release'].includes(assessmentConfig.resultsVisibility)) {
            grammarTest.assessmentConfig.resultsVisibility = assessmentConfig.resultsVisibility;
        }
    }
    if (assessmentConfig.resultsReleaseAt !== undefined) {
        grammarTest.assessmentConfig.resultsReleaseAt = assessmentConfig.resultsReleaseAt ? new Date(assessmentConfig.resultsReleaseAt) : null;
    }

    if (preGeneratedQuestionCount !== undefined) {
        grammarTest.questionWorkflow.preGeneratedQuestionCount = Math.min(
            parsePositiveInt(preGeneratedQuestionCount, DEFAULT_QUESTION_COUNT),
            MAX_QUESTION_COUNT
        );
    }

    await grammarTest.save();

    // Sync changes to linked assignment
    if (grammarTest.linkedAssignment) {
        const assignmentUpdate = {
            title: grammarTest.title,
            students: grammarTest.students,
            semester: grammarTest.semester,
            notifyParents: grammarTest.notifyParents,
            notifyStudents: grammarTest.notifyStudents,
            'practiceConfig.questionLimit': grammarTest.practiceConfig.questionLimit,
            'practiceConfig.timeLimitSeconds': grammarTest.practiceConfig.timeLimitSeconds,
            'practiceConfig.allowedQuestionTypes': grammarTest.practiceConfig.allowedQuestionTypes,
            'practiceConfig.allowedDifficulties': grammarTest.practiceConfig.allowedDifficulties,
            'practiceConfig.lockStudentOptions': grammarTest.practiceConfig.lockStudentOptions,
            'practiceConfig.grammarLevels': grammarTest.grammarLevels,
            'assessmentConfig.maxMarks': grammarTest.assessmentConfig.maxMarks,
            'assessmentConfig.passMarks': grammarTest.assessmentConfig.passMarks,
            'assessmentConfig.resultsVisibility': grammarTest.assessmentConfig.resultsVisibility,
            'assessmentConfig.resultsReleaseAt': grammarTest.assessmentConfig.resultsReleaseAt,
        };

        // Handle availability + isEnabled: if disabled, cut off access
        if (!grammarTest.isEnabled) {
            assignmentUpdate['practiceConfig.availability'] = { startAt: null, endAt: new Date() };
        } else {
            assignmentUpdate['practiceConfig.availability'] = grammarTest.practiceConfig.availability;
        }

        await StandardAssignment.findByIdAndUpdate(grammarTest.linkedAssignment, { $set: assignmentUpdate });
    }

    const populated = await populateGrammarTest(GrammarTest.findById(grammarTest._id));
    res.json({ success: true, message: 'Grammar test updated successfully', data: { test: populated } });
});

/**
 * DELETE /api/grammar-tests/:id
 */
export const deleteGrammarTest = asyncHandler(async (req, res) => {
    const grammarTest = await GrammarTest.findById(req.params.id);
    if (!grammarTest || !grammarTest.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || grammarTest.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this grammar test' });
        }
    }

    grammarTest.isActive = false;
    await grammarTest.save();

    // Also deactivate the linked assignment
    if (grammarTest.linkedAssignment) {
        await StandardAssignment.findByIdAndUpdate(grammarTest.linkedAssignment, { $set: { isActive: false } });
    }

    res.json({ success: true, message: 'Grammar test deleted' });
});

/**
 * PATCH /api/grammar-tests/:id/toggle
 */
export const toggleGrammarTest = asyncHandler(async (req, res) => {
    const grammarTest = await GrammarTest.findById(req.params.id);
    if (!grammarTest || !grammarTest.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || grammarTest.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to toggle this grammar test' });
        }
    }

    grammarTest.isEnabled = !grammarTest.isEnabled;
    await grammarTest.save();

    // Sync availability to linked assignment
    if (grammarTest.linkedAssignment) {
        const availabilityUpdate = grammarTest.isEnabled
            ? grammarTest.practiceConfig.availability
            : { startAt: null, endAt: new Date() };
        await StandardAssignment.findByIdAndUpdate(grammarTest.linkedAssignment, {
            $set: { 'practiceConfig.availability': availabilityUpdate },
        });
    }

    res.json({
        success: true,
        message: grammarTest.isEnabled ? 'Grammar test enabled' : 'Grammar test disabled',
        data: { isEnabled: grammarTest.isEnabled },
    });
});

/**
 * GET /api/grammar-tests/:id/pool
 */
export const getGrammarTestPool = asyncHandler(async (req, res) => {
    const grammarTest = await GrammarTest.findById(req.params.id).select('questions questionWorkflow linkedAssignment isActive');
    if (!grammarTest || !grammarTest.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }

    res.json({
        success: true,
        data: {
            questions: grammarTest.questions || [],
            status: grammarTest.questionWorkflow?.status || 'draft',
            questionCount: (grammarTest.questions || []).length,
        },
    });
});

/**
 * PUT /api/grammar-tests/:id/pool
 */
export const updateGrammarTestPool = asyncHandler(async (req, res) => {
    const grammarTest = await GrammarTest.findById(req.params.id);
    if (!grammarTest || !grammarTest.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || grammarTest.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this grammar test pool' });
        }
    }

    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ success: false, message: 'questions array is required' });
    }

    grammarTest.questions = questions;
    await grammarTest.save();

    // Sync to StandardQuestionPool for the linked assignment
    if (grammarTest.linkedAssignment) {
        await StandardQuestionPool.findOneAndUpdate(
            { school: req.schoolId, assignment: grammarTest.linkedAssignment, isActive: true },
            { $set: { questions, generatedQuestionCount: questions.length } },
            { upsert: true, setDefaultsOnInsert: true }
        );
    }

    res.json({ success: true, message: 'Question pool updated', data: { questionCount: questions.length } });
});

/**
 * POST /api/grammar-tests/:id/pool/regenerate
 */
export const regenerateGrammarTestQuestion = asyncHandler(async (req, res) => {
    const grammarTest = await GrammarTest.findById(req.params.id);
    if (!grammarTest || !grammarTest.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || grammarTest.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
    }

    const { questionIndex, questionType, difficulty } = req.body;
    const idx = parsePositiveInt(questionIndex, null);
    if (idx === null || idx >= (grammarTest.questions || []).length) {
        return res.status(400).json({ success: false, message: 'Valid questionIndex is required' });
    }

    const resolvedType = ALLOWED_QUESTION_TYPES.includes(questionType) ? questionType : 'multiple_choice';
    const resolvedDiff = ALLOWED_DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';

    const newQuestion = generateGrammarQuestion({
        levels: grammarTest.grammarLevels || [...GRAMMAR_LEVELS],
        questionType: resolvedType,
        difficulty: resolvedDiff,
        index: idx,
        seed: Date.now() + idx,
    });

    grammarTest.questions[idx] = newQuestion;
    grammarTest.markModified('questions');
    await grammarTest.save();

    // Sync to StandardQuestionPool
    if (grammarTest.linkedAssignment) {
        await StandardQuestionPool.findOneAndUpdate(
            { school: req.schoolId, assignment: grammarTest.linkedAssignment, isActive: true },
            { $set: { questions: grammarTest.questions } }
        );
    }

    res.json({ success: true, message: 'Question regenerated', data: { question: newQuestion, questionIndex: idx } });
});

/**
 * POST /api/grammar-tests/:id/publish
 */
export const publishGrammarTest = asyncHandler(async (req, res) => {
    const grammarTest = await GrammarTest.findById(req.params.id);
    if (!grammarTest || !grammarTest.isActive) {
        return res.status(404).json({ success: false, message: 'Grammar test not found' });
    }

    if (!grammarTest.questions || grammarTest.questions.length === 0) {
        return res.status(400).json({ success: false, message: 'Cannot publish a grammar test with no questions' });
    }

    // Publish the StandardQuestionPool for the linked assignment
    if (grammarTest.linkedAssignment) {
        await StandardQuestionPool.findOneAndUpdate(
            { school: req.schoolId, assignment: grammarTest.linkedAssignment, isActive: true },
            {
                $set: {
                    questions: grammarTest.questions,
                    status: 'published',
                    publishedAt: new Date(),
                    publishedBy: req.user._id,
                },
            },
            { upsert: true, setDefaultsOnInsert: true }
        );

        await StandardAssignment.findByIdAndUpdate(grammarTest.linkedAssignment, {
            $set: {
                'questionWorkflow.status': 'published',
                'questionWorkflow.publishedAt': new Date(),
                'questionWorkflow.publishedBy': req.user._id,
            },
        });
    }

    grammarTest.questionWorkflow.status = 'published';
    grammarTest.questionWorkflow.publishedAt = new Date();
    grammarTest.questionWorkflow.publishedBy = req.user._id;
    await grammarTest.save();

    res.json({ success: true, message: 'Grammar test published. Students can now access it.', data: { status: 'published' } });
});
