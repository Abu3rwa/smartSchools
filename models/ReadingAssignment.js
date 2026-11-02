import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const readingAssignmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: String, trim: true },
    text: { type: mongoose.Schema.Types.ObjectId, ref: 'SimplifiedText', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Assign to a class (all students) or specific students
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    dueDate: { type: Date },
    instructions: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // Readings created before publishing existed are treated as published.
    isPublished: { type: Boolean, default: true },
    publishAt: { type: Date, default: null },
    readingGate: {
      enabled: { type: Boolean, default: false },
      minReadSeconds: { type: Number, default: null, min: 0, max: 1800 },
      lockScope: {
        type: String,
        enum: ['quiz', 'quiz_and_thinking'],
        default: 'quiz_and_thinking'
      }
    },
    fluency: {
      enabled: { type: Boolean, default: false },
      parts: [{
        _id: false,
        key: { type: String, trim: true, required: true },
        level: { type: Number, default: null }
      }],
      minReadings: { type: Number, default: 3, min: 1, max: 10 },
      maxReadingsPerPart: { type: Number, default: 6, min: 1, max: 20 },
      targetAccuracy: { type: Number, default: 95, min: 0, max: 100 },
      targetWpm: { type: Number, default: null, min: 0, max: 400 },
      showPace: { type: Boolean, default: true },
      requireListenFirst: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

readingAssignmentSchema.index({ school: 1, text: 1 });
readingAssignmentSchema.index({ school: 1, class: 1 });
readingAssignmentSchema.index({ school: 1, students: 1 });
readingAssignmentSchema.index({ school: 1, academicYear: 1, students: 1, isActive: 1 });
readingAssignmentSchema.index({ school: 1, 'fluency.enabled': 1 });
readingAssignmentSchema.plugin(tenantIsolationPlugin);

const ReadingAssignment = mongoose.model('ReadingAssignment', readingAssignmentSchema);
export default ReadingAssignment;
