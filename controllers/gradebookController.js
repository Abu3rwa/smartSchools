import mongoose from 'mongoose';
import Grade from '../models/Grade.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import GradebookColumn from '../models/GradebookColumn.js';
import HomeworkAssignment from '../models/HomeworkAssignment.js';
import HomeworkSubmission from '../models/HomeworkSubmission.js';
import gradeService from '../services/gradeService.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    resolveTeacherProfile,
    isTeacherAuthorizedForClassSubject,
    getTeacherClassIds,
    getTeacherAssignments
} from '../helpers/teacherScoping.js';
import { validateGradeLessonPlanLinks } from '../helpers/gradeLessonPlanLinks.js';
import { generateAssessmentGroupId } from '../helpers/assessmentGrouping.js';
import { resolveRequestedAcademicYear, resolveAcademicYearDateRange } from '../utils/academicYear.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import { decorateGradesWithScale, getActiveGradingScale } from '../services/gradingScaleEngine.js';
import { syncObjectivesForGrade } from '../jobs/academicExcellenceSyncJob.js';

const getTeacherGradeScope = async (req, classId = null) => {
    if (req.user.role !== 'teacher') {
        return {
            isTeacher: false,
            teacherProfile: null,
            classIds: [],
            classIdSet: new Set(),
            classSubjectMap: new Map()
        };
    }

    const teacherProfile = await resolveTeacherProfile(req);
    if (!teacherProfile) {
        return {
            isTeacher: true,
            teacherProfile: null,
            classIds: [],
            classIdSet: new Set(),
            classSubjectMap: new Map()
        };
    }

    const [classIds, assignments] = await Promise.all([
        getTeacherClassIds(teacherProfile._id),
        getTeacherAssignments(teacherProfile._id)
    ]);

    const classIdSet = new Set(classIds.map((id) => String(id)));
    const classSubjectMap = new Map();
    assignments.forEach((item) => {
        const classKey = String(item?.classId || '');
        const subjectKey = String(item?.subjectId || '');
        if (!classKey || !subjectKey) return;
        if (!classSubjectMap.has(classKey)) classSubjectMap.set(classKey, new Set());
        classSubjectMap.get(classKey).add(subjectKey);
    });

    if (classId && !classIdSet.has(String(classId))) {
        return {
            isTeacher: true,
            teacherProfile,
            classIds,
            classIdSet,
            classSubjectMap,
            denied: true
        };
    }

    return {
        isTeacher: true,
        teacherProfile,
        classIds,
        classIdSet,
        classSubjectMap,
        denied: false
    };
};

/**
 * @desc    Add daily classwork grade
 * @route   POST /api/grades/daily
 * @access  Private (Teacher)
 */
export const addDailyGrade = asyncHandler(async (req, res) => {
    const {
        student,
        subject,
        classId: classIdFromBody,
        class: classFromBody,
        marks,
        maxMarks,
        date,
        title,
        description,
        remarks,
        sendNotification,
        lessonPlanIds,
        assessmentGroupId
    } = req.body;
    const resolvedClassId = classIdFromBody || classFromBody;
    let teacherProfile = null;

    // Access Control: Verify teacher is assigned to this class+subject
    if (req.user.role === 'teacher') {
        teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const authorized = await isTeacherAuthorizedForClassSubject(teacherProfile._id, resolvedClassId, subject);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to add grades for this subject in this class'
            });
        }
    }

    const academicYear = resolveRequestedAcademicYear(req.body?.academicYear, req.school);
    const normalizedLessonPlanIds = await validateGradeLessonPlanLinks({
        lessonPlanIds,
        schoolId: req.schoolId,
        classId: resolvedClassId,
        subjectId: subject,
        user: req.user
    });

    // Get subject details
    const subjectData = await Subject.findById(subject);

    const gradeData = {
        school: req.schoolId,
        student,
        subject,
        class: resolvedClassId,
        teacher: req.user._id,
        academicYear,
        gradeType: 'daily',
        date: date || new Date(),
        marks,
        maxMarks: maxMarks || subjectData?.dailyMaxMarks || 10,
        title,
        description,
        remarks,
        assessmentGroupId: assessmentGroupId || generateAssessmentGroupId('asg'),
        lessonPlanIds: normalizedLessonPlanIds ?? []
    };

    const grade = await gradeService.addDailyGrade(gradeData);

    // Send notification if requested
    if (sendNotification) {
        await notificationService.sendGradeUpdateNotification(
            student,
            {
                ...gradeData,
                subjectName: subjectData?.name
            },
            req.user._id
        );
    }

    // Fire-and-forget AE sync
    syncObjectivesForGrade({
        schoolId: req.schoolId,
        studentId: student,
        subjectId: subject,
        classId: resolvedClassId,
        academicYear
    }).catch(() => {});

    res.status(201).json({
        success: true,
        message: 'Grade added successfully',
        data: { grade }
    });
});

/**
 * @desc    Bulk add daily grades for a class
 * @route   POST /api/grades/bulk
 * @access  Private (Teacher)
 */
export const bulkAddGrades = asyncHandler(async (req, res) => {
    const {
        classId,
        subject,
        date,
        maxMarks,
        grades,
        sendNotifications,
        gradeType,
        title,
        category,
        lessonPlanIds
    } = req.body;
    // grades: [{ student: id, marks, remarks, notes }]
    let teacherProfile = null;

    if (req.user.role === 'teacher') {
        teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const authorized = await isTeacherAuthorizedForClassSubject(teacherProfile._id, classId, subject);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to add grades for this subject in this class'
            });
        }
    }

    const subjectData = await Subject.findById(subject);
    const academicYear = resolveRequestedAcademicYear(req.body?.academicYear, req.school);
    const normalizedLessonPlanIds = await validateGradeLessonPlanLinks({
        lessonPlanIds,
        schoolId: req.schoolId,
        classId,
        subjectId: subject,
        user: req.user
    });

    // Determine the grade type - derive from category when not explicit
    const CATEGORY_TO_GRADE_TYPE = { test: 'monthly_test', exam: 'semester_exam', midterm: 'midterm_exam', final: 'final_exam' };
    const normalizedCategory = (category || '').trim().toLowerCase();
    const effectiveGradeType = gradeType || CATEGORY_TO_GRADE_TYPE[normalizedCategory] || normalizedCategory || 'classwork';
    const resolvedAssessmentGroupId = req.body.assessmentGroupId || generateAssessmentGroupId('asg');

    // Calculate month and semester from date (Use UTC to avoid timezone shifts)
    const gradeDate = date ? new Date(date) : new Date();
    const month = gradeDate.getUTCMonth() + 1;
    const semester = (month >= 8 && month <= 12) ? 1 : 2;

    const gradeDocuments = grades.map(g => ({
        school: req.schoolId,
        student: g.student,
        subject,
        class: classId,
        teacher: req.user._id,
        academicYear,
        gradeType: effectiveGradeType,
        category: (category || effectiveGradeType).toLowerCase(),
        date: gradeDate,
        month,
        semester,
        marks: g.marks,
        maxMarks: maxMarks || subjectData?.dailyMaxMarks || 10,
        title: title || '',
        notes: g.notes || '',
        remarks: g.remarks || '',
        assessmentGroupId: resolvedAssessmentGroupId,
        lessonPlanIds: normalizedLessonPlanIds ?? []
    }));

    const savedGrades = await Grade.insertMany(gradeDocuments);

    // Send notifications if requested
    if (sendNotifications) {
        for (const grade of savedGrades) {
            await notificationService.sendGradeUpdateNotification(
                grade.student,
                { ...grade.toObject(), subjectName: subjectData?.name },
                req.user._id
            ).catch(err => console.error('Notification error:', err));
        }
    }

    // Fire-and-forget AE sync for each student in bulk
    const seenStudents = new Set();
    for (const grade of savedGrades) {
        const sid = grade.student?.toString();
        if (sid && !seenStudents.has(sid)) {
            seenStudents.add(sid);
            syncObjectivesForGrade({
                schoolId: req.schoolId,
                studentId: grade.student,
                subjectId: subject,
                classId,
                academicYear
            }).catch(() => {});
        }
    }

    res.status(201).json({
        success: true,
        message: `${savedGrades.length} grades added successfully`,
        data: { count: savedGrades.length }
    });
});

