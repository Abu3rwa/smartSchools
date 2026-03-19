import StandardAssignment from '../models/StandardAssignment.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import Standard from '../models/Standard.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, isTeacherAuthorizedForClassSubject, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { practiceConfigSchema, assessmentConfigSchema } from '../schemas/practiceSchemas.js';
import { hasPermission, PERMISSIONS } from '../config/permissions.js';
import {
    getClassIdsForAcademicYear,
    isClassInAcademicYear,
    resolveAcademicYearForRequest
} from '../helpers/academicYearScope.js';
import { resolveRequestedLanguages } from '../utils/aiLanguageUtils.js';
import {
    buildDefaultAssignmentTitle,
    createStandardAssignmentWithPool,
    resolvePreGeneratedQuestionCount,
    DEFAULT_PREGENERATED_QUESTION_COUNT
} from '../services/standardAssignmentService.js';

const normalizeTitle = (value = '') => String(value || '').trim();

const resolveSemesterFromDate = (dateValue = new Date()) => {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const month = date.getMonth() + 1;
    return month >= 8 ? 1 : 2;
};

const normalizeSemester = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const semester = Math.trunc(parsed);
    return [1, 2].includes(semester) ? semester : null;
};

const canApproveQuestionPool = (user) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'department_principal') return true;
    return hasPermission(user, PERMISSIONS.REVIEW_STANDARDS_QUESTIONS);
};

const ensureTeacherOwnsAssignment = async (req, assignment) => {
    if (req.user.role !== 'teacher') return true;
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return false;
    return assignment.teacher?.toString() === teacher._id.toString();
};

const getAssignmentScopedMasteryMinQuestions = (assignment) => {
    const questionLimit = Number(assignment?.practiceConfig?.questionLimit);
    if (Number.isFinite(questionLimit) && questionLimit > 0) {
        return Math.max(1, Math.trunc(questionLimit));
    }

    const standardMinQuestions = Number(assignment?.standard?.masteryMinQuestions);
    if (Number.isFinite(standardMinQuestions) && standardMinQuestions > 0) {
        return Math.max(1, Math.trunc(standardMinQuestions));
    }

    return 5;
};


/**
 * @desc    Get assignments (teacher sees own, admin sees all)
 * @route   GET /api/standard-assignments
 * @access  Private (Admin, Teacher)
 */
export const getAssignments = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, classId, subjectId, standardId, academicYear, semester } = req.query;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);
    const effectiveSemester = normalizeSemester(semester);

    const query = { isActive: true };
    const schoolScopedClassIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear: effectiveAcademicYear,
        candidateClassIds: classId ? [classId] : null
    });

    if (schoolScopedClassIds.length === 0) {
        return res.json({
            success: true,
            data: {
                assignments: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                }
            }
        });
    }

    // Teacher scoping: see own assignments + admin-assigned ones for their classes
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const teacherClassIds = await getTeacherClassIds(teacher._id);
        const teacherClassIdSet = new Set(teacherClassIds.map((id) => id.toString()));
        const allowedClassIds = schoolScopedClassIds.filter((id) => teacherClassIdSet.has(id));

        if (allowedClassIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    assignments: [],
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: 0,
                        pages: 0
                    }
                }
            });
        }

        query.class = { $in: allowedClassIds };
    } else {
        query.class = { $in: schoolScopedClassIds };
    }

    if (subjectId) query.subject = subjectId;
    if (standardId) query.standard = standardId;
    if (effectiveSemester) {
        query.$or = [
            { semester: effectiveSemester },
            { semester: { $exists: false } },
            { semester: null }
        ];
    }

    const assignments = await StandardAssignment.find(query)
        .populate('standard', 'code name description gradeLevel category')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('teacher', 'employeeId')
        .populate({
            path: 'teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .populate('students', 'firstName lastName studentId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await StandardAssignment.countDocuments(query);

    res.json({
        success: true,
        data: {
            assignments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            academicYear: effectiveAcademicYear,
            semester: effectiveSemester
        }
    });
});

/**
 * @desc    Get single assignment with student progress
 * @route   GET /api/standard-assignments/:id
 * @access  Private
 */
