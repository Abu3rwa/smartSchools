import mongoose from 'mongoose';

const gradeAuditLogSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    grade: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    action: { type: String, enum: ['create', 'update', 'delete'], required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    previousValues: { type: mongoose.Schema.Types.Mixed },
    newValues: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, maxlength: 500 },
}, { timestamps: true });

gradeAuditLogSchema.index({ school: 1, student: 1, createdAt: -1 });
gradeAuditLogSchema.index({ school: 1, grade: 1, createdAt: -1 });

const GradeAuditLog = mongoose.model('GradeAuditLog', gradeAuditLogSchema);
export default GradeAuditLog;