/**
 * @desc    Bulk update existing grades (edit mode)
 * @route   PUT /api/grades/bulk
 * @access  Private (Teacher, Admin)
 */
export const bulkUpdateGrades = asyncHandler(async (req, res) => {
    const { grades: gradeUpdates, metadata = {} } = req.body;
    // gradeUpdates: [{ _id, marks, maxMarks, remarks }]

    if (!Array.isArray(gradeUpdates) || gradeUpdates.length === 0) {
        return res.status(400).json({ success: false, message: 'grades array is required and must not be empty' });
    }

    const gradeIds = gradeUpdates.map((g) => g._id).filter(Boolean);
    if (gradeIds.length === 0) {
        return res.status(400).json({ success: false, message: 'Each grade must have an _id' });
    }

    // Fetch all existing grades to verify ownership and school
    const existingGrades = await Grade.find({
        _id: { $in: gradeIds },
        school: req.schoolId
    }).lean();

    if (existingGrades.length !== gradeIds.length) {
        return res.status(404).json({ success: false, message: 'One or more grades not found' });
    }

    const hasClassUpdate = Boolean(metadata.classId);
    const hasSubjectUpdate = Boolean(metadata.subject);
    const hasCategoryUpdate = metadata.category !== undefined;
    const hasDateUpdate = Boolean(metadata.date);
    const hasMetadataMaxMarksUpdate = metadata.maxMarks !== undefined;

    let resolvedDate = null;
    let resolvedMonth = null;
    let resolvedSemester = null;

    if (hasDateUpdate) {
        resolvedDate = new Date(metadata.date);
        if (Number.isNaN(resolvedDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid metadata.date value' });
        }
        resolvedMonth = resolvedDate.getMonth() + 1;
        resolvedSemester = (resolvedMonth >= 8 && resolvedMonth <= 12) ? 1 : 2;
    }

    if (hasClassUpdate) {
        const targetClass = await Class.findOne({ _id: metadata.classId, school: req.schoolId }).select('_id').lean();
        if (!targetClass) {
            return res.status(400).json({ success: false, message: 'Invalid class selected for update' });
        }
    }

    if (hasSubjectUpdate) {
        const targetSubject = await Subject.findOne({ _id: metadata.subject, school: req.schoolId }).select('_id').lean();
        if (!targetSubject) {
            return res.status(400).json({ success: false, message: 'Invalid subject selected for update' });
        }
    }

    // Teacher access control: can only edit own grades
    if (req.user.role === 'teacher') {
        const teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        for (const grade of existingGrades) {
            const gradeTeacherId = grade.teacher?.toString();
            if (gradeTeacherId !== teacherProfile._id.toString() && gradeTeacherId !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: 'You can only modify grades you created' });
            }
        }

        if (hasClassUpdate || hasSubjectUpdate) {
            const accessChecks = [];
            for (const grade of existingGrades) {
                accessChecks.push({
                    classId: hasClassUpdate ? metadata.classId : grade.class,
                    subjectId: hasSubjectUpdate ? metadata.subject : grade.subject
                });
            }

            const uniqChecks = new Map();
            accessChecks.forEach((item) => {
                const key = `${String(item.classId)}_${String(item.subjectId)}`;
                if (!uniqChecks.has(key)) {
                    uniqChecks.set(key, item);
                }
            });

            for (const check of uniqChecks.values()) {
                const authorized = await isTeacherAuthorizedForClassSubject(teacherProfile._id, check.classId, check.subjectId);
                if (!authorized) {
                    return res.status(403).json({
                        success: false,
                        message: 'You are not authorized to assign this subject in the selected class'
                    });
                }
            }
        }
    }

    // Build bulk write operations
    const updateMap = new Map(gradeUpdates.map((g) => [g._id, g]));
    const operations = [];
    for (const existing of existingGrades) {
        const update = updateMap.get(existing._id.toString());
        if (!update) continue;
        const setFields = {};
        if (update.marks !== undefined && update.marks !== null && update.marks !== '') {
            setFields.marks = Number(update.marks);
        }
        if (update.maxMarks !== undefined) setFields.maxMarks = Number(update.maxMarks);
        if (update.remarks !== undefined) setFields.remarks = update.remarks;
        if (hasMetadataMaxMarksUpdate) setFields.maxMarks = Number(metadata.maxMarks);
        if (hasClassUpdate) setFields.class = metadata.classId;
        if (hasSubjectUpdate) setFields.subject = metadata.subject;
        if (hasCategoryUpdate) setFields.category = String(metadata.category || 'other').toLowerCase();
        if (hasDateUpdate) {
            setFields.date = resolvedDate;
            setFields.month = resolvedMonth;
            setFields.semester = resolvedSemester;
        }
        if (Object.keys(setFields).length > 0) {
            operations.push({
                updateOne: {
                    filter: { _id: existing._id, school: req.schoolId },
                    update: { $set: setFields }
                }
            });
        }
    }

    if (operations.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid updates to apply' });
    }

    const result = await Grade.bulkWrite(operations);

    res.json({
        success: true,
        message: `${result.modifiedCount} grades updated successfully`,
        data: { modifiedCount: result.modifiedCount }
    });
});

/**
 * @desc    Get grades by assessment group ID (for edit mode)
 * @route   GET /api/grades/by-group/:assessmentGroupId
 * @access  Private (Teacher, Admin)
 */
export const getGradesByAssessmentGroup = asyncHandler(async (req, res) => {
    const { assessmentGroupId } = req.params;

    if (!assessmentGroupId) {
        return res.status(400).json({ success: false, message: 'Assessment group ID is required' });
    }

    const query = {
        assessmentGroupId,
        school: req.schoolId
    };

    // Teacher access control
    if (req.user.role === 'teacher') {
        const teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        query.$or = [
            { teacher: teacherProfile._id },
            { teacher: req.user._id }
        ];
    }

    const grades = await Grade.find(query)
        .populate('student', 'firstName lastName studentId')
        .sort({ 'student.firstName': 1 });

    if (grades.length === 0) {
        return res.status(404).json({ success: false, message: 'No grades found for this assessment group' });
    }

    // Extract metadata from first grade
    const first = grades[0];

    res.json({
        success: true,
        data: {
            grades,
            metadata: {
                classId: first.class,
                subject: first.subject,
                category: first.category,
                gradeType: first.gradeType,
                date: first.date,
                maxMarks: first.maxMarks,
                assessmentGroupId: first.assessmentGroupId,
                title: first.title
            }
        }
    });
});

/**
 * @desc    Bulk grade homework assignment submissions
 * @route   POST /api/grades/homework/bulk
 * @access  Private (Teacher, Admin)
 */
