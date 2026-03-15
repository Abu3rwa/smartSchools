import Grade from '../models/Grade.js';
import mongoose from 'mongoose';
import { decorateGradesWithScale, getActiveGradingScale } from './gradingScaleEngine.js';

class GradeService {
    /**
     * Add a daily classwork grade
     */
    async addDailyGrade(data) {
        const grade = new Grade({
            ...data,
            gradeType: 'daily'
        });
        return await grade.save();
    }

    /**
     * Add multiple daily grades at once (bulk entry)
     */
    async addBulkDailyGrades(grades) {
        const gradeDocuments = grades.map(g => ({
            ...g,
            gradeType: 'daily'
        }));
        return await Grade.insertMany(gradeDocuments);
    }

    /**
     * Get all grades for a student
     */
    async getStudentGrades(studentId, filters = {}) {
        const query = { student: studentId };

        if (filters.subject) query.subject = filters.subject;
        if (filters.schoolId) query.school = filters.schoolId;
        if (filters.academicYear) query.academicYear = filters.academicYear;
        if (filters.month) query.month = filters.month;
        if (filters.semester) query.semester = filters.semester;
        if (filters.gradeType) query.gradeType = filters.gradeType;
        if (filters.date && (filters.date.$gte || filters.date.$lte)) {
            query.date = filters.date;
        }
        if (filters.startDate || filters.endDate) {
            query.date = {};
            if (filters.startDate) {
                const start = new Date(filters.startDate);
                start.setHours(0, 0, 0, 0);
                query.date.$gte = start;
            }
            if (filters.endDate) {
                const end = new Date(filters.endDate);
                end.setHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        const grades = await Grade.find(query)
            .populate('subject', 'name code')
            .populate('class', 'name grade section')
            .populate('teacher', 'user')
            .populate({
                path: 'lessonPlanIds',
                select: 'date title topic teachingObjectives standardIds',
                populate: {
                    path: 'standardIds',
                    select: 'code'
                }
            })
            .sort({ date: -1 });

        if (!filters.schoolId) {
            return grades;
        }

        const gradingScale = await getActiveGradingScale(filters.schoolId);
        return decorateGradesWithScale(grades, gradingScale);
    }

    /**
     * Get all grades for a student within a date range
     */
    async getStudentGradesByDateRange(studentId, { startDate, endDate } = {}) {
        const query = {
            student: new mongoose.Types.ObjectId(studentId)
        };

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

        return await Grade.find(query)
            .populate('subject', 'name code')
            .populate('class', 'name grade section')
            .populate('teacher', 'user')
            .populate({
                path: 'lessonPlanIds',
                select: 'date title topic teachingObjectives standardIds',
                populate: {
                    path: 'standardIds',
                    select: 'code'
                }
            })
            .sort({ date: -1 });
    }

    /**
     * Get grades for a class on a specific date/subject
     */
    async getClassGrades(classId, date, subjectId) {
        return await Grade.find({
            class: classId,
            subject: subjectId,
            date: {
                $gte: new Date(date).setHours(0, 0, 0, 0),
                $lte: new Date(date).setHours(23, 59, 59, 999)
            }
        })
            .populate('student', 'firstName lastName studentId')
            .sort({ 'student.firstName': 1 });
    }

    /**
     * Get grades for gradebook view - filtered by class, subject, month, and type
     */
    async getGradebookGrades(classId, subjectId, month, gradeType, academicYear, options = {}) {
        const monthNumber = Number(month);
        const query = {
            class: new mongoose.Types.ObjectId(classId),
            subject: new mongoose.Types.ObjectId(subjectId),
            month: Number.isFinite(monthNumber) ? monthNumber : undefined,
            academicYear
        };
        if (options.schoolId) query.school = options.schoolId;
        if (query.month === undefined) delete query.month;

        // Handle both new and legacy grade types
        if (gradeType === 'classwork') {
            query.gradeType = { $in: ['classwork', 'daily'] };
        } else if (gradeType) {
            query.gradeType = gradeType;
        }

        const grades = await Grade.find(query)
            .populate('student', 'firstName lastName studentId')
            .sort({ date: -1, 'student.firstName': 1 });

        // Filter out orphaned grades where student is null
        const validGrades = grades.filter((grade) => grade.student && grade.student._id);
        const gradingScale = options.schoolId
            ? await getActiveGradingScale(options.schoolId)
            : null;
        const decoratedGrades = gradingScale
            ? decorateGradesWithScale(validGrades, gradingScale)
            : validGrades;

        // Calculate monthly averages per student
        const studentAverages = {};
        const studentGrades = {};

        for (const grade of decoratedGrades) {
            const studentId = grade.student._id.toString();
            if (!studentGrades[studentId]) {
                studentGrades[studentId] = [];
            }
            studentGrades[studentId].push(grade);
        }

        for (const [studentId, sGrades] of Object.entries(studentGrades)) {
            const totalMarks = sGrades.reduce((sum, g) => sum + g.marks, 0);
            const totalMaxMarks = sGrades.reduce((sum, g) => sum + g.maxMarks, 0);
            studentAverages[studentId] = totalMaxMarks > 0
                ? (totalMarks / totalMaxMarks) * 100
                : 0;
        }

        return {
            grades: decoratedGrades,
            monthlyAverages: studentAverages,
            gradingScale: gradingScale || null
        };
    }

    /**
     * Add bulk grades with support for notes and flexible grade types
     */
    async addBulkGradesWithNotes(gradesData) {
        const gradeDocuments = gradesData.map(g => ({
            student: g.student,
            subject: g.subject,
            class: g.classId,
            teacher: g.teacher,
            academicYear: g.academicYear,
            gradeType: g.gradeType || 'classwork',
            category: g.category || g.gradeType || 'classwork',
            date: g.date || new Date(),
            marks: g.marks,
            maxMarks: g.maxMarks || 10,
            title: g.title,
            notes: g.notes,
            remarks: g.remarks,
            lessonPlanIds: Array.isArray(g.lessonPlanIds) ? g.lessonPlanIds : []
        }));
        return await Grade.insertMany(gradeDocuments);
    }


    /**
     * Calculate monthly average for a student in a subject
     */
    async getMonthlyAverage(studentId, subjectId, month, academicYear, schoolId = null) {
        return await Grade.getMonthlyAverage(studentId, subjectId, month, academicYear, schoolId);
    }

    /**
     * Calculate semester average for a student in a subject
     */
    async getSemesterAverage(studentId, subjectId, semester, academicYear, schoolId = null) {
        return await Grade.getSemesterAverage(studentId, subjectId, semester, academicYear, schoolId);
    }

    /**
     * Calculate overall average for a student
     */
    async getOverallAverage(studentId, academicYear, schoolId = null) {
        return await Grade.getOverallAverage(studentId, academicYear, schoolId);
    }

    /**
     * Get comprehensive grade report for a student
     */
    async getStudentGradeReport(studentId, academicYear) {
        const student = new mongoose.Types.ObjectId(studentId);

        // Get all subjects the student has grades in
        const subjects = await Grade.distinct('subject', { student, academicYear });

        const report = {
            studentId,
            academicYear,
            subjects: [],
            monthlyAverages: {},
            semesterAverages: { 1: [], 2: [] },
            overallAverage: 0
        };

        // Calculate averages for each subject
        for (const subjectId of subjects) {
            const subjectReport = await this.getSubjectReport(studentId, subjectId, academicYear);
            report.subjects.push(subjectReport);
        }

        // Calculate overall average
        if (report.subjects.length > 0) {
            const total = report.subjects.reduce((sum, s) => sum + parseFloat(s.overallAverage || 0), 0);
            report.overallAverage = (total / report.subjects.length).toFixed(2);
        }

        return report;
    }

    /**
     * Get subject-specific report for a student
     */
    async getSubjectReport(studentId, subjectId, academicYear) {
        const Subject = mongoose.model('Subject');
        const subject = await Subject.findById(subjectId);

        const report = {
            subjectId,
            subjectName: subject?.name,
            subjectCode: subject?.code,
            monthlyAverages: {},
            semester1Average: 0,
            semester2Average: 0,
            overallAverage: 0
        };

        // Calculate monthly averages (months 1-12)
        for (let month = 1; month <= 12; month++) {
            const monthlyAvg = await this.getMonthlyAverage(studentId, subjectId, month, academicYear);
            if (monthlyAvg.count > 0) {
                report.monthlyAverages[month] = {
                    average: monthlyAvg.average.toFixed(2),
                    totalMarks: monthlyAvg.totalMarks,
                    totalMaxMarks: monthlyAvg.totalMaxMarks,
                    entries: monthlyAvg.count
                };
            }
        }

        // Calculate semester averages
        const sem1 = await this.getSemesterAverage(studentId, subjectId, 1, academicYear);
        const sem2 = await this.getSemesterAverage(studentId, subjectId, 2, academicYear);

        report.semester1Average = sem1.average;
        report.semester2Average = sem2.average;

        // Calculate overall for this subject
        const s1 = parseFloat(sem1.average) || 0;
        const s2 = parseFloat(sem2.average) || 0;
        if (s1 > 0 && s2 > 0) {
            report.overallAverage = ((s1 + s2) / 2).toFixed(2);
        } else if (s1 > 0) {
            report.overallAverage = s1.toFixed(2);
        } else if (s2 > 0) {
            report.overallAverage = s2.toFixed(2);
        }

        return report;
    }

    /**
     * Get class statistics for a subject
     */
    async getClassStatistics(classId, subjectId, academicYear, schoolId = null) {
        const match = {
            class: new mongoose.Types.ObjectId(classId),
            subject: new mongoose.Types.ObjectId(subjectId),
            academicYear
        };
        if (schoolId) match.school = schoolId;

        const stats = await Grade.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$student',
                    totalMarks: { $sum: '$marks' },
                    totalMaxMarks: { $sum: '$maxMarks' },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    percentage: {
                        $multiply: [
                            { $divide: ['$totalMarks', '$totalMaxMarks'] },
                            100
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avgPercentage: { $avg: '$percentage' },
                    maxPercentage: { $max: '$percentage' },
                    minPercentage: { $min: '$percentage' },
                    studentCount: { $sum: 1 }
                }
            }
        ]);

        return stats[0] || {
            avgPercentage: 0,
            maxPercentage: 0,
            minPercentage: 0,
            studentCount: 0
        };
    }