export const getAssignment = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const assignment = await StandardAssignment.findById(req.params.id)
        .populate('standard')
        .populate('class', 'name grade section academicYear')
        .populate('subject', 'name code')
        .populate('teacher', 'employeeId')
        .populate({
            path: 'teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .populate('students', 'firstName lastName studentId');

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: 'Assignment not found'
        });
    }
    if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
        return res.status(404).json({
            success: false,
            message: `Assignment not found for academic year ${effectiveAcademicYear}`
        });
    }

    // Get students who are part of this assignment
    let studentList;
    if (assignment.students.length > 0) {
        studentList = assignment.students;
    } else {
        // All students in the class
        studentList = await Student.find({
            currentClass: assignment.class._id,
            status: 'active',
            academicYear: effectiveAcademicYear
        }).select('firstName lastName studentId');
    }

    // Get progress for each student
    const studentsWithProgress = await Promise.all(
        studentList.map(async (student) => {
            const mastery = await PracticeAttempt.calculateMastery(
                student._id,
                assignment.standard._id,
                assignment.standard.masteryThreshold,
                getAssignmentScopedMasteryMinQuestions(assignment),
                3,
                req.schoolId,
                [assignment._id]
            );
            return {
                student: student.toObject ? student.toObject() : student,
                mastery
            };
        })
    );

    res.json({
        success: true,
        data: {
            assignment,
            studentsWithProgress
        }
    });
});

/**
 * @desc    Create assignment (teacher assigns standard to class/students)
 * @route   POST /api/standard-assignments
 * @access  Private (Admin, Teacher)
 */