export const bulkGradeHomework = asyncHandler(async (req, res) => {
    const { homeworkAssignmentId, rows, sendNotifications, assessmentGroupId } = req.body || {};

    if (!homeworkAssignmentId || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'homeworkAssignmentId and non-empty rows are required'
        });
    }

    const assignment = await HomeworkAssignment.findOne({
        _id: homeworkAssignmentId,
        school: req.schoolId
    }).lean();
    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: 'Homework assignment not found'
        });
    }

    if (!['published', 'closed'].includes(String(assignment.status || ''))) {
        return res.status(400).json({
            success: false,
            message: 'Homework must be published or closed before grading'
        });
    }

    let teacherProfile = null;
    if (req.user.role === 'teacher') {
        teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) {
            return res.status(403).json({
                success: false,
                message: 'Teacher profile not found'
            });
        }
        const authorized = await isTeacherAuthorizedForClassSubject(
            teacherProfile._id,
            assignment.class,
            assignment.subject
        );
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to grade this homework assignment'
            });
        }
    }

    const studentQuery = {
        school: req.schoolId,
        currentClass: assignment.class,
        academicYear: assignment.academicYear,
        status: 'active'
    };
    if (
        assignment.scope === 'selected_students' &&
        Array.isArray(assignment.studentIds) &&
        assignment.studentIds.length > 0
    ) {
        studentQuery._id = { $in: assignment.studentIds };
    }

    const eligibleStudents = await Student.find(studentQuery)
        .select('_id')
        .lean();
    const eligibleStudentIds = new Set(
        eligibleStudents.map((row) => String(row._id))
    );
    if (eligibleStudentIds.size === 0) {
        return res.status(400).json({
            success: false,
            message: 'No eligible students found for this homework assignment'
        });
    }

    const normalizedRowsMap = new Map();
    const assignmentMaxMarks = Number(assignment.maxMarks || 10);

    for (let index = 0; index < rows.length; index += 1) {
        const raw = rows[index] || {};
        const studentId = String(raw.studentId || raw.student || '').trim();
        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: `rows[${index}].studentId is required`
            });
        }

        if (!eligibleStudentIds.has(studentId)) {
            return res.status(400).json({
                success: false,
                message: `Student ${studentId} is not assigned to this homework`
            });
        }

        const marks = Number(raw.marks);
        if (!Number.isFinite(marks) || marks < 0) {
            return res.status(400).json({
                success: false,
                message: `rows[${index}].marks must be a non-negative number`
            });
        }

        const maxMarks = raw.maxMarks !== undefined
            ? Number(raw.maxMarks)
            : assignmentMaxMarks;
        if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
            return res.status(400).json({
                success: false,
                message: `rows[${index}].maxMarks must be a positive number`
            });
        }

        if (marks > maxMarks) {
            return res.status(400).json({
                success: false,
                message: `rows[${index}].marks cannot be greater than maxMarks`
            });
        }

        normalizedRowsMap.set(studentId, {
            studentId,
            marks,
            maxMarks,
            remarks: String(raw.remarks || '').trim(),
            notes: String(raw.notes || '').trim()
        });
    }

    const normalizedRows = [...normalizedRowsMap.values()];
    const shouldNotifyParents = sendNotifications === true
        || String(sendNotifications || '').trim().toLowerCase() === 'true';
    const gradingDate = new Date();
    const gradingTeacherId = teacherProfile?._id || assignment.teacher || req.user._id;
    const resolvedAssessmentGroupId = assessmentGroupId || generateAssessmentGroupId('asg');
    const homeworkLessonPlanIds = await validateGradeLessonPlanLinks({
        lessonPlanIds: assignment.lessonPlan ? [assignment.lessonPlan] : [],
        schoolId: req.schoolId,
        classId: assignment.class,
        subjectId: assignment.subject,
        user: req.user
    });

    const graded = [];

    for (const row of normalizedRows) {
        const submission = await HomeworkSubmission.findOneAndUpdate(
            {
                school: req.schoolId,
                homeworkAssignment: assignment._id,
                student: row.studentId
            },
            {
                $setOnInsert: {
                    school: req.schoolId,
                    homeworkAssignment: assignment._id,
                    student: row.studentId,
                    status: 'not_submitted'
                }
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        const grade = await Grade.findOneAndUpdate(
            {
                school: req.schoolId,
                student: row.studentId,
                subject: assignment.subject,
                class: assignment.class,
                academicYear: assignment.academicYear,
                gradeType: 'homework',
                homeworkAssignment: assignment._id
            },
            {
                $set: {
                    marks: row.marks,
                    maxMarks: row.maxMarks,
                    date: gradingDate,
                    title: assignment.title || 'Homework',
                    category: 'homework',
                    notes: row.notes,
                    remarks: row.remarks,
                    assessmentGroupId: resolvedAssessmentGroupId,
                    homeworkSubmission: submission._id,
                    gradingSource: 'homework_submission',
                    lessonPlanIds: homeworkLessonPlanIds ?? []
                },
                $setOnInsert: {
                    school: req.schoolId,
                    student: row.studentId,
                    subject: assignment.subject,
                    class: assignment.class,
                    teacher: gradingTeacherId,
                    academicYear: assignment.academicYear,
                    gradeType: 'homework',
                    homeworkAssignment: assignment._id
                }
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true
            }
        );

        const updatedSubmission = await HomeworkSubmission.findOneAndUpdate(
            {
                school: req.schoolId,
                homeworkAssignment: assignment._id,
                student: row.studentId
            },
            {
                $set: {
                    grade: grade._id,
                    status: 'graded',
                    gradedAt: gradingDate
                }
            },
            {
                new: true
            }
        ).lean();

        if (shouldNotifyParents) {
            await notificationService.sendHomeworkGradedNotification({
                studentId: row.studentId,
                assignment,
                grade,
                submission: updatedSubmission,
                createdBy: req.user._id
            }).catch((error) => {
                console.error('Homework grade notification error:', error);
            });
        }

        graded.push({
            studentId: row.studentId,
            gradeId: grade._id,
            submissionId: updatedSubmission?._id || null,
            marks: grade.marks,
            maxMarks: grade.maxMarks
        });

        syncObjectivesForGrade({
            schoolId: req.schoolId,
            studentId: row.studentId,
            subjectId: assignment.subject,
            classId: assignment.class,
            academicYear: assignment.academicYear
        }).catch(() => {});
    }

    res.status(200).json({
        success: true,
        message: `${graded.length} homework grades saved successfully`,
        data: {
            homeworkAssignmentId: assignment._id,
            gradedCount: graded.length,
            grades: graded
        }
    });
});

/**
 * @desc    Add test/exam grade
 * @route   POST /api/grades/exam
 * @access  Private (Teacher)
 */
export const addExamGrade = asyncHandler(async (req, res) => {
    const {
        student,
        subject,
        classId,
        marks,
        maxMarks,
        gradeType,
        examName,
        date,
        remarks,
        lessonPlanIds,
        assessmentGroupId
    } = req.body;
    let teacherProfile = null;

    if (req.user.role === 'teacher') {
        teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const authorized = await isTeacherAuthorizedForClassSubject(teacherProfile._id, classId, subject);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to add grades for this subject in this class'
            });
        }
    }

    const academicYear = resolveRequestedAcademicYear(req.body?.academicYear, req.school);
    const normalizedLessonPlanIds = await validateGradeLessonPlanLinks({
        lessonPlanIds,
        schoolId: req.schoolId,
        classId,
        subjectId: subject,
        user: req.user
    });

    const grade = await Grade.create({
        school: req.schoolId,
        student,
        subject,
        class: classId,
        teacher: req.user._id,
        academicYear,
        gradeType: gradeType || 'monthly_test',
        date: date || new Date(),
        marks,
        maxMarks: maxMarks || 100,
        examName,
        remarks,
        assessmentGroupId: assessmentGroupId || generateAssessmentGroupId('asg'),
        lessonPlanIds: normalizedLessonPlanIds ?? []
    });

    res.status(201).json({
        success: true,
        message: 'Exam grade added successfully',
        data: { grade }
    });
});

/**
 * @desc    Get current student's own grades (for student portal)
 * @route   GET /api/grades/my-grades
 * @access  Private (Student)
 */
