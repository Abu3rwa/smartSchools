import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const vocabStudentPrefsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    listIds: { type: [String], default: [] },
    all: { type: Boolean, default: false }
}, { timestamps: true });

vocabStudentPrefsSchema.index({ school: 1, student: 1 }, { unique: true });
vocabStudentPrefsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabStudentPrefs', vocabStudentPrefsSchema);