export const createAssignment = asyncHandler(async (req, res) => {
    const {
        standardId,
        classId,
        subjectId,
        students,
        dueDate,
        instructions,
        practiceConfig,
        assessmentConfig,
        preGeneratedQuestionCount,
        aiLanguages
    } = req.body;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const requestedSemester = normalizeSemester(req.body?.semester);

    if (!standardId || !classId || !subjectId) {
        return res.status(400).json({
            success: false,
            message: 'standardId, classId, and subjectId are required'
        });
    }

    // Verify standard exists
    const standard = await Standard.findById(standardId);
    if (!standard) {
        return res.status(404).json({ success: false, message: 'Standard not found' });
    }

    // Verify class exists
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
        return res.status(404).json({ success: false, message: 'Class not found' });
    }
    if (!isClassInAcademicYear(classDoc, effectiveAcademicYear)) {
        return res.status(400).json({
            success: false,
            message: `Selected class is not in academic year ${effectiveAcademicYear}`
        });
    }

    // Ensure the assignment is truly connected to the selected class:
    // - subject must match the standard's subject
    // - grade level must match the class grade
    if (standard.subject?.toString() !== subjectId) {
        return res.status(400).json({
            success: false,
            message: 'Selected subject does not match the standard subject'
        });
    }
    if (standard.gradeLevel !== classDoc.grade) {
        return res.status(400).json({
            success: false,
            message: `Standard grade level (Grade ${standard.gradeLevel}) does not match the class grade (Grade ${classDoc.grade})`
        });
    }

    // Ensure subject exists in this class
    const classSubjectEntry = (classDoc.subjects || []).find(s => s.subject?.toString() === subjectId);
    if (!classSubjectEntry) {
        return res.status(400).json({
            success: false,
            message: 'This subject is not configured for the selected class'
        });
    }
    const subjectDoc = await Subject.findById(subjectId).select('name').lean();
    if (!subjectDoc) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
    }
    const generationLanguages = resolveRequestedLanguages({
        requestedLanguages: aiLanguages,
        subjectName: subjectDoc?.name || '',
        max: 2
    });

    // Resolve teacher
    let teacherId;
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        teacherId = teacher._id;

        // Teacher must be authorized to assign for this class+subject
        const ok = await isTeacherAuthorizedForClassSubject(teacherId, classId, subjectId);
        if (!ok) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class/subject' });
        }
    } else {
        // Admin: allow explicit teacherId OR auto-resolve to the subject teacher for this class
        teacherId = req.body.teacherId || classSubjectEntry.teacher || classDoc.classTeacher;
        if (!teacherId) {
            return res.status(400).json({
                success: false,
                message: 'Unable to resolve teacher for this class/subject. Please assign a subject teacher to the class (or provide teacherId).'
            });
        }
    }

    // If specific students are provided, ensure they belong to this class
    const studentIds = Array.isArray(students) ? Array.from(new Set(students.map(String))) : [];
    if (studentIds.length > 0) {
        const count = await Student.countDocuments({
            _id: { $in: studentIds },
            currentClass: classId,
            status: 'active',
            academicYear: classDoc.academicYear
        });
        if (count !== studentIds.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more selected students are not active members of the selected class'
            });
        }
    }

    let parsedConfig = undefined;
    if (practiceConfig !== undefined) {
        const parsed = practiceConfigSchema.safeParse(practiceConfig);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid practiceConfig',
                errors: parsed.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
            });
        }
        parsedConfig = parsed.data;
    }

    let parsedAssessmentConfig = undefined;
    if (assessmentConfig !== undefined) {
        const parsed = assessmentConfigSchema.safeParse(assessmentConfig);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid assessmentConfig',
                errors: parsed.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
            });
        }
        parsedAssessmentConfig = parsed.data;
    }

    const resolvedSessionType =
        parsedConfig?.sessionType || practiceConfig?.sessionType || 'practice';
    const requiresReviewedPoolBeforeAccess = resolvedSessionType === 'assessment';

    const resolvedTitle = normalizeTitle(req.body?.title)
        || buildDefaultAssignmentTitle({
            standard,
            classDoc,
            sessionType: resolvedSessionType
        });
    const assignmentSemester = requestedSemester
        || resolveSemesterFromDate(dueDate || new Date());

    const { assignment, pool, generationError } = await createStandardAssignmentWithPool({
        schoolId: req.schoolId,
        actorUserId: req.user._id,
        standard,
        classDoc,
        subjectId,
        subjectName: subjectDoc?.name || 'General Studies',
        teacherId,
        classId,
        students: students || [],
        dueDate: dueDate || null,
        instructions: instructions || '',
        title: resolvedTitle,
        academicYear: classDoc.academicYear || effectiveAcademicYear,
        semester: assignmentSemester,
        practiceConfig: parsedConfig,
        assessmentConfig: parsedAssessmentConfig,
        preGeneratedQuestionCount: resolvePreGeneratedQuestionCount(
            preGeneratedQuestionCount,
            parsedConfig?.questionLimit || practiceConfig?.questionLimit
        ),
        aiLanguages: generationLanguages,
        questionWorkflow: {
            requireApprovalBeforeStudentAccess: requiresReviewedPoolBeforeAccess,
            status: 'draft',
            currentPoolVersion: 1,
        },
    });

    const populated = await StandardAssignment.findById(assignment._id)
        .populate('standard', 'code name description gradeLevel')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('students', 'firstName lastName studentId');

    res.status(201).json({
        success: true,
        message: generationError
            ? 'Standard assigned, but question pool generation needs manual review'
            : 'Standard assigned successfully',
        data: {
            assignment: populated,
            questionPool: {
                status: 'draft',
                generatedQuestionCount: pool.generatedQuestionCount || DEFAULT_PREGENERATED_QUESTION_COUNT,
                generationLanguages,
                generatedQuestions: Array.isArray(pool.questions) ? pool.questions.length : 0,
                generationError
            }
        }
    });
});

/**
 * @desc    Update assignment
 * @route   PUT /api/standard-assignments/:id
 * @access  Private (Admin, Teacher)
 */
