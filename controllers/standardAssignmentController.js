import StandardAssignment from '../models/StandardAssignment.js';
import Standard from '../models/Standard.js';
import Student from '../models/Student.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, isTeacherAuthorizedForClassSubject, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { practiceConfigSchema, assessmentConfigSchema } from '../schemas/practiceSchemas.js';
import {
    getClassIdsForAcademicYear,
    isClassInAcademicYear,
    resolveAcademicYearForRequest
} from '../helpers/academicYearScope.js';

const normalizeTitle = (value = '') => String(value || '').trim();
const normalizeComparableTitle = (value = '') => normalizeTitle(value).toLowerCase();

const buildDefaultAssignmentTitle = ({ standard, classDoc, sessionType }) => {
    const standardCode = standard?.code ? `${standard.code} ` : '';
    const standardName = standard?.name || 'Standard';
    const classLabel = classDoc?.name || `Grade ${classDoc?.grade || ''}`;
    const typeLabel = sessionType ? ` (${sessionType})` : '';
    return `${standardCode}${standardName} - ${classLabel}${typeLabel}`.trim();
};

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
                assignment.standard.masteryMinQuestions,
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
    const { standardId, classId, subjectId, students, dueDate, instructions, practiceConfig, assessmentConfig } = req.body;
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

    const resolvedTitle = normalizeTitle(req.body?.title)
        || buildDefaultAssignmentTitle({
            standard,
            classDoc,
            sessionType: parsedConfig?.sessionType || practiceConfig?.sessionType || 'practice'
        });
    const assignmentSemester = requestedSemester
        || resolveSemesterFromDate(dueDate || new Date());

    // Check for duplicate assignment title within same class/subject/standard/teacher
    const existing = await StandardAssignment.find({
        school: req.schoolId,
        standard: standardId,
        class: classId,
        subject: subjectId,
        teacher: teacherId,
        isActive: true
    }).select('title');
    const hasDuplicateTitle = existing.some((item) =>
        normalizeComparableTitle(item.title) === normalizeComparableTitle(resolvedTitle)
    );
    if (hasDuplicateTitle) {
        return res.status(400).json({
            success: false,
            message: 'An active assignment with this name already exists for this class and standard'
        });
    }

    const assignment = await StandardAssignment.create({
        school: req.schoolId,
        standard: standardId,
        teacher: teacherId,
        class: classId,
        subject: subjectId,
        title: resolvedTitle,
        academicYear: classDoc.academicYear || effectiveAcademicYear,
        semester: assignmentSemester,
        students: students || [],
        dueDate: dueDate || null,
        instructions: instructions || '',
        practiceConfig: parsedConfig,
        assessmentConfig: parsedAssessmentConfig
    });

    const populated = await StandardAssignment.findById(assignment._id)
        .populate('standard', 'code name description gradeLevel')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('students', 'firstName lastName studentId');

    res.status(201).json({
        success: true,
        message: 'Standard assigned successfully',
        data: { assignment: populated }
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
    const duplicateCandidates = await StandardAssignment.find({
        school: req.schoolId,
        standard: nextStandardId,
        class: nextClassId,
        subject: nextSubjectId,
        teacher: nextTeacherId,
        isActive: true,
        _id: { $ne: assignment._id }
    }).select('title');
    const hasDuplicateTitle = duplicateCandidates.some((item) =>
        normalizeComparableTitle(item.title) === normalizeComparableTitle(resolvedTitle)
    );
    if (hasDuplicateTitle) {
        return res.status(400).json({
            success: false,
            message: 'An active assignment with this name already exists for this class and standard'
        });
    }

    const allowedFields = ['title', 'students', 'dueDate', 'instructions', 'isActive', 'practiceConfig', 'assessmentConfig', 'semester'];
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
        } else {
            updates[field] = req.body[field];
        }
    }

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
