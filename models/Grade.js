import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { resolveSemesterForDate, resolveExamPeriodForDate } from '../services/gradebookConfigService.js';

const gradeSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student is required']
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: [true, 'Subject is required']
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: [true, 'Class is required']
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Teacher is required']
    },
    academicYear: {
        type: String,
        required: [true, 'Academic year is required']
    },
    // Grade type: classwork, homework, quiz, project, participation, test, exam
    gradeType: {
        type: String,
        enum: ['classwork', 'homework', 'quiz', 'project', 'participation', 'monthly_test', 'midterm_exam', 'semester_exam', 'final_exam', 'oral', 'practical', 'assignment', 'other', 'daily', 'weekly'],
        required: true
    },
    // Assessment category for grouping
    category: {
        type: String,
        enum: ['classwork', 'homework', 'quiz', 'project', 'participation', 'test', 'exam', 'midterm', 'final', 'oral', 'practical', 'assignment', 'other'],
        default: 'classwork'
    },
    // Common fields
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    marks: {
        type: Number,
        required: [true, 'Marks are required'],
        min: 0
    },
    maxMarks: {
        type: Number,
        required: [true, 'Maximum marks are required'],
        min: 1
    },
    // For organizing grades
    month: {
        type: Number, // 1-12
        required: true
    },
    semester: {
        type: Number, // 1 or 2
        required: true
    },
    // Additional details
    title: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    remarks: {
        type: String,
        trim: true
    },
    assessmentGroupId: {
        type: String,
        trim: true,
        default: ''
    },
    lessonPlanIds: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LessonPlan'
        }
    ],
    // Teacher notes - detailed explanation for the grade
    notes: {
        type: String,
        trim: true,
        maxlength: 500
    },
    // For exams
    examName: {
        type: String,
        trim: true
    },
    // Optional linkage for homework lifecycle
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assignment',
        default: null,
        index: true
    },
    homeworkAssignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HomeworkAssignment',
        default: null,
        index: true
    },
    homeworkSubmission: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HomeworkSubmission',
        default: null
    },
    gradingSource: {
        type: String,
        enum: ['manual', 'homework_submission'],
        default: 'manual'
    },
    // Phase 1: Gradebook Enhancement — optional fields (backward-compatible)
    columnId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GradebookColumn',
        default: null,
        index: true
    },
    examPeriod: {
        type: String,
        enum: ['midterm', 'final', null],
        default: null
    },
    publicComment: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },
    privateComment: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for efficient querying
gradeSchema.index({ student: 1, subject: 1, academicYear: 1 });
gradeSchema.index({ student: 1, month: 1, academicYear: 1 });
gradeSchema.index({ student: 1, semester: 1, academicYear: 1 });
gradeSchema.index({ class: 1, subject: 1, date: 1 });
gradeSchema.index({ teacher: 1, date: 1 });
gradeSchema.index({ gradeType: 1 });
gradeSchema.index({ school: 1, lessonPlanIds: 1 });
gradeSchema.index({ school: 1, assessmentGroupId: 1 });
gradeSchema.index({ school: 1, homeworkAssignment: 1, student: 1 });

// Student grade feed pagination and sorting (school-scoped by tenant isolation).
gradeSchema.index({ school: 1, student: 1, academicYear: 1, date: -1 });
gradeSchema.index({ school: 1, student: 1, subject: 1, academicYear: 1, date: -1 });
gradeSchema.index({ school: 1, student: 1, month: 1, academicYear: 1, date: -1 });
gradeSchema.index({ school: 1, student: 1, semester: 1, academicYear: 1, date: -1 });

// Category filter uses an $or on category and gradeType.
gradeSchema.index({ school: 1, student: 1, category: 1, academicYear: 1, date: -1 });
gradeSchema.index({ school: 1, student: 1, gradeType: 1, academicYear: 1, date: -1 });

// Class and teacher scoped list queries also run under school isolation.
gradeSchema.index({ school: 1, class: 1, subject: 1, date: -1 });
gradeSchema.index({ school: 1, teacher: 1, date: -1 });

// Assessment-group edits commonly filter by school + group + teacher.
gradeSchema.index({ school: 1, assessmentGroupId: 1, teacher: 1 });

gradeSchema.index(
    { school: 1, assignment: 1, student: 1 },
    { unique: true, partialFilterExpression: { assignment: { $exists: true, $ne: null } } }
);

// Virtual for percentage
gradeSchema.virtual('percentage').get(function () {
    return ((this.marks / this.maxMarks) * 100).toFixed(2);
});

