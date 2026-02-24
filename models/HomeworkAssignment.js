import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const homeworkAssignmentSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        academicYear: {
            type: String,
            required: true,
            index: true
        },
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true,
            index: true
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            required: true,
            index: true
        },
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teacher',
            required: true,
            index: true
        },
        lessonPlan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LessonPlan',
            default: null,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        instructions: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000
        },
        dueDate: {
            type: Date,
            required: true,
            index: true
        },
        assignedDate: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['draft', 'published', 'closed', 'archived'],
            default: 'draft',
            index: true
        },
        scope: {
            type: String,
            enum: ['class', 'selected_students'],
            default: 'class'
        },
        studentIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Student'
            }
        ],
        maxMarks: {
            type: Number,
            default: 10,
            min: 1
        },
        allowLateSubmission: {
            type: Boolean,
            default: false
        },
        notifyParentsOnPost: {
            type: Boolean,
            default: true
        },
        postedAt: {
            type: Date,
            default: null
        },
        postedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    {
        timestamps: true
    }
);

homeworkAssignmentSchema.index({ school: 1, class: 1, status: 1, dueDate: 1 });
homeworkAssignmentSchema.index({ school: 1, teacher: 1, status: 1, dueDate: -1 });
homeworkAssignmentSchema.index({ school: 1, lessonPlan: 1 });

homeworkAssignmentSchema.plugin(tenantIsolationPlugin);

const HomeworkAssignment = mongoose.model('HomeworkAssignment', homeworkAssignmentSchema);

export default HomeworkAssignment;
