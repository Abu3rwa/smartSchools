import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sessionBillingNoteSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        index: true
    },
    body: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdByName: {
        type: String,
        trim: true,
        default: ''
    }
}, { timestamps: true });

sessionBillingNoteSchema.index({ school: 1, student: 1, createdAt: -1 });

sessionBillingNoteSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SessionBillingNote', sessionBillingNoteSchema);
