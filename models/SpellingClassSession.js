import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const participantSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', default: null },
    submittedWord: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', default: null },
    correct: { type: Boolean, default: false }
}, { _id: false });

const spellingClassSessionSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    grade: {
        type: String,
        enum: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'],
        required: true
    },
    currentWord: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', default: null },
    status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
    participants: { type: [participantSchema], default: [] }
}, { timestamps: true });

spellingClassSessionSchema.index({ school: 1, class: 1, grade: 1 }, { unique: true });
spellingClassSessionSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SpellingClassSession', spellingClassSessionSchema);
