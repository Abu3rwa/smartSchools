import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const practiceAttemptSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student is required']
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: [true, 'Standard is required']
    },
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StandardAssignment',
        required: [true, 'Assignment is required']
    },
    // Question details (AI-generated)
    questionText: {
        type: String,
        required: true
    },
    questionType: {
        type: String,
        enum: ['multiple_choice', 'short_answer', 'true_false'],
        required: true
    },
    options: [{
        label: { type: String },  // A, B, C, D
        text: { type: String }
    }],
    correctAnswer: {
        type: String,
        required: true
    },
    // Student response
    studentAnswer: {
        type: String,
        default: null
    },
    isCorrect: {
        type: Boolean,
        default: null
    },
    // AI evaluation feedback
    explanation: {
        type: String
    },
    feedback: {
        type: String
    },
    // Difficulty & sequencing
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    attemptNumber: {
        type: Number,
        required: true,
        min: 1
    },
    // Timing
    answeredAt: {
        type: Date
    },
    timeSpentSeconds: {
        type: Number,
        default: 0
    },
    // Status
    status: {
        type: String,
        enum: ['pending', 'answered', 'skipped'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
practiceAttemptSchema.index({ school: 1, student: 1, standard: 1 });
practiceAttemptSchema.index({ school: 1, student: 1, assignment: 1 });
practiceAttemptSchema.index({ school: 1, standard: 1, isCorrect: 1 });
practiceAttemptSchema.index({ student: 1, standard: 1, createdAt: -1 });

/**
 * Static: Calculate mastery for a student on a standard
 * Uses a rolling window of the last N attempts
 */
practiceAttemptSchema.statics.calculateMastery = async function (studentId, standardId, threshold = 80, minQuestions = 5) {
    const attempts = await this.find({
        student: studentId,
        standard: standardId,
        status: 'answered'
    }).sort({ createdAt: -1 }).limit(minQuestions);

    if (attempts.length < minQuestions) {
        return {
            isMastered: false,
            totalAttempts: attempts.length,
            correctCount: attempts.filter(a => a.isCorrect).length,
            percentage: attempts.length > 0
                ? Math.round((attempts.filter(a => a.isCorrect).length / attempts.length) * 100)
                : 0,
            needsMore: minQuestions - attempts.length
        };
    }

    const correctCount = attempts.filter(a => a.isCorrect).length;
    const percentage = Math.round((correctCount / attempts.length) * 100);

    return {
        isMastered: percentage >= threshold,
        totalAttempts: attempts.length,
        correctCount,
        percentage,
        needsMore: 0
    };
};

/**
 * Static: Get overall progress for a student across all standards
 */
practiceAttemptSchema.statics.getStudentProgress = async function (studentId, assignmentIds = []) {
    const match = { student: new mongoose.Types.ObjectId(studentId), status: 'answered' };
    if (assignmentIds.length > 0) {
        match.assignment = { $in: assignmentIds.map(id => new mongoose.Types.ObjectId(id)) };
    }

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$standard',
                totalAttempts: { $sum: 1 },
                correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
                lastAttemptDate: { $max: '$createdAt' }
            }
        },
        {
            $project: {
                standard: '$_id',
                totalAttempts: 1,
                correctCount: 1,
                percentage: {
                    $round: [{ $multiply: [{ $divide: ['$correctCount', '$totalAttempts'] }, 100] }, 0]
                },
                lastAttemptDate: 1
            }
        }
    ]);

    return result;
};

// Apply tenant isolation plugin
practiceAttemptSchema.plugin(tenantIsolationPlugin);

const PracticeAttempt = mongoose.model('PracticeAttempt', practiceAttemptSchema);
export default PracticeAttempt;
