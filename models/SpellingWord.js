import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingWordSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    grade: {
        type: String,
        enum: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'],
        required: true,
        uppercase: true,
        trim: true
    },
    week: {
        type: Number,
        required: true,
        min: 1
    },
    category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    word: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    normalizedWord: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    order: {
        type: Number,
        required: true,
        min: 1
    },
    sourceImportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ImportRun',
        default: null
    }
}, {
    timestamps: true
});

spellingWordSchema.index({ school: 1, grade: 1, week: 1, order: 1 }, { unique: true });
spellingWordSchema.plugin(tenantIsolationPlugin);

const SpellingWord = mongoose.model('SpellingWord', spellingWordSchema);
export default SpellingWord;