export const updateAssignment = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    let assignment = await StandardAssignment.findById(req.params.id);

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    const assignmentClass = await Class.findById(assignment.class).select('academicYear');
    if (!isClassInAcademicYear(assignmentClass, effectiveAcademicYear)) {
        return res.status(404).json({
            success: false,
            message: `Assignment not found for academic year ${effectiveAcademicYear}`
        });
    }

    const requestedStandardId = req.body.standardId;
    const requestedClassId = req.body.classId;
    const requestedSubjectId = req.body.subjectId;
    const nextStandardId = requestedStandardId || assignment.standard?.toString();
    const nextClassId = requestedClassId || assignment.class?.toString();
    const nextSubjectId = requestedSubjectId || assignment.subject?.toString();
    const isCoreMappingChanged =
        Boolean(requestedStandardId) ||
        Boolean(requestedClassId) ||
        Boolean(requestedSubjectId);

    if (isCoreMappingChanged) {
        const attemptsCount = await PracticeAttempt.countDocuments({
            school: req.schoolId,
            assignment: assignment._id,
            status: 'answered'
        });
        if (attemptsCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change class, subject, or standard after students have started. Create a new assignment instead.'
            });
        }
    }

    const standard = await Standard.findById(nextStandardId);
    if (!standard) {
        return res.status(404).json({ success: false, message: 'Standard not found' });
    }
    const classDoc = await Class.findById(nextClassId);
    if (!classDoc) {
        return res.status(404).json({ success: false, message: 'Class not found' });
    }
    if (!isClassInAcademicYear(classDoc, effectiveAcademicYear)) {
        return res.status(400).json({
            success: false,
            message: `Selected class is not in academic year ${effectiveAcademicYear}`
        });
    }
    if (standard.subject?.toString() !== nextSubjectId) {
        return res.status(400).json({
            success: false,
            message: 'Selected subject does not match the standard subject'
        });
    }
    if (standard.gradeLevel !== classDoc.grade) {
        return res.status(400).json({
            success: false,
            message: `Standard grade level (Grade ${standard.gradeLevel}) does not match the class grade (Grade ${classDoc.grade})`
        });
    }

    const classSubjectEntry = (classDoc.subjects || []).find((entry) => entry.subject?.toString() === nextSubjectId);
    if (!classSubjectEntry) {
        return res.status(400).json({
            success: false,
            message: 'This subject is not configured for the selected class'
        });
    }
    const subjectDoc = await Subject.findById(nextSubjectId).select('name').lean();
    if (!subjectDoc) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    let nextTeacherId = assignment.teacher?.toString();
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || assignment.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, nextClassId, nextSubjectId);
        if (!authorized) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class/subject' });
        }
        nextTeacherId = teacher._id.toString();
    } else {
        const resolvedAdminTeacher =
            req.body.teacherId ||
            classSubjectEntry.teacher ||
            classDoc.classTeacher ||
            assignment.teacher;
        if (!resolvedAdminTeacher) {
            return res.status(400).json({
                success: false,
                message: 'Unable to resolve teacher for this class/subject. Please assign a subject teacher to the class (or provide teacherId).'
            });
        }
        nextTeacherId = resolvedAdminTeacher.toString();
    }

    const requestedStudents = req.body.students;
    const nextStudentIdsRaw = requestedStudents !== undefined
        ? (Array.isArray(requestedStudents) ? requestedStudents : [])
        : (Array.isArray(assignment.students) ? assignment.students : []);
    const nextStudentIds = Array.from(new Set(nextStudentIdsRaw.map((id) => id.toString())));
    if (nextStudentIds.length > 0) {
        const count = await Student.countDocuments({
            _id: { $in: nextStudentIds },
            currentClass: nextClassId,
            status: 'active',
            academicYear: classDoc.academicYear
        });
        if (count !== nextStudentIds.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more selected students are not active members of the selected class'
            });
        }
    }

    const resolvedTitle = normalizeTitle(req.body.title) || assignment.title;

    const allowedFields = [
        'title',
        'students',
        'dueDate',
        'instructions',
        'isActive',
        'practiceConfig',
        'assessmentConfig',
        'semester',
        'preGeneratedQuestionCount'
    ];
    const updates = {};
    updates.standard = nextStandardId;
    updates.class = nextClassId;
    updates.subject = nextSubjectId;
    updates.teacher = nextTeacherId;
    updates.academicYear = classDoc.academicYear || effectiveAcademicYear;
    for (const field of allowedFields) {
        if (req.body[field] === undefined) continue;
        if (field === 'practiceConfig') {
            const parsed = practiceConfigSchema.safeParse(req.body.practiceConfig);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid practiceConfig',
                    errors: parsed.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
                });
            }
            const currentConfig = assignment.practiceConfig
                ? assignment.practiceConfig.toObject()
                : {};
            const nextAvailability = {
                ...(currentConfig.availability || {}),
                ...(parsed.data.availability || {})
            };
            updates.practiceConfig = {
                ...currentConfig,
                ...parsed.data,
                availability: nextAvailability
            };
        } else if (field === 'assessmentConfig') {
            const parsed = assessmentConfigSchema.safeParse(req.body.assessmentConfig);
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid assessmentConfig',
                    errors: parsed.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
                });
            }
            const currentConfig = assignment.assessmentConfig
                ? assignment.assessmentConfig.toObject()
                : {};
            const nextReleaseAt = parsed.data.resultsReleaseAt !== undefined
                ? parsed.data.resultsReleaseAt
                : currentConfig.resultsReleaseAt;
            updates.assessmentConfig = {
                ...currentConfig,
                ...parsed.data,
                resultsReleaseAt: nextReleaseAt ?? null
            };
        } else if (field === 'title') {
            updates.title = resolvedTitle;
        } else if (field === 'semester') {
            const normalized = normalizeSemester(req.body.semester);
            if (!normalized) {
                return res.status(400).json({
                    success: false,
                    message: 'semester must be 1 or 2'
                });
            }
            updates.semester = normalized;
        } else if (field === 'students') {
            updates.students = nextStudentIds;
        } else if (field === 'preGeneratedQuestionCount') {
            updates.questionWorkflow = {
                ...(assignment.questionWorkflow?.toObject?.() || assignment.questionWorkflow || {}),
                preGeneratedQuestionCount: resolvePreGeneratedQuestionCount(req.body.preGeneratedQuestionCount),
                status: 'draft',
                reviewedBy: null,
                reviewedAt: null,
                approvedBy: null,
                approvedAt: null,
                publishedBy: null,
                publishedAt: null
            };
        } else {
            updates[field] = req.body[field];
        }
    }

    if (req.body.aiLanguages !== undefined) {
        const resolvedAiLanguages = resolveRequestedLanguages({
            requestedLanguages: req.body.aiLanguages,
            subjectName: subjectDoc?.name || '',
            max: 2
        });
        updates.questionWorkflow = {
            ...(assignment.questionWorkflow?.toObject?.() || assignment.questionWorkflow || {}),
            ...(updates.questionWorkflow || {}),
            aiLanguages: resolvedAiLanguages
        };
    }

    const effectiveSessionType =
        updates.practiceConfig?.sessionType
        || assignment.practiceConfig?.sessionType
        || 'practice';
    const requiresReviewedPoolBeforeAccess = effectiveSessionType === 'assessment';
    updates.questionWorkflow = {
        ...(assignment.questionWorkflow?.toObject?.() || assignment.questionWorkflow || {}),
        ...(updates.questionWorkflow || {}),
        requireApprovalBeforeStudentAccess: requiresReviewedPoolBeforeAccess
    };

    assignment = await StandardAssignment.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    })
        .populate('standard', 'code name description gradeLevel')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('students', 'firstName lastName studentId');

    res.json({
        success: true,
        message: 'Assignment updated successfully',
        data: { assignment }
    });
});