export const getMyGrades = asyncHandler(async (req, res) => {
    const student = await Student.findOne({ user: req.user._id, status: 'active' });
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const { month, semester, subjectId, academicYear, startDate, endDate } = req.query;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);
    if ((student.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.json({
            success: true,
            data: { grades: [], bySubject: [], academicYear: effectiveAcademicYear }
        });
    }
    const query = { student: student._id };
    if (month) query.month = parseInt(month, 10);
    if (semester) query.semester = parseInt(semester, 10);
    if (subjectId) query.subject = subjectId;
    if (startDate || endDate) {
        query.date = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query.date.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.date.$lte = end;
        }
    }
    query.academicYear = effectiveAcademicYear;

    const grades = await Grade.find(query)
        .populate('subject', 'name code maxMarks passingMarks')
        .populate('class', 'name grade')
        .populate({
            path: 'lessonPlanIds',
            select: 'date title topic teachingObjectives standardIds',
            populate: {
                path: 'standardIds',
                select: 'code'
            }
        })
        .sort({ date: -1 });
    const gradingScale = await getActiveGradingScale(req.schoolId);
    const decoratedGrades = decorateGradesWithScale(grades, gradingScale);

    const subjectMap = {};
    for (const g of decoratedGrades) {
        const sid = g.subject?._id?.toString();
        if (!sid) continue;
        if (!subjectMap[sid]) {
            subjectMap[sid] = { subject: g.subject, grades: [], total: 0, count: 0 };
        }
        subjectMap[sid].grades.push(g);
        subjectMap[sid].total += (g.marks / g.maxMarks) * 100;
        subjectMap[sid].count += 1;
    }
    const bySubject = Object.values(subjectMap).map(s => ({
        ...s,
        average: s.count > 0 ? Math.round(s.total / s.count) : 0
    }));

    res.json({
        success: true,
        data: { grades: decoratedGrades, bySubject, academicYear: effectiveAcademicYear, gradingScale }
    });
});

/**
 * @desc    Get grades for a student
 * @route   GET /api/grades/student/:studentId
 * @access  Private
 */
export const getStudentGrades = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const {
        subject,
        subjectId,
        month,
        semester,
        gradeType,
        academicYear,
        schoolYear,
        startDate,
        endDate
    } = req.query;
    const requestedSchoolYear = String(schoolYear || academicYear || '').trim();
    const shouldUseAllSchoolYears = requestedSchoolYear.toLowerCase() === 'all';
    const effectiveAcademicYear = shouldUseAllSchoolYears
        ? undefined
        : resolveRequestedAcademicYear(requestedSchoolYear, req.school);
    const filters = {
        subject: subject || subjectId,
        month: month ? parseInt(month) : undefined,
        semester: semester ? parseInt(semester) : undefined,
        gradeType,
        startDate,
        endDate,
        academicYear: effectiveAcademicYear,
        schoolId: req.schoolId
    };

    if (req.user.role === 'teacher') {
        const studentDoc = await Student.findById(studentId).select('_id currentClass').lean();
        if (!studentDoc) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const scope = await getTeacherGradeScope(req, studentDoc.currentClass);
        if (!scope.teacherProfile || scope.denied) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const classKey = String(studentDoc.currentClass || '');
        const requestedSubject = String(filters.subject || '').trim();
        const allowedSubjects = Array.from(scope.classSubjectMap.get(classKey) || []);

        if (requestedSubject) {
            const authorized = await isTeacherAuthorizedForClassSubject(
                scope.teacherProfile._id,
                studentDoc.currentClass,
                requestedSubject
            );
            if (!authorized) {
                return res.status(403).json({ success: false, message: 'Access denied for this subject' });
            }
        } else if (allowedSubjects.length > 0) {
            filters.subject = { $in: allowedSubjects };
        }
    }

    const grades = await gradeService.getStudentGrades(studentId, filters);
    const gradingScale = await getActiveGradingScale(req.schoolId);
    const availableAcademicYears = await Grade.distinct('academicYear', { student: studentId, school: req.schoolId });
    availableAcademicYears.sort();

    res.json({
        success: true,
        data: {
            grades,
            count: grades.length,
            availableAcademicYears,
            academicYear: effectiveAcademicYear || null,
            gradingScale
        }
    });
});

/**
 * @desc    Get student grade report with averages
 * @route   GET /api/grades/report/:studentId
 * @access  Private
 */
export const getStudentGradeReport = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const academicYear = resolveRequestedAcademicYear(req.query.academicYear, req.school);

    if (req.user.role === 'teacher') {
        const studentDoc = await Student.findById(studentId).select('_id currentClass').lean();
        if (!studentDoc) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const scope = await getTeacherGradeScope(req, studentDoc.currentClass);
        if (!scope.teacherProfile || scope.denied) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
    }

    const report = await gradeService.getStudentGradeReport(studentId, academicYear);

    // Get student details
    const student = await Student.findById(studentId)
        .populate('currentClass', 'name grade section');

    res.json({
        success: true,
        data: {
            student: {
                id: student._id,
                name: student.fullName,
                studentId: student.studentId,
                class: student.currentClass?.name
            },
            report
        }
    });
});

/**
 * @desc    Get monthly average for a student
 * @route   GET /api/grades/average/monthly/:studentId
 * @access  Private
 */
export const getMonthlyAverage = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { subject, month, academicYear } = req.query;

    if (!subject || !month) {
        return res.status(400).json({
            success: false,
            message: 'Subject and month are required'
        });
    }

    if (req.user.role === 'teacher') {
        const studentDoc = await Student.findById(studentId).select('_id currentClass').lean();
        if (!studentDoc) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const scope = await getTeacherGradeScope(req, studentDoc.currentClass);
        if (!scope.teacherProfile || scope.denied) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const authorized = await isTeacherAuthorizedForClassSubject(scope.teacherProfile._id, studentDoc.currentClass, subject);
        if (!authorized) {
            return res.status(403).json({ success: false, message: 'Access denied for this subject' });
        }
    }

    const effectiveAcademicYear = resolveRequestedAcademicYear(academicYear, req.school);
    const average = await gradeService.getMonthlyAverage(
        studentId,
        subject,
        parseInt(month),
        effectiveAcademicYear
    );

    res.json({
        success: true,
        data: { average }
    });
});

/**
 * @desc    Get semester average for a student
 * @route   GET /api/grades/average/semester/:studentId
 * @access  Private
 */
export const getSemesterAverage = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { subject, semester, academicYear } = req.query;

    if (!subject || !semester) {
        return res.status(400).json({
            success: false,
            message: 'Subject and semester are required'
        });
    }

    if (req.user.role === 'teacher') {
        const studentDoc = await Student.findById(studentId).select('_id currentClass').lean();
        if (!studentDoc) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const scope = await getTeacherGradeScope(req, studentDoc.currentClass);
        if (!scope.teacherProfile || scope.denied) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const authorized = await isTeacherAuthorizedForClassSubject(scope.teacherProfile._id, studentDoc.currentClass, subject);
        if (!authorized) {
            return res.status(403).json({ success: false, message: 'Access denied for this subject' });
        }
    }

    const effectiveAcademicYear = resolveRequestedAcademicYear(academicYear, req.school);
    const average = await gradeService.getSemesterAverage(
        studentId,
        subject,
        parseInt(semester),
        effectiveAcademicYear
    );

    res.json({
        success: true,
        data: { average }
    });
});

/**
 * @desc    Get overall average for a student
 * @route   GET /api/grades/average/overall/:studentId
 * @access  Private
 */
export const getOverallAverage = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const academicYear = resolveRequestedAcademicYear(req.query.academicYear, req.school);

    if (req.user.role === 'teacher') {
        const studentDoc = await Student.findById(studentId).select('_id currentClass').lean();
        if (!studentDoc) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const scope = await getTeacherGradeScope(req, studentDoc.currentClass);
        if (!scope.teacherProfile || scope.denied) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
    }

    const average = await gradeService.getOverallAverage(studentId, academicYear);

    res.json({
        success: true,
        data: { average }
    });
});

/**
 * @desc    Get class grades for a subject/date
 * @route   GET /api/grades/class/:classId
 * @access  Private (Teacher)
 */
export const getClassGrades = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { subject, date } = req.query;

    if (!subject || !date) {
        return res.status(400).json({
            success: false,
            message: 'Subject and date are required'
        });
    }

    const grades = await gradeService.getClassGrades(classId, date, subject);

    // Access Control: Teachers see only their own subject grades
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subject);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to view grades for this subject'
            });
        }
    }

    // Get all students in class to show who hasn't been graded
    const allStudents = await Student.find({
        currentClass: classId,
        status: 'active'
    }).select('_id firstName lastName studentId');

    const gradedStudentIds = grades.map(g => g.student._id.toString());
    const ungradedStudents = allStudents.filter(
        s => !gradedStudentIds.includes(s._id.toString())
    );

    res.json({
        success: true,
        data: {
            grades,
            ungradedStudents,
            totalStudents: allStudents.length,
            gradedCount: grades.length
        }
    });
});

