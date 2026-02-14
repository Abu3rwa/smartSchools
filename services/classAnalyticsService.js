/**
 * Class analytics service: builds aggregated analytics payload for a class
 * (grades by subject, attendance summary, at-risk students).
 */

import mongoose from 'mongoose';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Grade from '../models/Grade.js';
import Attendance from '../models/Attendance.js';
import Subject from '../models/Subject.js';

const GRADE_AT_RISK_THRESHOLD = 60;
const ATTENDANCE_AT_RISK_THRESHOLD = 80;

/**
 * Get academic year date range (approximate: Aug–May). Returns { startDate, endDate }.
 */
function getAcademicYearDates(academicYear) {
    if (!academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
        const now = new Date();
        const end = new Date(now.getFullYear(), 10, 31); // Oct 31
        const start = new Date(now.getFullYear() - 1, 7, 1); // Aug 1 previous year
        return { startDate: start, endDate: end };
    }
    const [startYear, endYear] = academicYear.split('-').map(Number);
    return {
        startDate: new Date(startYear, 7, 1),   // Aug 1
        endDate: new Date(endYear, 4, 31)        // May 31
    };
}

/**
 * Build analytics payload for a class.
 * @param {string} classId - Class _id
 * @param {string} schoolId - School _id (for tenant isolation)
 * @param {Object} options - { academicYear, startDate, endDate }
 * @returns {Promise<Object>} Analytics payload
 */
