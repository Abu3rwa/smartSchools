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
  },
  { timestamps: true }
);

readingAssignmentSchema.index({ school: 1, text: 1 });
readingAssignmentSchema.index({ school: 1, class: 1 });
readingAssignmentSchema.index({ school: 1, students: 1 });
readingAssignmentSchema.index({ school: 1, academicYear: 1, students: 1, isActive: 1 });
readingAssignmentSchema.plugin(tenantIsolationPlugin);

const ReadingAssignment = mongoose.model('ReadingAssignment', readingAssignmentSchema);
export default ReadingAssignment;
