import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// A list is assigned to a whole class (class set) or to one student (student set, an override).
const vocabAssignmentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    listId: { type: String, required: true, uppercase: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null }
}, { timestamps: true });

vocabAssignmentSchema.index({ school: 1, listId: 1, class: 1, student: 1 }, { unique: true });
vocabAssignmentSchema.index({ school: 1, class: 1 });
vocabAssignmentSchema.index({ school: 1, student: 1 });
vocabAssignmentSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabAssignment', vocabAssignmentSchema);