export async function getAnalytics(classId, schoolId, options = {}) {
    const { academicYear, startDate: optStart, endDate: optEnd } = options;
    const classObjId = new mongoose.Types.ObjectId(classId);
    const schoolObjId = new mongoose.Types.ObjectId(schoolId);

    const classDoc = await Class.findOne({ _id: classId, school: schoolId })
        .populate('subjects.subject', 'name code')
        .lean();
    if (!classDoc) {
        return null;
    }

    const studentCount = await Student.countDocuments({
        currentClass: classId,
        status: 'active',
        school: schoolId
    });

    const yearDates = getAcademicYearDates(academicYear);
    const startDate = optStart ? new Date(optStart) : yearDates.startDate;
    const endDate = optEnd ? new Date(optEnd) : yearDates.endDate;
    const effectiveAcademicYear = academicYear || classDoc.academicYear || '2025-2026';

    // --- Grades: per-subject stats and per-student averages for at-risk ---
    const gradeMatch = {
        school: schoolObjId,
        class: classObjId,
        academicYear: effectiveAcademicYear
    };

    const bySubjectPipeline = [
        { $match: gradeMatch },
        {
            $group: {
                _id: '$subject',
                totalMarks: { $sum: '$marks' },
                totalMaxMarks: { $sum: '$maxMarks' },
                gradeCount: { $sum: 1 },
                studentIds: { $addToSet: '$student' }
            }
        },
        {
            $lookup: {
                from: 'subjects',
                localField: '_id',
                foreignField: '_id',
                as: 'subjectInfo'
            }
        },
        { $unwind: '$subjectInfo' },
        {
            $project: {
                subjectId: '$_id',
                subjectName: '$subjectInfo.name',
                subjectCode: '$subjectInfo.code',
                totalMarks: 1,
                totalMaxMarks: 1,
                gradeCount: 1
            }
        }
    ];

    const bySubjectResult = await Grade.aggregate(bySubjectPipeline);
    const gradeStatsBySubject = bySubjectResult.map((row) => {
        const pct = row.totalMaxMarks > 0
            ? Math.round((row.totalMarks / row.totalMaxMarks) * 10000) / 100
            : 0;
        return {
            subjectId: row.subjectId,
            subjectName: row.subjectName,
            subjectCode: row.subjectCode,
            classAverage: pct,
            totalGrades: row.gradeCount
        };
    });

    // Per-student average across all subjects (for at-risk list)
    const perStudentPipeline = [
        { $match: gradeMatch },
        {
            $group: {
                _id: '$student',
                totalMarks: { $sum: '$marks' },
                totalMaxMarks: { $sum: '$maxMarks' }
            }
        },
        {
            $project: {
                studentId: '$_id',
                avgPercentage: {
                    $cond: {
                        if: { $gt: ['$totalMaxMarks', 0] },
                        then: { $multiply: [{ $divide: ['$totalMarks', '$totalMaxMarks'] }, 100] },
                        else: 0
                    }
                }
            }
        },
        { $match: { avgPercentage: { $lt: GRADE_AT_RISK_THRESHOLD } } }
    ];
    const atRiskByGrade = await Grade.aggregate(perStudentPipeline);

    // --- Attendance: class-filtered summary for date range ---
    let attendanceSummary = {
        averageRate: 0,
        totalSessions: 0,
        totalPresent: 0,
        totalExpected: 0
    };
    try {
        const attendanceRaw = await Attendance.getAttendanceAnalytics(
            schoolId,
            startDate,
            endDate,
            { class: classId }
        );
        if (Array.isArray(attendanceRaw) && attendanceRaw.length > 0) {
            let totalPresent = 0;
            let totalExpected = 0;
            attendanceRaw.forEach((day) => {
                totalPresent += day.totalPresent ?? 0;
                totalExpected += day.totalStudents ?? 0;
            });
            attendanceSummary = {
                averageRate: totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 10000) / 100 : 0,
                totalSessions: attendanceRaw.length,
                totalPresent,
                totalExpected
            };
        }
    } catch (err) {
        // Leave default summary on error
    }

    // --- At-risk by attendance: students with low attendance in date range ---
    const attendanceByStudent = await Attendance.aggregate([
        {
            $match: {
                school: schoolObjId,
                class: classObjId,
                date: { $gte: startDate, $lte: endDate }
            }
        },
        { $unwind: '$studentAttendance' },
        {
            $group: {
                _id: '$studentAttendance.student',
                present: {
                    $sum: {
                        $cond: [
                            { $in: ['$studentAttendance.status', ['present', 'tardy', 'tardy_excused']] },
                            1,
                            0
                        ]
                    }
                },
                total: { $sum: 1 }
            }
        },
        {
            $project: {
                studentId: '$_id',
                rate: {
                    $cond: {
                        if: { $gt: ['$total', 0] },
                        then: { $multiply: [{ $divide: ['$present', '$total'] }, 100] },
                        else: 100
                    }
                }
            }
        },
        { $match: { rate: { $lt: ATTENDANCE_AT_RISK_THRESHOLD } } }
    ]);

    const atRiskStudentIds = new Set([
        ...atRiskByGrade.map((r) => r.studentId.toString()),
        ...attendanceByStudent.map((r) => r.studentId.toString())
    ]);
    let studentsToSupport = [];
    if (atRiskStudentIds.size > 0) {
        const students = await Student.find({
            _id: { $in: Array.from(atRiskStudentIds) },
            school: schoolId
        })
            .select('_id firstName lastName studentId')
            .lean();
        const gradeMap = Object.fromEntries(atRiskByGrade.map((r) => [r.studentId.toString(), r.avgPercentage]));
        const attendanceMap = Object.fromEntries(
            attendanceByStudent.map((r) => [r.studentId.toString(), r.rate])
        );
        studentsToSupport = students.map((s) => ({
            _id: s._id,
            firstName: s.firstName,
            lastName: s.lastName,
            studentId: s.studentId,
            averagePercentage: gradeMap[s._id.toString()],
            attendanceRate: attendanceMap[s._id.toString()]
        }));
    }

    return {
        class: {
            _id: classDoc._id,
            name: classDoc.name,
            grade: classDoc.grade,
            section: classDoc.section,
            academicYear: classDoc.academicYear
        },
        studentCount,
        dateRange: { startDate, endDate },
        academicYear: effectiveAcademicYear,
        gradeStatsBySubject,
        attendanceSummary,
        studentsToSupport,
        atRiskCount: studentsToSupport.length
    };
}
