import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// Durable link between an app assignment and the Google Classroom coursework created from it.
const assignmentClassroomLinkSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        assignment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Assignment',
            required: true
        },
        // The teacher whose Google account created the coursework. Only they can modify it.
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        courseId: {
            type: String,
            required: true,
            trim: true
        },
        // Class and subject at posting time; a later change means the Classroom course no longer matches.
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            required: true
        },
        courseWorkId: {
            type: String,
            trim: true,
            default: null
        },
        alternateLink: {
            type: String,
            trim: true,
            default: ''
        },
        syncState: {
            type: String,
            enum: ['pending', 'draft', 'published', 'failed'],
            default: 'pending'
        },
        // True once a due date was sent, so removing it later also clears it in Classroom.
        dueDateSynced: {
            type: Boolean,
            default: false
        },
        lastSyncedAt: {
            type: Date,
            default: null
        },
        lastErrorCode: {
            type: String,
            trim: true,
            default: ''
        },
        lastError: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ''
        }
    },
    { timestamps: true }
);

// One Classroom post per app assignment prevents duplicate coursework.
assignmentClassroomLinkSchema.index({ assignment: 1 }, { unique: true });
assignmentClassroomLinkSchema.index({ school: 1, createdBy: 1 });

assignmentClassroomLinkSchema.plugin(tenantIsolationPlugin);

const AssignmentClassroomLink = mongoose.model('AssignmentClassroomLink', assignmentClassroomLinkSchema);

export default AssignmentClassroomLink;