/**
 * @desc    Get gradebook grades for a class (filtered by subject, month, type)
 * @route   GET /api/grades/gradebook/:classId
 * @access  Private (Teacher)
 */
export const getGradebookGrades = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { subject, month, gradeType, academicYear } = req.query;

    if (!subject) {
        return res.status(400).json({
            success: false,
            message: 'Subject is required'
        });
    }

    const currentMonth = month || (new Date().getMonth() + 1);
    const year = resolveRequestedAcademicYear(academicYear, req.school);

    // Access Control: Teachers see only their own subject gradebook
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const isAuthorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subject);

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to view the gradebook for this subject'
            });
        }
    }

    const result = await gradeService.getGradebookGrades(
        classId,
        subject,
        currentMonth,
        gradeType,
        year,
        { schoolId: req.schoolId }
    );

    res.json({
        success: true,
        data: {
            grades: result.grades,
            monthlyAverages: result.monthlyAverages,
            gradingScale: result.gradingScale || null
        }
    });
});

/**
 * @desc    Update a grade
 * @route   PUT /api/grades/:id
 * @access  Private (Teacher)
 */
export const updateGrade = asyncHandler(async (req, res) => {
    const { marks, maxMarks, remarks, lessonPlanIds } = req.body;
    let existingGrade = null;

    // Access Control
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        existingGrade = await Grade.findById(req.params.id);
        if (!existingGrade) {
            return res.status(404).json({ success: false, message: 'Grade not found' });
        }

        const gradeTeacherId = existingGrade.teacher?.toString();
        const isTeacherOwner = gradeTeacherId === teacher._id.toString();
        const isLegacyUserOwner = gradeTeacherId === req.user._id.toString();

        if (!isTeacherOwner && !isLegacyUserOwner) {
            return res.status(403).json({
                success: false,
                message: 'You can only modify grades you created'
            });
        }
    }

    if (!existingGrade && lessonPlanIds !== undefined) {
        existingGrade = await Grade.findById(req.params.id).select('school class subject');
        if (!existingGrade) {
            return res.status(404).json({
                success: false,
                message: 'Grade not found'
            });
        }
    }

    const updatePayload = {
        marks,
        maxMarks,
        remarks
    };

    if (lessonPlanIds !== undefined) {
        const normalizedLessonPlanIds = await validateGradeLessonPlanLinks({
            lessonPlanIds,
            schoolId: existingGrade?.school || req.schoolId,
            classId: existingGrade?.class,
            subjectId: existingGrade?.subject,
            user: req.user
        });
        updatePayload.lessonPlanIds = normalizedLessonPlanIds ?? [];
    }

    const grade = await gradeService.updateGrade(req.params.id, updatePayload);

    if (!grade) {
        return res.status(404).json({
            success: false,
            message: 'Grade not found'
        });
    }

    res.json({
        success: true,
        message: 'Grade updated successfully',
        data: { grade }
    });
});

/**
 * @desc    Delete a grade
 * @route   DELETE /api/grades/:id
 * @access  Private (Teacher, Admin)
 */
export const deleteGrade = asyncHandler(async (req, res) => {
    // Access Control
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const existingGrade = await Grade.findById(req.params.id);
        if (!existingGrade) {
            return res.status(404).json({ success: false, message: 'Grade not found' });
        }

        const gradeTeacherId = existingGrade.teacher?.toString();
        const isTeacherOwner = gradeTeacherId === teacher._id.toString();
        const isLegacyUserOwner = gradeTeacherId === req.user._id.toString();

        if (!isTeacherOwner && !isLegacyUserOwner) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete grades you created'
            });
        }
    }

    const grade = await gradeService.deleteGrade(req.params.id);

    if (!grade) {
        return res.status(404).json({
            success: false,
            message: 'Grade not found'
        });
    }

    res.json({
        success: true,
        message: 'Grade deleted successfully'
    });
});

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/grades/dashboard/stats
 * @access  Private
 */
/**
 * @desc    Get class statistics
 * @route   GET /api/grades/stats/class/:classId
 * @access  Private
 */
export const getClassStatistics = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { subject, academicYear } = req.query;

    if (!subject) {
        return res.status(400).json({
            success: false,
            message: 'Subject is required'
        });
    }

    const effectiveAcademicYear = resolveRequestedAcademicYear(academicYear, req.school);

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }

        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subject);
        if (!authorized) {
            return res.status(403).json({ success: false, message: 'Access denied for this class and subject' });
        }
    }

    // Get grade statistics for the class and subject
    const stats = await Grade.aggregate([
        {
            $match: {
                school: req.schoolId,
                class: new mongoose.Types.ObjectId(classId),
                subject: new mongoose.Types.ObjectId(subject),
                academicYear: effectiveAcademicYear
            }
        },
        {
            $group: {
                _id: '$student',
                totalMarks: { $sum: '$marks' },
                totalMaxMarks: { $sum: '$maxMarks' },
                gradeCount: { $sum: 1 },
                avgPercentage: { $avg: { $multiply: [{ $divide: ['$marks', '$maxMarks'] }, 100] } }
            }
        },
        {
            $project: {
                studentId: '$_id',
                totalMarks: 1,
                totalMaxMarks: 1,
                gradeCount: 1,
                avgPercentage: { $round: ['$avgPercentage', 2] }
            }
        },
        {
            $sort: { avgPercentage: -1 }
        }
    ]);

    // Calculate class average
    const classAverage = stats.length > 0
        ? (stats.reduce((sum, student) => sum + student.avgPercentage, 0) / stats.length).toFixed(2)
        : 0;

    res.json({
        success: true,
        data: {
            students: stats,
            classAverage: parseFloat(classAverage),
            totalStudents: stats.length
        }
    });
});

