import mongoose from 'mongoose';
import Grade from '../models/Grade.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import HomeworkAssignment from '../models/HomeworkAssignment.js';
import HomeworkSubmission from '../models/HomeworkSubmission.js';
import gradeService from '../services/gradeService.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, isTeacherAuthorizedForClassSubject } from '../helpers/teacherScoping.js';
import { validateGradeLessonPlanLinks } from '../helpers/gradeLessonPlanLinks.js';
import { generateAssessmentGroupId } from '../helpers/assessmentGrouping.js';
import { resolveRequestedAcademicYear, resolveAcademicYearDateRange } from '../utils/academicYear.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import { decorateGradesWithScale, getActiveGradingScale } from '../services/gradingScaleEngine.js';
import { syncObjectivesForGrade } from '../jobs/academicExcellenceSyncJob.js';

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
        teacher: teacherProfile?._id || req.user._id,
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

    // Determine the grade type - support both new types and legacy 'daily'
    const effectiveGradeType = gradeType || 'classwork';
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
        teacher: teacherProfile?._id || req.user._id,
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
                    gradingSource: 'homework_submission'
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
        teacher: req.teacherId || teacherProfile?._id || req.user._id,
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

    // Get total students count for this school
    const totalStudents = await Student.countDocuments({ school: req.schoolId, status: 'active' });

    // Get total classes count for this school
    const totalClasses = await Class.countDocuments({ school: req.schoolId, isActive: true });

    // Get total grades entered for this school
    const totalGrades = await Grade.countDocuments({ school: req.schoolId, academicYear });

    // Calculate average performance
    const gradeStats = await Grade.aggregate([
        {
            $match: {
                school: req.schoolId,
                academicYear: academicYear
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
            createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }),
        Student.countDocuments({
            school: req.schoolId,
            status: 'active',
            createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd }
        })
    ]);

    const [currentMonthClasses, previousMonthClasses] = await Promise.all([
        Class.countDocuments({
            school: req.schoolId,
            isActive: true,
            createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }),
        Class.countDocuments({
            school: req.schoolId,
            isActive: true,
            createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd }
        })
    ]);

    const [currentMonthGrades, previousMonthGrades] = await Promise.all([
        Grade.countDocuments({
            school: req.schoolId,
            academicYear: academicYear,
            date: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }),
        Grade.countDocuments({
            school: req.schoolId,
            academicYear: academicYear,
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
