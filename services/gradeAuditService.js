import GradeAuditLog from '../models/GradeAuditLog.js';

/**
 * Log a grade change to the audit trail. Fire-and-forget (does not block the response).
 */
export const logGradeAudit = ({ schoolId, gradeId, studentId, subjectId, classId, action, changedBy, previousValues, newValues, reason }) => {
    GradeAuditLog.create({
        school: schoolId,
        grade: gradeId,
        student: studentId,
        subject: subjectId,
        class: classId,
        action,
        changedBy,
        previousValues: previousValues || undefined,
        newValues: newValues || undefined,
        reason: reason || undefined,
    }).catch(err => {
        console.error('[GradeAudit] Failed to write audit log:', err.message);
    });
};

/**
 * Log multiple grade changes in bulk. Fire-and-forget.
 */
export const logGradeAuditBulk = (entries) => {
    if (!entries.length) return;
    GradeAuditLog.insertMany(entries.map(e => ({
        school: e.schoolId,
        grade: e.gradeId,
        student: e.studentId,
        subject: e.subjectId,
        class: e.classId,
        action: e.action,
        changedBy: e.changedBy,
        previousValues: e.previousValues || undefined,
        newValues: e.newValues || undefined,
        reason: e.reason || undefined,
    })), { ordered: false }).catch(err => {
        console.error('[GradeAudit] Failed to write bulk audit log:', err.message);
    });
};