/**
 * @desc    Get assignment question pool
 * @route   GET /api/standard-assignments/:id/question-pool
 * @access  Private (Admin, Teacher)
 */
export const getAssignmentQuestionPool = asyncHandler(async (req, res) => {
    const assignment = await StandardAssignment.findById(req.params.id)
        .populate('standard', 'code name')
        .populate('class', 'name grade section')
        .populate('subject', 'name code');

    if (!assignment || !assignment.isActive) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const teacherOwnsAssignment = await ensureTeacherOwnsAssignment(req, assignment);
    if (!teacherOwnsAssignment) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!assignment.questionWorkflow?.requireApprovalBeforeStudentAccess) {
        return res.status(400).json({
            success: false,
            message: 'Question pool workflow is not enabled for this assignment'
        });
    }

    const pool = await StandardQuestionPool.findOne({
        school: req.schoolId,
        assignment: assignment._id,
        isActive: true,
    }).lean();

    res.json({
        success: true,
        data: {
            assignment,
            questionWorkflow: assignment.questionWorkflow || null,
            questionPool: pool || null,
        },
    });
});

/**
 * @desc    Edit assignment question pool (teacher/admin)
 * @route   PUT /api/standard-assignments/:id/question-pool
 * @access  Private (Admin, Teacher)
 */