export const getDashboardStats = asyncHandler(async (req, res) => {
    const academicYear = resolveRequestedAcademicYear(req.query.academicYear, req.school);
    const academicYearRange = resolveAcademicYearDateRange(academicYear, req.school);

    const scope = await getTeacherGradeScope(req);
    const classConstraint = scope.isTeacher
        ? { currentClass: { $in: scope.classIds } }
        : {};
    const gradeClassConstraint = scope.isTeacher
        ? { class: { $in: scope.classIds } }
        : {};

    // Get total students count for this school / teacher scope
    const totalStudents = await Student.countDocuments({
        school: req.schoolId,
        status: 'active',
        ...classConstraint
    });

    // Get total classes count for this school / teacher scope
    const totalClasses = await Class.countDocuments({
        school: req.schoolId,
        isActive: true,
        ...(scope.isTeacher ? { _id: { $in: scope.classIds } } : {})
    });

    // Get total grades entered for this school / teacher scope
    const totalGrades = await Grade.countDocuments({
        school: req.schoolId,
        academicYear,
        ...gradeClassConstraint
    });

    // Calculate average performance
    const gradeStats = await Grade.aggregate([
        {
            $match: {
                school: req.schoolId,
                academicYear: academicYear,
                ...gradeClassConstraint
            }
        },
        {
            $project: {
                percentage: {
                    $multiply: [
                        { $divide: ['$marks', '$maxMarks'] },
                        100
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                avgPercentage: { $avg: '$percentage' },
                totalGrades: { $sum: 1 }
            }
        }
    ]);

    const avgPerformance = gradeStats.length > 0 ? gradeStats[0].avgPercentage.toFixed(1) : 0;

    // Calculate monthly changes (simplified - comparing current month to previous)
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    const previousMonthStart = new Date(previousYear, previousMonth - 1, 1);
    const previousMonthEnd = new Date(previousYear, previousMonth, 0, 23, 59, 59);

    const [currentMonthStudents, previousMonthStudents] = await Promise.all([
        Student.countDocuments({
            school: req.schoolId,
            status: 'active',
            ...classConstraint,
            createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }),
        Student.countDocuments({
            school: req.schoolId,
            status: 'active',
            ...classConstraint,
            createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd }
        })
    ]);

    const [currentMonthClasses, previousMonthClasses] = await Promise.all([
        Class.countDocuments({
            school: req.schoolId,
            isActive: true,
            ...(scope.isTeacher ? { _id: { $in: scope.classIds } } : {}),
            createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }),
        Class.countDocuments({
            school: req.schoolId,
            isActive: true,
            ...(scope.isTeacher ? { _id: { $in: scope.classIds } } : {}),
            createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd }
        })
    ]);

    const [currentMonthGrades, previousMonthGrades] = await Promise.all([
        Grade.countDocuments({
            school: req.schoolId,
            academicYear: academicYear,
            ...gradeClassConstraint,
            date: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }),
        Grade.countDocuments({
            school: req.schoolId,
            academicYear: academicYear,
            ...gradeClassConstraint,
            date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        })
    ]);

    const classDistribution = await Student.aggregate([
        {
            $match: {
                school: req.schoolId,
                status: 'active',
                currentClass: { $ne: null }
            }
        },
        {
            $group: {
                _id: '$currentClass',
                students: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'classes',
                localField: '_id',
                foreignField: '_id',
                as: 'classInfo'
            }
        },
        { $unwind: '$classInfo' },
        {
            $project: {
                _id: 0,
                name: '$classInfo.name',
                students: 1
            }
        },
        { $sort: { students: -1, name: 1 } },
        { $limit: 12 }
    ]);

    const rangeStart = academicYearRange?.startDate || new Date(currentYear, 0, 1);
    const rangeEnd = academicYearRange?.endDate || new Date(currentYear, 11, 31, 23, 59, 59, 999);
    const monthTrendRaw = await Grade.aggregate([
        {
            $match: {
                school: req.schoolId,
                academicYear,
                date: {
                    $gte: rangeStart,
                    $lte: rangeEnd
                }
            }
        },
        {
            $project: {
                year: { $year: '$date' },
                month: { $month: '$date' },
                percentage: {
                    $cond: [
                        { $gt: ['$maxMarks', 0] },
                        { $multiply: [{ $divide: ['$marks', '$maxMarks'] }, 100] },
                        null
                    ]
                }
            }
        },
        { $match: { percentage: { $ne: null } } },
        {
            $group: {
                _id: { year: '$year', month: '$month' },
                average: { $avg: '$percentage' }
            }
        }
    ]);

    const monthlyAveragesByKey = monthTrendRaw.reduce((acc, item) => {
        const key = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
        acc[key] = Number(item.average?.toFixed(1) || 0);
        return acc;
    }, {});

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const performanceTrend = [];
    const cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
    const endCursor = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), 1));
    while (cursor <= endCursor) {
        const year = cursor.getUTCFullYear();
        const month = cursor.getUTCMonth() + 1;
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const label = monthNames[month - 1];
        performanceTrend.push({
            month: label,
            average: monthlyAveragesByKey[key] || 0
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    // Calculate percentage changes
    const studentChange = previousMonthStudents > 0
        ? (((currentMonthStudents - previousMonthStudents) / previousMonthStudents) * 100).toFixed(0)
        : '0';

    const classChange = previousMonthClasses > 0
        ? (((currentMonthClasses - previousMonthClasses) / previousMonthClasses) * 100).toFixed(0)
        : '0';

    const gradeChange = previousMonthGrades > 0
        ? (((currentMonthGrades - previousMonthGrades) / previousMonthGrades) * 100).toFixed(0)
        : '0';

    res.json({
        success: true,
        data: {
            totalStudents,
            totalClasses,
            totalGrades,
            avgPerformance: `${avgPerformance}%`,
            classDistribution,
            performanceTrend,
            changes: {
                students: `${studentChange >= 0 ? '+' : ''}${studentChange}%`,
                classes: `${classChange >= 0 ? '+' : ''}${classChange}%`,
                grades: `${gradeChange >= 0 ? '+' : ''}${gradeChange}%`,
                performance: '+5%' // Simplified - would need more complex logic for real performance change
            }
        }
    });
});

// ── Phase 3: Spreadsheet data endpoint ──

/**
 * @desc    Get full spreadsheet data for a class+subject (column-based view)
 * @route   GET /api/grades/spreadsheet/:classId
 * @access  Private (Teacher, Admin)
 */
export const getSpreadsheetData = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { subject, subjectId, semester, academicYear } = req.query;
    const resolvedSubjectId = subject || subjectId;

    if (!resolvedSubjectId) {
        return res.status(400).json({ success: false, message: 'Subject is required' });
    }

    const year = resolveRequestedAcademicYear(academicYear, req.school);
    const semesterNumber = semester ? Number(semester) : null;

    const gradeFilter = {
        school: req.schoolId,
        class: classId,
        subject: resolvedSubjectId,
        academicYear: year
    };
    if (semesterNumber) gradeFilter.semester = semesterNumber;

    const columnFilter = {
        school: req.schoolId,
        class: classId,
        subject: resolvedSubjectId,
        academicYear: year
    };
    if (semesterNumber) columnFilter.semester = semesterNumber;

    const [students, columns, grades, gradingScale] = await Promise.all([
        Student.find({
            school: req.schoolId,
            currentClass: classId,
            status: 'active'
        })
            .select('firstName lastName studentNumber')
            .sort({ firstName: 1, lastName: 1 })
            .lean(),
        GradebookColumn.find(columnFilter)
            .sort({ sortOrder: 1, createdAt: 1 })
            .lean(),
        Grade.find(gradeFilter)
            .select('_id student columnId marks maxMarks remarks publicComment date category title')
            .lean(),
        getActiveGradingScale(req.schoolId)
    ]);

    const gradesByStudent = {};
    for (const grade of grades) {
        if (!grade?.student || !grade?.columnId) continue;
        const studentKey = grade.student.toString();
        const columnKey = grade.columnId.toString();
        if (!gradesByStudent[studentKey]) {
            gradesByStudent[studentKey] = {};
        }
        gradesByStudent[studentKey][columnKey] = grade;
    }

    const normalizedStudents = students.map((student) => ({
        ...student,
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim()
    }));

    // Backward-compatible shape for any consumers still reading studentData[]
    const studentData = normalizedStudents.map((student) => ({
        studentId: student._id.toString(),
        grades: Object.values(gradesByStudent[student._id.toString()] || {})
    }));

    res.json({
        success: true,
        data: {
            students: normalizedStudents,
            columns,
            grades: gradesByStudent,
            gradingScale,
            studentData
        }
    });
});

/**
 * @desc    Batch save grades (create or update in bulk)
 * @route   PUT /api/grades/spreadsheet/batch-save
 * @access  Private (Teacher, Admin)
 */
