import mongoose from 'mongoose';

const lessonPlanCriteriaSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  weight: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  minScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 60
  },
  isRequired: {
    type: Boolean,
    default: true
  },
  evaluationPrompt: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

lessonPlanCriteriaSchema.index({ school: 1, isActive: 1, order: 1 });
lessonPlanCriteriaSchema.index({ school: 1, name: 1 }, { unique: true });

export default mongoose.model('LessonPlanCriteria', lessonPlanCriteriaSchema);