    /**
     * Update a grade
     */
    async updateGrade(gradeId, data) {
        return await Grade.findByIdAndUpdate(gradeId, data, {
            new: true,
            runValidators: true
        });
    }

    /**
     * Delete a grade
     */
    async deleteGrade(gradeId) {
        return await Grade.findByIdAndDelete(gradeId);
    }

    /**
     * Get all classwork grades for a student for the current month (cumulative for daily reports)
     * Returns all entries from day 1 of the month up to and including today
     * Optional filters: subject (id), category
     */
    async getMonthlyClassworkGrades(studentId, targetDate = new Date(), filters = {}) {
        const date = new Date(targetDate);
        const year = date.getFullYear();

        // Start of the month
        const startOfMonth = new Date(year, date.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);

        // End of today
        const endOfToday = new Date(date);
        endOfToday.setHours(23, 59, 59, 999);

        const query = {
            student: new mongoose.Types.ObjectId(studentId),
            gradeType: { $in: ['classwork', 'daily'] },
            date: { $gte: startOfMonth, $lte: endOfToday }
        };

        const normalizedSubject = String(filters.subject ?? '').trim();
        const normalizedCategory = String(filters.category ?? '').trim();

        if (normalizedSubject && mongoose.isValidObjectId(normalizedSubject)) {
            query.subject = new mongoose.Types.ObjectId(normalizedSubject);
        }
        if (normalizedCategory && normalizedCategory.toLowerCase() !== 'all') {
            query.category = normalizedCategory.toLowerCase();
        }

        const grades = await Grade.find(query)
            .populate('subject', 'name code')
            .sort({ date: 1 }); // Ascending order by date

        return grades;
    }

