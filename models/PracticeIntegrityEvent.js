import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const practiceIntegrityEventSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StandardAssignment',
        required: true
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: true
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PracticeSession',
        default: null
    },
    attempt: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PracticeAttempt',
        default: null
    },
    eventType: {
        type: String,
        enum: ['tab_hidden', 'window_blur', 'visibility_visible', 'window_focus'],
        required: true
    },
    metadata: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

practiceIntegrityEventSchema.index({ school: 1, student: 1, assignment: 1, createdAt: -1 });
practiceIntegrityEventSchema.index({ school: 1, assignment: 1, createdAt: -1 });
practiceIntegrityEventSchema.index({ school: 1, session: 1, createdAt: -1 });

practiceIntegrityEventSchema.plugin(tenantIsolationPlugin);

const PracticeIntegrityEvent = mongoose.model('PracticeIntegrityEvent', practiceIntegrityEventSchema);
export default PracticeIntegrityEvent;
