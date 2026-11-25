import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { isValidSpellingWeek } from '../utils/spellingProgress.js';

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
        min: 1,
        validate: {
            validator() {
                return isValidSpellingWeek(this.grade, this.week);
            },
            message: 'week is outside this grade'
        }
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
    definition: {
        type: String,
        default: '',
        trim: true,
        maxlength: 2000
    },
    normalizedWord: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
        validate: {
            validator: (value) => Boolean(value && value.trim()),
            message: 'normalizedWord cannot be empty'
        }
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
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revision: { type: Number, default: 1, min: 1 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastChangeId: { type: String, default: null, trim: true, maxlength: 80 }
}, {
    timestamps: true
});

// Active rows own a position and a text identity; archived rows reserve neither.
spellingWordSchema.index(
    { school: 1, grade: 1, week: 1, order: 1 },
    { unique: true, partialFilterExpression: { deletedAt: null } }
);
spellingWordSchema.index(
    { school: 1, grade: 1, week: 1, normalizedWord: 1 },
    { unique: true, partialFilterExpression: { deletedAt: null } }
);
spellingWordSchema.index({ school: 1, grade: 1, deletedAt: 1, week: 1, order: 1 });
spellingWordSchema.plugin(tenantIsolationPlugin);

const SpellingWord = mongoose.model('SpellingWord', spellingWordSchema);
export default SpellingWord;