export const updateAssignmentQuestionPool = asyncHandler(async (req, res) => {
    const { questions, changeSummary = '' } = req.body || {};
    if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'questions must be a non-empty array',
        });
    }

    const assignment = await StandardAssignment.findById(req.params.id);
    if (!assignment || !assignment.isActive) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const teacherOwnsAssignment = await ensureTeacherOwnsAssignment(req, assignment);
    if (!teacherOwnsAssignment) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!assignment.questionWorkflow?.requireApprovalBeforeStudentAccess) {
        return res.status(400).json({
            success: false,
            message: 'Question pool workflow is not enabled for this assignment'
        });
    }

    let pool = await StandardQuestionPool.findOne({
        school: req.schoolId,
        assignment: assignment._id,
        isActive: true,
    });

    if (!pool) {
        pool = await StandardQuestionPool.create({
            school: req.schoolId,
            assignment: assignment._id,
            standard: assignment.standard,
            class: assignment.class,
            subject: assignment.subject,
            generatedQuestionCount: questions.length,
            currentVersion: 1,
            status: 'draft',
            questions,
            editHistory: [
                {
                    version: 1,
                    editedBy: req.user._id,
                    editedAt: new Date(),
                    changeSummary: changeSummary || 'Initial pool created manually',
                },
            ],
        });
    } else {
        const nextVersion = Number(pool.currentVersion || 1) + 1;
        pool.questions = questions;
        pool.generatedQuestionCount = questions.length;
        pool.currentVersion = nextVersion;
        pool.status = 'draft';
        pool.reviewedBy = null;
        pool.reviewedAt = null;
        pool.approvedBy = null;
        pool.approvedAt = null;
        pool.publishedBy = null;
        pool.publishedAt = null;
        pool.editHistory.push({
            version: nextVersion,
            editedBy: req.user._id,
            editedAt: new Date(),
            changeSummary: changeSummary || 'Question pool edited',
        });
        await pool.save();
    }

    assignment.questionWorkflow = {
        ...(assignment.questionWorkflow?.toObject?.() || assignment.questionWorkflow || {}),
        preGeneratedQuestionCount: questions.length,
        status: 'draft',
        currentPoolVersion: pool.currentVersion,
        reviewedBy: null,
        reviewedAt: null,
        approvedBy: null,
        approvedAt: null,
        publishedBy: null,
        publishedAt: null,
    };
    await assignment.save();

    res.json({
        success: true,
        message: 'Question pool updated successfully',
        data: {
            questionPool: pool,
            questionWorkflow: assignment.questionWorkflow,
        },
    });
});

/**
 * @desc    Mark question pool as teacher reviewed
 * @route   POST /api/standard-assignments/:id/question-pool/review
 * @access  Private (Teacher owner, Admin)
 */
export const reviewAssignmentQuestionPool = asyncHandler(async (req, res) => {
    const assignment = await StandardAssignment.findById(req.params.id);
    if (!assignment || !assignment.isActive) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const teacherOwnsAssignment = await ensureTeacherOwnsAssignment(req, assignment);
    if (req.user.role === 'teacher' && !teacherOwnsAssignment) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!assignment.questionWorkflow?.requireApprovalBeforeStudentAccess) {
        return res.status(400).json({
            success: false,
            message: 'Question pool review is not enabled for this assignment'
        });
    }

    const pool = await StandardQuestionPool.findOne({
        school: req.schoolId,
        assignment: assignment._id,
        isActive: true,
    });

    if (!pool || !Array.isArray(pool.questions) || pool.questions.length === 0) {
        return res.status(400).json({ success: false, message: 'Question pool is empty' });
    }

    const now = new Date();
    pool.status = 'reviewed';
    pool.reviewedBy = req.user._id;
    pool.reviewedAt = now;
    await pool.save();

    assignment.questionWorkflow = {
        ...(assignment.questionWorkflow?.toObject?.() || assignment.questionWorkflow || {}),
        status: 'reviewed',
        reviewedBy: req.user._id,
        reviewedAt: now,
        currentPoolVersion: pool.currentVersion,
    };
    await assignment.save();

    res.json({
        success: true,
        message: 'Question pool submitted for approval',
        data: {
            questionPool: pool,
            questionWorkflow: assignment.questionWorkflow,
        },
    });
});

