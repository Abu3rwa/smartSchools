import logger from '../utils/logger.js';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import School from '../models/School.js';
import { syncStudentObjectiveMastery } from '../services/academicExcellenceService.js';
import { getEffectiveAcademicExcellenceThresholds } from '../services/academicExcellenceSettingsService.js';
import academicExcellenceNotificationService from '../services/academicExcellenceNotificationService.js';
import Student from '../models/Student.js';

/**
 * Triggered after a grade is saved/updated.
 * Re-evaluates mastery for the student + subject + class combination.
 */
export async function syncObjectivesForGrade({ schoolId, studentId, subjectId, classId, academicYear, semester }) {
    try {
        const result = await syncStudentObjectiveMastery({
            schoolId,
            studentId,
            subjectId,
            classId,
            academicYear,
            semester
        });

        // Check for mastery changes and send notifications
        if (result?.changes && result.changes.length > 0) {
            const student = await Student.findById(studentId).lean();
            if (student) {
                for (const change of result.changes) {
                    await academicExcellenceNotificationService.sendMasteryChangeNotification({
                        schoolId,
                        student,
                        objectiveKey: change.objectiveKey,
                        oldLevel: change.oldLevel,
                        newLevel: change.newLevel
                    });
                }
            }
        }

        return result;
    } catch (err) {
        logger.error('ae_sync_objectives_for_grade_error', {
            schoolId,
            studentId,
            subjectId,
            error: err?.message || String(err)
        });
        return null;
    }
}

/**
 * Nightly job: detect at-risk students across all schools.
 * Finds students with too many "not_met" objectives and sends alerts.
 */
export async function runAcademicExcellenceNightlyJob() {
    try {
        const schoolIds = await AcademicExcellenceObjective.distinct('school', {
            school: { $exists: true, $ne: null }
        });

        let alertsSent = 0;

        for (const schoolId of schoolIds) {
            const thresholds = await getEffectiveAcademicExcellenceThresholds(schoolId);
            const atRiskThreshold = thresholds?.atRiskNotMetCount || 3;

            // Find students with too many not_met objectives
            const atRisk = await AcademicExcellenceObjective.aggregate([
                { $match: { school: schoolId, masteryLevel: 'not_met' } },
                { $group: { _id: '$student', notMetCount: { $sum: 1 } } },
                { $match: { notMetCount: { $gte: atRiskThreshold } } }
            ]);

            for (const entry of atRisk) {
                const student = await Student.findById(entry._id).lean();
                if (!student) continue;

                await academicExcellenceNotificationService.sendAtRiskNotification({
                    schoolId,
                    student,
                    notMetCount: entry.notMetCount,
                    threshold: atRiskThreshold
                });
                alertsSent++;
            }
        }

        logger.info('ae_nightly_job_completed', {
            schoolsProcessed: schoolIds.length,
            alertsSent
        });

        return { schoolsProcessed: schoolIds.length, alertsSent };
    } catch (err) {
        logger.error('ae_nightly_job_failed', { error: err?.message || String(err) });
        throw err;
    }
}