    /**
     * Get all classwork grades for all students in a class for the current month
     * Optional filters: subject (id), category
     */
    async getClassMonthlyClassworkGrades(classId, targetDate = new Date(), filters = {}) {
        const date = new Date(targetDate);
        const year = date.getFullYear();

        const startOfMonth = new Date(year, date.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfToday = new Date(date);
        endOfToday.setHours(23, 59, 59, 999);

        const query = {
            class: new mongoose.Types.ObjectId(classId),
            gradeType: { $in: ['classwork', 'daily'] },
            date: { $gte: startOfMonth, $lte: endOfToday }
        };

        const normalizedSubject = String(filters.subject ?? '').trim();
        const normalizedCategory = String(filters.category ?? '').trim();

        if (normalizedSubject && mongoose.isValidObjectId(normalizedSubject)) {
            query.subject = new mongoose.Types.ObjectId(normalizedSubject);
        }
        if (normalizedCategory && normalizedCategory.toLowerCase() !== 'all') {
            query.category = normalizedCategory.toLowerCase();
        }

        const grades = await Grade.find(query)
            .populate('student', 'firstName lastName studentId')
            .populate('subject', 'name code')
            .sort({ date: 1 });

        // Group grades by student
        const gradesByStudent = {};
        for (const grade of grades) {
            const studentId = grade.student._id.toString();
            if (!gradesByStudent[studentId]) {
                gradesByStudent[studentId] = {
                    student: grade.student,
                    grades: []
                };
            }
            gradesByStudent[studentId].grades.push(grade);
        }

        return gradesByStudent;
    }
}

export default new GradeService();