export const batchSaveGrades = asyncHandler(async (req, res) => {
    const {
        entries,
        classId,
        subject,
        subjectId,
        academicYear,
        semester
    } = req.body;
    // entries: [{ _id?, studentId|student, columnId, marks, maxMarks?, date?, category? }]

    if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ success: false, message: 'entries array is required' });
    }

    if (entries.length > 500) {
        return res.status(400).json({ success: false, message: 'Maximum 500 entries per batch' });
    }

    const resolvedClassId = classId || entries[0]?.class;
    const resolvedSubjectId = subject || subjectId || entries[0]?.subject;
    if (!resolvedClassId || !resolvedSubjectId) {
        return res.status(400).json({
            success: false,
            message: 'classId and subject are required'
        });
    }

    const year = resolveRequestedAcademicYear(academicYear, req.school);
    const requestedSemester = semester ? Number(semester) : null;
    const bulkOps = [];
    const uniqueColumnIds = [...new Set(entries
        .map((entry) => entry.columnId)
        .filter((columnId) => mongoose.Types.ObjectId.isValid(String(columnId))))];
    const columnIds = uniqueColumnIds.map((columnId) => new mongoose.Types.ObjectId(columnId));

    const columns = await GradebookColumn.find({
        school: req.schoolId,
        _id: { $in: columnIds }
    })
        .select('_id maxMarks category date')
        .lean();
    const columnMap = new Map(columns.map((column) => [column._id.toString(), column]));

    for (const entry of entries) {
        const resolvedStudentId = entry.studentId || entry.student;
        const resolvedColumnId = entry.columnId;

        if (!resolvedStudentId || !resolvedColumnId) {
            continue;
        }

        if (entry._id) {
            if (entry.marks == null || entry.marks === '') {
                bulkOps.push({
                    deleteOne: {
                        filter: {
                            _id: entry._id,
                            school: req.schoolId
                        }
                    }
                });
                continue;
            }

            // Update existing grade
            bulkOps.push({
                updateOne: {
                    filter: { _id: entry._id, school: req.schoolId },
                    update: {
                        $set: {
                            marks: entry.marks,
                            ...(entry.maxMarks !== undefined && { maxMarks: entry.maxMarks }),
                            ...(entry.remarks !== undefined && { remarks: entry.remarks }),
                            ...(entry.publicComment !== undefined && { publicComment: entry.publicComment })
                        }
                    }
                }
            });
        } else {
            const column = columnMap.get(String(resolvedColumnId));
            const effectiveDate = entry.date ? new Date(entry.date) : (column?.date ? new Date(column.date) : new Date());
            const month = effectiveDate.getMonth() + 1;
            const derivedSemester = requestedSemester || ((month >= 8 && month <= 12) ? 1 : 2);

            if (entry.marks == null || entry.marks === '') {
                bulkOps.push({
                    deleteOne: {
                        filter: {
                            school: req.schoolId,
                            student: resolvedStudentId,
                            class: entry.class || resolvedClassId,
                            subject: entry.subject || resolvedSubjectId,
                            academicYear: year,
                            columnId: resolvedColumnId
                        }
                    }
                });
                continue;
            }

            // Upsert by student+column for the scoped class/subject/year
            bulkOps.push({
                updateOne: {
                    filter: {
                        school: req.schoolId,
                        student: resolvedStudentId,
                        class: entry.class || resolvedClassId,
                        subject: entry.subject || resolvedSubjectId,
                        academicYear: year,
                        columnId: resolvedColumnId
                    },
                    update: {
                        $set: {
                            teacher: req.user._id,
                            gradeType: entry.gradeType || entry.category || column?.category || 'classwork',
                            category: entry.category || column?.category || 'classwork',
                            date: effectiveDate,
                            month,
                            semester: derivedSemester,
                            marks: Number(entry.marks),
                            maxMarks: entry.maxMarks || column?.maxMarks || 100,
                            title: entry.title || '',
                            remarks: entry.remarks || '',
                            publicComment: entry.publicComment || ''
                        },
                        $setOnInsert: {
                            school: req.schoolId,
                            student: resolvedStudentId,
                            subject: entry.subject || resolvedSubjectId,
                            class: entry.class || resolvedClassId,
                            academicYear: year,
                            columnId: resolvedColumnId
                        }
                    },
                    upsert: true
                }
            });
        }
    }

    if (bulkOps.length === 0) {
        return res.json({ success: true, data: { updated: 0, created: 0, deleted: 0 } });
    }

    const result = await Grade.bulkWrite(bulkOps, { ordered: false });
    const created = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;
    const deleted = result.deletedCount || 0;

    res.json({ success: true, data: { updated, created, deleted } });
});

// ── Phase 6: Auto-fill ──

/**
 * @desc    Auto-fill a column with a single value
 * @route   POST /api/grades/auto-fill
 * @access  Private (Teacher, Admin)
 */
export const autoFillColumn = asyncHandler(async (req, res) => {
    const {
        columnId,
        classId,
        subject,
        subjectId,
        value,
        maxMarks,
        onlyEmpty,
        academicYear,
        date,
        category
    } = req.body;
    const resolvedSubjectId = subject || subjectId;

    if (!classId || !resolvedSubjectId || value === undefined) {
        return res.status(400).json({ success: false, message: 'classId, subject, and value are required' });
    }

    const year = resolveRequestedAcademicYear(academicYear, req.school);

    // Get all students in the class
    const classDoc = await Class.findById(classId).lean();
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found' });

    const students = await Student.find({
        school: req.schoolId,
        currentClass: classId,
        status: 'active'
    }).select('_id').lean();

    let skipped = 0;
    let filled = 0;

    if (onlyEmpty && columnId) {
        // Find students who already have a grade in this column
        const existingGrades = await Grade.find({
            school: req.schoolId,
            columnId,
            class: classId
        }).select('student').lean();
        const existingSet = new Set(existingGrades.map(g => g.student.toString()));

        const toCreate = students
            .filter(s => !existingSet.has(s._id.toString()))
            .map(s => ({
                school: req.schoolId,
                student: s._id,
                subject: resolvedSubjectId,
                class: classId,
                teacher: req.user._id,
                academicYear: year,
                gradeType: category || 'classwork',
                category: category || 'classwork',
                date: date || new Date(),
                marks: value,
                maxMarks: maxMarks || 100,
                columnId
            }));

        if (toCreate.length > 0) {
            await Grade.insertMany(toCreate, { ordered: false });
        }
        filled = toCreate.length;
        skipped = existingSet.size;
    } else if (columnId) {
        // Overwrite all — upsert for each student
        for (const student of students) {
            await Grade.findOneAndUpdate(
                { school: req.schoolId, columnId, student: student._id },
                {
                    $set: {
                        marks: value,
                        maxMarks: maxMarks || 100,
                        subject: resolvedSubjectId,
                        class: classId,
                        teacher: req.user._id,
                        academicYear: year,
                        gradeType: category || 'classwork',
                        category: category || 'classwork',
                        date: date || new Date()
                    }
                },
                { upsert: true }
            );
            filled++;
        }
    } else {
        // No column — create new grades for each student
        const toCreate = students.map(s => ({
            school: req.schoolId,
            student: s._id,
            subject: resolvedSubjectId,
            class: classId,
            teacher: req.user._id,
            academicYear: year,
            gradeType: category || 'classwork',
            category: category || 'classwork',
            date: date || new Date(),
            marks: value,
            maxMarks: maxMarks || 100,
            title: req.body.title || 'Auto-filled'
        }));
        await Grade.insertMany(toCreate, { ordered: false });
        filled = toCreate.length;
    }

    res.json({ success: true, data: { filled, skipped } });
});

// ── Phase 6: Export ──

/**
 * @desc    Export gradebook data as JSON (for client-side Excel generation)
 * @route   GET /api/grades/export/:classId
 * @access  Private (Teacher, Admin)
 */
export const exportGradebook = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { subject, subjectId, semester, academicYear } = req.query;
    const resolvedSubjectId = subject || subjectId;

    if (!resolvedSubjectId) {
        return res.status(400).json({ success: false, message: 'Subject is required' });
    }

    const year = resolveRequestedAcademicYear(academicYear, req.school);
    const gradeFilter = {
        school: req.schoolId,
        class: classId,
        subject: resolvedSubjectId,
        academicYear: year
    };
    if (semester) gradeFilter.semester = Number(semester);

    const [grades, students, classDoc, gradingScale] = await Promise.all([
        Grade.find(gradeFilter).lean(),
        Student.find({ school: req.schoolId, currentClass: classId, status: 'active' })
            .select('firstName lastName studentNumber').lean(),
        Class.findById(classId).select('name').lean(),
        getActiveGradingScale(req.schoolId)
    ]);

    // Build export-friendly structure
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const columnGroups = new Map();

    for (const g of grades) {
        const key = g.columnId?.toString() || g.assessmentGroupId || `${g.category}:${g.date?.toISOString().slice(0, 10)}`;
        if (!columnGroups.has(key)) {
            columnGroups.set(key, {
                name: g.title || g.category,
                category: g.category,
                date: g.date,
                maxMarks: g.maxMarks,
                grades: []
            });
        }
        const student = studentMap.get(g.student.toString());
        columnGroups.get(key).grades.push({
            studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
            studentNumber: student?.studentNumber || '',
            marks: g.marks,
            maxMarks: g.maxMarks
        });
    }

    res.json({
        success: true,
        data: {
            className: classDoc?.name || '',
            academicYear: year,
            students: students.map(s => ({ name: `${s.firstName} ${s.lastName}`, studentNumber: s.studentNumber })),
            columns: [...columnGroups.values()],
            gradingScale
        }
    });
});

