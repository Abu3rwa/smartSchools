import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { WRITING_TYPES, normalizeWritingType } from '../constants/writingPresets.js';

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    kind: { type: String, trim: true, default: 'body' },
    instructions: { type: String, trim: true, default: '' },
    required: { type: Boolean, default: true },
    repeatable: { type: Boolean, default: false },
    minCount: { type: Number, default: 1, min: 1, max: 12 },
    maxCount: { type: Number, default: 1, min: 1, max: 12 },
    minWords: { type: Number, default: 0, min: 0, max: 5000 },
    criteria: [{ type: String, trim: true }]
  },
  { _id: false }
);

const rubricSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    maxScore: { type: Number, required: true, min: 0, max: 100 },
    appliesToSections: [{ type: String, trim: true }]
  },
  { _id: false }
);

const supportsSchema = new mongoose.Schema(
  {
    wordBank: [{ type: String, trim: true }],
    transitions: [{ type: String, trim: true }],
    sentenceStarters: [{ type: String, trim: true }],
    guidingQuestions: [{ type: String, trim: true }],
    modelText: { type: String, trim: true, default: '' },
    plannerPrompt: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const workflowSchema = new mongoose.Schema(
  {
    teacherPublishesFeedback: { type: Boolean, default: true },
    requireNotebookCheck: { type: Boolean, default: true },
    autoSuggestNextStep: { type: Boolean, default: true }
  },
  { _id: false }
);

const writingAssignmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true, default: '' },
    writingType: {
      type: String,
      enum: WRITING_TYPES,
      default: 'essay',
      set: normalizeWritingType
    },
    topic: { type: String, trim: true, default: '' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    // "class" means every student on the roster; "selected" means a subset of
    // that class. Missing on older documents, which were always whole-class.
    audienceMode: { type: String, enum: ['class', 'selected'], default: 'class' },
    dueDate: { type: Date },
    isActive: { type: Boolean, default: true },
    isTemplate: { type: Boolean, default: false },
    minWords: { type: Number, default: 0, min: 0, max: 5000 },
    maxWords: { type: Number, default: 0, min: 0, max: 5000 },
    expectedLevel: { type: String, trim: true, default: '' },
    goals: [
      {
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
        text: { type: String, trim: true }
      }
    ],
    sections: {
      type: [sectionSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'A writing assignment needs at least one section.'
      }
    },
    supports: { type: supportsSchema, default: () => ({}) },
    rubric: { type: [rubricSchema], default: [] },
    workflow: { type: workflowSchema, default: () => ({}) },
    aiConstraints: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

writingAssignmentSchema.virtual('totalPoints').get(function getTotalPoints() {
  return (this.rubric || []).reduce((sum, criterion) => sum + (Number(criterion.maxScore) || 0), 0);
});

writingAssignmentSchema.index({ school: 1, isActive: 1, isTemplate: 1 });
writingAssignmentSchema.index({ school: 1, class: 1 });
writingAssignmentSchema.index({ school: 1, assignedBy: 1 });
writingAssignmentSchema.plugin(tenantIsolationPlugin);

const WritingAssignment = mongoose.model('WritingAssignment', writingAssignmentSchema);
export default WritingAssignment;