/**
 * @desc    Approve question pool
 * @route   POST /api/standard-assignments/:id/question-pool/approve
 * @access  Private (Admin/Department Principal/Permissioned Reviewer)
 */
export const approveAssignmentQuestionPool = asyncHandler(async (req, res) => {
    if (!canApproveQuestionPool(req.user)) {
        return res.status(403).json({ success: false, message: 'Not authorized to approve question pool' });
    }

    const assignment = await StandardAssignment.findById(req.params.id);
    if (!assignment || !assignment.isActive) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    if (!assignment.questionWorkflow?.requireApprovalBeforeStudentAccess) {
        return res.status(400).json({
            success: false,
            message: 'Question pool approval is not enabled for this assignment'
        });
    }

    const pool = await StandardQuestionPool.findOne({
        school: req.schoolId,
        assignment: assignment._id,
        isActive: true,
    });
    if (!pool || pool.status !== 'reviewed') {
        return res.status(400).json({ success: false, message: 'Question pool must be reviewed before approval' });
    }

    const now = new Date();
    pool.status = 'approved';
    pool.approvedBy = req.user._id;
    pool.approvedAt = now;
    await pool.save();

    assignment.questionWorkflow = {
        ...(assignment.questionWorkflow?.toObject?.() || assignment.questionWorkflow || {}),
        status: 'approved',
        approvedBy: req.user._id,
        approvedAt: now,
        currentPoolVersion: pool.currentVersion,
    };
    await assignment.save();

    res.json({
        success: true,
        message: 'Question pool approved successfully',
        data: {
            questionPool: pool,
            questionWorkflow: assignment.questionWorkflow,
        },
    });
});

/**
 * @desc    Publish approved question pool
 * @route   POST /api/standard-assignments/:id/question-pool/publish
 * @access  Private (Admin/Department Principal/Permissioned Reviewer)
 */
export const publishAssignmentQuestionPool = asyncHandler(async (req, res) => {
    if (!canApproveQuestionPool(req.user)) {
        return res.status(403).json({ success: false, message: 'Not authorized to publish question pool' });
    }

    const assignment = await StandardAssignment.findById(req.params.id);
    if (!assignment || !assignment.isActive) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    if (!assignment.questionWorkflow?.requireApprovalBeforeStudentAccess) {
        return res.status(400).json({
            success: false,
            message: 'Question pool publishing is not enabled for this assignment'
        });
    }

    const pool = await StandardQuestionPool.findOne({
        school: req.schoolId,
        assignment: assignment._id,
        isActive: true,
    });
    if (!pool || (pool.status !== 'approved' && pool.status !== 'published')) {
        return res.status(400).json({ success: false, message: 'Question pool must be approved before publish' });
    }

    const now = new Date();
    pool.status = 'published';
    pool.publishedBy = req.user._id;
    pool.publishedAt = now;
    await pool.save();

    assignment.questionWorkflow = {
        ...(assignment.questionWorkflow?.toObject?.() || assignment.questionWorkflow || {}),
        status: 'published',
        publishedBy: req.user._id,
        publishedAt: now,
        currentPoolVersion: pool.currentVersion,
        requireApprovalBeforeStudentAccess: true,
    };
    await assignment.save();

    res.json({
        success: true,
        message: 'Question pool published successfully',
        data: {
            questionPool: pool,
            questionWorkflow: assignment.questionWorkflow,
        },
    });
});

/**
 * @desc    Delete assignment (soft delete)
 * @route   DELETE /api/standard-assignments/:id
 * @access  Private (Admin, Teacher)
 */
export const deleteAssignment = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const assignment = await StandardAssignment.findById(req.params.id);

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    const assignmentClass = await Class.findById(assignment.class).select('academicYear');
    if (!isClassInAcademicYear(assignmentClass, effectiveAcademicYear)) {
        return res.status(404).json({
            success: false,
            message: `Assignment not found for academic year ${effectiveAcademicYear}`
        });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || assignment.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
    }

    assignment.isActive = false;
    await assignment.save();

    res.json({
        success: true,
        message: 'Assignment removed successfully'
    });
});