// Virtual for letter grade
// DEPRECATED: This virtual uses hardcoded thresholds that conflict with the
// school's configurable grading scale (GradingScale model + gradingScaleEngine).
// All production code should use gradingScaleEngine.resolveGradeDetails() instead.
// Kept only for backward compatibility with any direct document access.
gradeSchema.virtual('letterGrade').get(function () {
    return ''; // Use gradingScaleEngine for letter grades
});

// Pre-save hook to set month and semester
gradeSchema.pre('save', async function (next) {
    // BE-018: Cross-field validation — marks must not exceed maxMarks
    if (this.marks != null && this.maxMarks != null && this.marks > this.maxMarks) {
        return next(new Error(`marks (${this.marks}) cannot exceed maxMarks (${this.maxMarks})`));
    }

    if (!this.assessmentGroupId) {
        this.assessmentGroupId = new mongoose.Types.ObjectId().toString();
    }

    const date = new Date(this.date);
    this.month = date.getMonth() + 1; // 1-12

    // Resolve semester from GradebookConfig if available, else fallback to month-based
    try {
        const configSemester = await resolveSemesterForDate(this.school, date);
        this.semester = configSemester || ((this.month >= 8 && this.month <= 12) ? 1 : 2);
    } catch {
        // Fallback: month-based (Aug-Dec = 1, Jan-Jul = 2)
        this.semester = (this.month >= 8 && this.month <= 12) ? 1 : 2;
    }

    // Auto-detect exam period if not already set
    if (!this.examPeriod) {
        try {
            this.examPeriod = await resolveExamPeriodForDate(this.school, date);
        } catch {
            // Leave null — not critical
        }
    }

    next();
});

// Static method to calculate monthly average for a student
gradeSchema.statics.getMonthlyAverage = async function (studentId, subjectId, month, academicYear, schoolId = null) {
    const match = {
        student: new mongoose.Types.ObjectId(studentId),
        subject: new mongoose.Types.ObjectId(subjectId),
        month: month,
        academicYear: academicYear,
        gradeType: 'daily'
    };
    if (schoolId) match.school = schoolId;

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalMarks: { $sum: '$marks' },
                totalMaxMarks: { $sum: '$maxMarks' },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                average: {
                    $multiply: [
                        { $divide: ['$totalMarks', '$totalMaxMarks'] },
                        100
                    ]
                },
                totalMarks: 1,
                totalMaxMarks: 1,
                count: 1
            }
        }
    ]);

    return result[0] || { average: 0, totalMarks: 0, totalMaxMarks: 0, count: 0 };
};

// Static method to calculate semester average
gradeSchema.statics.getSemesterAverage = async function (studentId, subjectId, semester, academicYear, schoolId = null) {
    const match = {
        student: new mongoose.Types.ObjectId(studentId),
        subject: new mongoose.Types.ObjectId(subjectId),
        semester: semester,
        academicYear: academicYear
    };
    if (schoolId) match.school = schoolId;

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$gradeType',
                totalMarks: { $sum: '$marks' },
                totalMaxMarks: { $sum: '$maxMarks' },
                count: { $sum: 1 }
            }
        }
    ]);

    // Calculate weighted average
    let totalWeightedMarks = 0;
    let totalWeight = 0;

    const weights = {
        daily: 0.3,
        weekly: 0.1,
        monthly_test: 0.2,
        semester_exam: 0.4
    };

    result.forEach(item => {
        const weight = weights[item._id] || 0.25;
        const percentage = (item.totalMarks / item.totalMaxMarks) * 100;
        totalWeightedMarks += percentage * weight;
        totalWeight += weight;
    });

    return {
        average: totalWeight > 0 ? (totalWeightedMarks / totalWeight).toFixed(2) : 0,
        breakdown: result
    };
};

// Static method to calculate overall average
gradeSchema.statics.getOverallAverage = async function (studentId, academicYear, schoolId = null) {
    const match = {
        student: new mongoose.Types.ObjectId(studentId),
        academicYear: academicYear
    };
    if (schoolId) match.school = schoolId;

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$subject',
                totalMarks: { $sum: '$marks' },
                totalMaxMarks: { $sum: '$maxMarks' }
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
        {
            $unwind: '$subjectInfo'
        },
        {
            $project: {
                subject: '$subjectInfo.name',
                subjectCode: '$subjectInfo.code',
                percentage: {
                    $multiply: [
                        { $divide: ['$totalMarks', '$totalMaxMarks'] },
                        100
                    ]
                }
            }
        }
    ]);

    const overallAverage = result.length > 0
        ? result.reduce((sum, item) => sum + item.percentage, 0) / result.length
        : 0;

    return {
        subjects: result,
        overallAverage: overallAverage.toFixed(2)
    };
};

// Apply tenant isolation plugin
gradeSchema.plugin(tenantIsolationPlugin);

const Grade = mongoose.model('Grade', gradeSchema);
export default Grade;
