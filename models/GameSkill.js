import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// A named learning target. Standards are references to the existing catalog,
// never a new standards database.
const gameSkillSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    key: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160
    },
    nameAr: {
        type: String,
        trim: true,
        maxlength: 160,
        default: ''
    },
    description: {
        type: String,
        trim: true,
        maxlength: 600,
        default: ''
    },
    learningGoal: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },
    category: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
    },
    gradeLevel: {
        type: String,
        trim: true,
        maxlength: 40,
        default: ''
    },
    // Null = General (untagged legacy content). References the school's
    // existing Subject catalog; never a separate subject list.
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        default: null
    },
    language: {
        type: String,
        enum: ['en', 'ar', 'mixed'],
        default: 'en'
    },
    standardIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard'
    }],
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    source: {
        type: String,
        enum: ['manual', 'import', 'material'],
        default: 'manual'
    },
    revision: {
        type: Number,
        default: 0
    },
    // Written inside every transaction that adds questions to the skill, so
    // a concurrent archive and a new reference cannot both commit.
    lastReferencedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

gameSkillSchema.plugin(tenantIsolationPlugin);
gameSkillSchema.index({ school: 1, key: 1 }, { unique: true });
gameSkillSchema.index({ school: 1, status: 1, gradeLevel: 1 });
gameSkillSchema.index({ school: 1, subject: 1, status: 1 });

export default mongoose.model('GameSkill', gameSkillSchema);
