import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// Snapshot of a question at the time of assignment (so edits don't break live assignments)
const assignmentQuestionSchema = new mongoose.Schema(
    {
        questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
        questionText: { type: String, required: true, trim: true },
        questionType: { type: String, enum: ['multiple_choice', 'true_false', 'short_answer'], required: true },
        options: [{ label: String, text: String }],
        correctAnswer: { type: String, trim: true, default: '' },
        explanation: { type: String, trim: true, default: '' },
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
        points: { type: Number, default: 1, min: 0 },
    },
    { _id: false }
);

const socialStudiesAssignmentSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
        unit: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialStudiesUnit', required: true },
        lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialStudiesLesson', required: true },
        class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        instructions: { type: String, trim: true, default: '' },
        assignmentType: {
            type: String,
            enum: ['classwork', 'homework', 'quiz'],
            required: true,
            default: 'classwork',
        },
        questions: [assignmentQuestionSchema],
        totalPoints: { type: Number, default: 0, min: 0 },
        scope: { type: String, enum: ['class', 'selected_students'], default: 'class' },
        studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
        timeLimit: { type: Number, default: null, min: 60 },       // seconds; null = no limit
        maxAttempts: { type: Number, default: 1, min: 1 },
        dueDate: { type: Date, default: null },
        availability: {
            startAt: { type: Date, default: null },
            endAt: { type: Date, default: null },
        },
        academicYear: { type: String, trim: true, default: null },
        semester: { type: Number, enum: [1, 2], default: null },
        status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
        publishedAt: { type: Date, default: null },
        // Gradebook integration
        gradebookColumn: { type: mongoose.Schema.Types.ObjectId, ref: 'GradebookColumn', default: null },
        notifyStudents: { type: Boolean, default: true },
        notifyParents: { type: Boolean, default: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

socialStudiesAssignmentSchema.index({ school: 1, teacher: 1, academicYear: 1 });
socialStudiesAssignmentSchema.index({ school: 1, class: 1, academicYear: 1, semester: 1 });
socialStudiesAssignmentSchema.index({ school: 1, lesson: 1 });
socialStudiesAssignmentSchema.index({ school: 1, unit: 1 });
socialStudiesAssignmentSchema.index({ school: 1, class: 1, status: 1 });

socialStudiesAssignmentSchema.plugin(tenantIsolationPlugin);

const SocialStudiesAssignment = mongoose.model('SocialStudiesAssignment', socialStudiesAssignmentSchema);
export default SocialStudiesAssignment;