// ── Phase 7: Missing & Low Grades Report ──

/**
 * @desc    Get missing and low grades report
 * @route   GET /api/grades/missing-report/:classId
 * @access  Private (Teacher, Admin)
 */
export const getMissingGradesReport = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { subject, subjectId, semester, academicYear, lowGradeThreshold } = req.query;
    const resolvedSubjectId = subject || subjectId;

    const year = resolveRequestedAcademicYear(academicYear, req.school);
    const threshold = Number(lowGradeThreshold) || 50;

    const students = await Student.find({
        school: req.schoolId,
        currentClass: classId,
        status: 'active'
    }).select('firstName lastName studentNumber').lean();

    const gradeFilter = {
        school: req.schoolId,
        class: classId,
        academicYear: year
    };
    if (resolvedSubjectId) gradeFilter.subject = resolvedSubjectId;
    if (semester) gradeFilter.semester = Number(semester);

    const grades = await Grade.find(gradeFilter).lean();

    const studentGradeMap = new Map();
    for (const g of grades) {
        const sid = g.student.toString();
        if (!studentGradeMap.has(sid)) studentGradeMap.set(sid, []);
        studentGradeMap.get(sid).push(g);
    }

    const report = {
        studentsWithNoGrades: [],
        lowGrades: [],
        summary: { totalStudents: students.length, studentsWithGrades: 0, studentsWithLowGrades: 0 }
    };

    for (const student of students) {
        const sid = student._id.toString();
        const sGrades = studentGradeMap.get(sid);

        if (!sGrades || sGrades.length === 0) {
            report.studentsWithNoGrades.push({
                studentId: sid,
                name: `${student.firstName} ${student.lastName}`,
                studentNumber: student.studentNumber
            });
            continue;
        }

        report.summary.studentsWithGrades++;

        const lowOnes = sGrades.filter(g => g.maxMarks > 0 && (g.marks / g.maxMarks) * 100 < threshold);
        if (lowOnes.length > 0) {
            report.summary.studentsWithLowGrades++;
            for (const g of lowOnes) {
                report.lowGrades.push({
                    studentId: sid,
                    name: `${student.firstName} ${student.lastName}`,
                    category: g.category,
                    title: g.title || g.gradeType,
                    marks: g.marks,
                    maxMarks: g.maxMarks,
                    percentage: Math.round((g.marks / g.maxMarks) * 100),
                    date: g.date
                });
            }
        }
    }

    res.json({ success: true, data: report });
});

// ── Phase 6: Grade Import ──

/**
 * @desc    Import grades from structured JSON (parsed CSV on client side)
 * @route   POST /api/grades/import
 * @access  Private (Teacher, Admin)
 *
 * Body: { classId, subjectId, academicYear, semester, rows: [{ studentIdentifier, columnName, marks, maxMarks }] }
 * - Matches students by studentNumber or name.
 * - Creates columns automatically from columnName if they don't exist.
 */
export const importGrades = asyncHandler(async (req, res) => {
    const { classId, subjectId, academicYear, semester, rows, category } = req.body;
    if (!classId || !subjectId || !academicYear || !semester || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, message: 'classId, subjectId, academicYear, semester, and rows are required' });
    }

    let normalizedRows = rows;

    // Support both row formats:
    // 1) [{ studentIdentifier, columnName, marks, maxMarks }]
    // 2) [{ studentName, grades: { "HW #1": 90, "Quiz 1": 84 } }]
    if (rows[0] && typeof rows[0] === 'object' && rows[0].grades && typeof rows[0].grades === 'object') {
        normalizedRows = [];
        for (const row of rows) {
            const identifier = String(
                row.studentIdentifier || row.studentName || row.name || ''
            ).trim();
            if (!identifier) continue;

            for (const [columnName, marks] of Object.entries(row.grades || {})) {
                if (marks === '' || marks === null || marks === undefined) continue;
                normalizedRows.push({
                    studentIdentifier: identifier,
                    columnName,
                    marks,
                    maxMarks: row.maxMarks || 100
                });
            }
        }
    }

    if (normalizedRows.length > 5000) {
        return res.status(400).json({ success: false, message: 'Maximum 5000 grade rows per import' });
    }

    const year = resolveRequestedAcademicYear(academicYear, req.school);

    // Load students for matching
    const students = await Student.find({
        school: req.schoolId,
        currentClass: classId,
        status: 'active'
    }).select('firstName lastName studentNumber').lean();

    const studentByNumber = new Map();
    const studentByName = new Map();
    for (const s of students) {
        if (s.studentNumber) studentByNumber.set(s.studentNumber.toLowerCase(), s);
        const fullName = `${s.firstName} ${s.lastName}`.toLowerCase().trim();
        studentByName.set(fullName, s);
    }

    // Load existing columns for the scope
    const GradebookColumn = (await import('../models/GradebookColumn.js')).default;
    const existingColumns = await GradebookColumn.find({
        school: req.schoolId,
        class: classId,
        subject: subjectId,
        academicYear: year,
        semester: Number(semester)
    }).lean();
    const columnByName = new Map(existingColumns.map(c => [c.name.toLowerCase(), c]));

    const results = { imported: 0, skipped: 0, columnsCreated: 0, errors: [] };
    const gradesToCreate = [];

    for (let i = 0; i < normalizedRows.length; i++) {
        const row = normalizedRows[i];
        const identifier = String(row.studentIdentifier || '').trim();
        const colName = String(row.columnName || '').trim();
        const marks = Number(row.marks);
        const maxMarks = Number(row.maxMarks) || 100;

        if (!identifier || !colName || !Number.isFinite(marks)) {
            results.skipped++;
            results.errors.push({ row: i + 1, message: 'Missing studentIdentifier, columnName, or invalid marks' });
            continue;
        }

        // Match student
        const student = studentByNumber.get(identifier.toLowerCase()) || studentByName.get(identifier.toLowerCase());
        if (!student) {
            results.skipped++;
            results.errors.push({ row: i + 1, message: `Student not found: ${identifier}` });
            continue;
        }

        // Find or create column
        let column = columnByName.get(colName.toLowerCase());
        if (!column) {
            column = await GradebookColumn.create({
                school: req.schoolId,
                class: classId,
                subject: subjectId,
                academicYear: year,
                semester: Number(semester),
                name: colName,
                category: category || 'classwork',
                maxMarks,
                date: new Date(),
                sortOrder: existingColumns.length + results.columnsCreated + 1,
                createdBy: req.user._id
            });
            columnByName.set(colName.toLowerCase(), column);
            results.columnsCreated++;
        }

        gradesToCreate.push({
            school: req.schoolId,
            student: student._id,
            subject: subjectId,
            class: classId,
            teacher: req.user._id,
            academicYear: year,
            semester: Number(semester),
            gradeType: category || 'classwork',
            category: category || 'classwork',
            date: new Date(),
            marks,
            maxMarks,
            columnId: column._id,
            title: colName
        });
    }

    if (gradesToCreate.length > 0) {
        await Grade.insertMany(gradesToCreate, { ordered: false });
        results.imported = gradesToCreate.length;
    }

    res.json({ success: true, data: results });
});
