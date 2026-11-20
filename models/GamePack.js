import mongoose from 'mongoose';
import { PRACTICE_QUESTION_TYPES, resolvePracticeQuestionType } from '../constants/practiceQuestionTypes.js';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { objectiveAnswerDefinitionSchemas } from './questionAnswerDefinitions.js';

// Item schemas live in their own Schema objects. Inside an inline array
// element definition Mongoose reads a `type` key as the element type, which
// silently turns the array into strings.
const gameOptionSchema = new mongoose.Schema({
    id: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 500 }
}, { _id: false });

export const gameItemSchema = new mongoose.Schema({
    externalId: { type: String, required: true, trim: true, maxlength: 80 },
    // Canonical shared type names. Legacy 'mcq'/'fill_blank' documents are
    // normalized by resolvePracticeQuestionType on every read/write path.
    type: { type: String, enum: PRACTICE_QUESTION_TYPES, required: true },
    prompt: { type: String, required: true, trim: true, maxlength: 1000 },
    options: { type: [gameOptionSchema], default: undefined },
    correctOptionId: { type: String, trim: true, default: '' },
    correctAnswer: { type: String, trim: true, maxlength: 2000, default: '' },
    acceptedAnswers: { type: [String], default: [] },
    ...objectiveAnswerDefinitionSchemas,
    explanation: { type: String, trim: true, maxlength: 1000, default: '' },
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSkill', required: true },
    difficulty: { type: Number, min: 1, max: 3, default: 2 }
}, { _id: false });

// Documents written before the canonical type names still hold `mcq`/`fill_blank`.
// Normalise during validation so any save of a parent document (closing an
// assignment, archiving a pack, pinning a revision) passes the enum check and
// repairs the stored value instead of rejecting the whole document.
gameItemSchema.pre('validate', function canonicalizeLegacyType(next) {
    if (this.type) this.type = resolvePracticeQuestionType(this.type);
    next();
});

const gameSkillSnapshotSchema = new mongoose.Schema({
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSkill', required: true },
    name: { type: String, required: true },
    nameAr: { type: String, default: '' },
    key: { type: String, default: '' }
}, { _id: false });

const gamePackRevisionSchema = new mongoose.Schema({
    version: { type: Number, required: true },
    publishedAt: { type: Date, required: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [gameItemSchema], default: [] },
    skills: { type: [gameSkillSnapshotSchema], default: [] }
}, { _id: false });

const gamePackSchema = new mongoose.Schema({
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
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        maxlength: 800,
        default: ''
    },
    language: {
        type: String,
        enum: ['en', 'ar', 'mixed'],
        default: 'en'
    },
    gradeLevels: { type: [String], default: [] },
    // Null = General. Seeded from the default skill on create; the board
    // dimension for every subject.
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        default: null
    },
    skillIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameSkill'
    }],
    // The skill the pack was created for. skillIds stays derived from the
    // items; this keeps an empty pack in its skill and seeds new questions.
    defaultSkillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameSkill',
        default: null
    },
    // Compare-and-set token for every authoring write. Unrelated to
    // publishedRevision.version, which numbers student-facing snapshots.
    authoringRevision: { type: Number, default: 0 },
    visibility: {
        type: String,
        enum: ['private', 'school'],
        default: 'private'
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    items: { type: [gameItemSchema], default: [] },
    publishedRevision: { type: gamePackRevisionSchema, default: null }
}, { timestamps: true });

gamePackSchema.plugin(tenantIsolationPlugin);
gamePackSchema.index({ school: 1, key: 1 }, { unique: true });
gamePackSchema.index({ school: 1, status: 1, owner: 1 });
gamePackSchema.index({ school: 1, defaultSkillId: 1 });
gamePackSchema.index({ school: 1, subject: 1, status: 1 });

export default mongoose.model('GamePack', gamePackSchema);
