import mongoose from 'mongoose';
import Grade from '../models/Grade.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import Subject from '../models/Subject.js';
import gradeService from '../services/gradeService.js';
import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, isTeacherAuthorizedForClassSubject, getTeacherClassIds } from '../helpers/teacherScoping.js';

/**
 * @desc    Add daily classwork grade
 * @route   POST /api/grades/daily
 * @access  Private (Teacher)
 */
export const addDailyGrade = asyncHandler(async (req, res) => {
    const { student, subject, classId, marks, maxMarks, date, title, description, remarks, sendNotification } = req.body;

    // Access Control: Verify teacher is assigned to this class+subject
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subject);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to add grades for this subject in this class'
            });
        }
    }

    // Get subject details
    const subjectData = await Subject.findById(subject);

    const gradeData = {
        school: req.schoolId,
        student,
        subject,
        class: classId,
        teacher: req.user._id,
        academicYear: req.body.academicYear || '2025-2026',
        gradeType: 'daily',
        date: date || new Date(),
        marks,
        maxMarks: maxMarks || subjectData?.dailyMaxMarks || 10,
        title,
        description,
        remarks
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
    const { classId, subject, date, maxMarks, grades, sendNotifications, gradeType, title, category } = req.body;
    // grades: [{ student: id, marks, remarks, notes }]

    let teacherId = req.user._id;

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        teacherId = teacher._id;

        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subject);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to add grades for this subject in this class'
            });
        }
    }

    const subjectData = await Subject.findById(subject);
    const academicYear = req.body.academicYear || '2025-2026';

    // Determine the grade type - support both new types and legacy 'daily'
    const effectiveGradeType = gradeType || 'classwork';

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
        remarks: g.remarks || ''
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

    res.status(201).json({
        success: true,
        message: `${savedGrades.length} grades added successfully`,
        data: { count: savedGrades.length }
    });
});

/**
 * @desc    Add test/exam grade
 * @route   POST /api/grades/exam
 * @access  Private (Teacher)
 */
export const addExamGrade = asyncHandler(async (req, res) => {
    const { student, subject, classId, marks, maxMarks, gradeType, examName, date, remarks } = req.body;

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subject);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to add grades for this subject in this class'
            });
        }
    }

    const grade = await Grade.create({
        school: req.schoolId,
        student,
        subject,
        class: classId,
        teacher: req.teacherId || req.user._id,
        academicYear: req.body.academicYear || '2025-2026',
        gradeType: gradeType || 'monthly_test',
        date: date || new Date(),
        marks,
        maxMarks: maxMarks || 100,
        examName,
        remarks
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

    const { month, semester, subjectId, academicYear } = req.query;
    const query = { student: student._id };
    if (month) query.month = parseInt(month, 10);
    if (semester) query.semester = parseInt(semester, 10);
    if (subjectId) query.subject = subjectId;
    if (academicYear) query.academicYear = academicYear;

    const grades = await Grade.find(query)
        .populate('subject', 'name code maxMarks passingMarks')
        .populate('class', 'name grade')
        .sort({ date: -1 });

    const subjectMap = {};
    for (const g of grades) {
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
        data: { grades, bySubject }
    });
});

/**
 * @desc    Get grades for a student
 * @route   GET /api/grades/student/:studentId
 * @access  Private
 */
export const getStudentGrades = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { subject, month, semester, gradeType, academicYear } = req.query;

    const filters = {
        subject,
        month: month ? parseInt(month) : undefined,
        semester: semester ? parseInt(semester) : undefined,
        gradeType,
        academicYear: academicYear || '2025-2026'
    };

    const grades = await gradeService.getStudentGrades(studentId, filters);

    res.json({
        success: true,
        data: { grades, count: grades.length }
    });
});

/**
 * @desc    Get student grade report with averages
 * @route   GET /api/grades/report/:studentId
 * @access  Private
 */
export const getStudentGradeReport = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const academicYear = req.query.academicYear || '2025-2026';

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

    const average = await gradeService.getMonthlyAverage(
        studentId,
        subject,
        parseInt(month),
        academicYear || '2025-2026'
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

    const average = await gradeService.getSemesterAverage(
        studentId,
        subject,
        parseInt(semester),
        academicYear || '2025-2026'
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
    const academicYear = req.query.academicYear || '2025-2026';

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
    const year = academicYear || '2025-2026';

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
        year
    );

    res.json({
        success: true,
        data: {
            grades: result.grades,
            monthlyAverages: result.monthlyAverages
        }
    });
});

/**
 * @desc    Update a grade
 * @route   PUT /api/grades/:id
 * @access  Private (Teacher)
 */
export const updateGrade = asyncHandler(async (req, res) => {
    const { marks, maxMarks, remarks } = req.body;

    // Access Control
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });

        const existingGrade = await Grade.findById(req.params.id);
        if (!existingGrade) {
            return res.status(404).json({ success: false, message: 'Grade not found' });
        }

        if (existingGrade.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only modify grades you created'
            });
        }
    }

    const grade = await gradeService.updateGrade(req.params.id, {
        marks,
        maxMarks,
        remarks
    });

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

        if (existingGrade.teacher.toString() !== teacher._id.toString()) {
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

    // Get grade statistics for the class and subject
    const stats = await Grade.aggregate([
        {
            $match: {
                school: req.schoolId,
                class: new mongoose.Types.ObjectId(classId),
                subject: new mongoose.Types.ObjectId(subject),
                academicYear: academicYear || '2025-2026'
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
    const academicYear = req.query.academicYear || '2025-2026';
    
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
            changes: {
                students: `${studentChange >= 0 ? '+' : ''}${studentChange}%`,
                classes: `${classChange >= 0 ? '+' : ''}${classChange}%`,
                grades: `${gradeChange >= 0 ? '+' : ''}${gradeChange}%`,
                performance: '+5%' // Simplified - would need more complex logic for real performance change
            }
        }
    });
});
