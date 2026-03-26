import SubstitutionRequest from '../models/SubstitutionRequest.js';
import { notifySubRequestStakeholders } from './substitutionNotificationService.js';
import logger from '../utils/logger.js';

/**
 * Expire stale SUBMITTED requests (expiresAt passed).
 * Run as a scheduled job to keep status consistent without relying on read path.
 */
export async function expireStaleSubstitutionRequests() {
    const now = new Date();
    const staleRequests = await SubstitutionRequest.find({ status: 'SUBMITTED', expiresAt: { $lt: now } })
        .populate('absentTeacherId', 'firstName lastName')
        .populate('periods.periodId', 'name startTime endTime')
        .setOptions({ skipTenantFilter: true });

    let expiredCount = 0;
    for (const request of staleRequests) {
        request.status = 'EXPIRED';
        request.timeline.push({
            action: 'EXPIRED',
            by: null,
            at: new Date(),
            meta: { reason: 'Token expired (scheduled job)' }
        });
        await request.save();
        expiredCount += 1;

        const pendingAssignments = request.assignments.filter((a) => (a.status || 'PENDING') === 'PENDING');
        const pendingPeriodLines = pendingAssignments.length
            ? pendingAssignments.map((assignment) => {
                const assignmentPeriodId = assignment.periodId?._id?.toString() || assignment.periodId?.toString();
                const period = request.periods.find((p) => {
                    const periodId = p.periodId?._id?.toString() || p.periodId?.toString();
                    return periodId === assignmentPeriodId;
                });
                const periodObj = period?.periodId;
                const periodName = periodObj?.name || 'Period';
                const periodTime = periodObj?.startTime && periodObj?.endTime
                    ? `${periodObj.startTime}-${periodObj.endTime}`
                    : 'time not set';
                return `- ${periodName} (${periodTime})`;
            }).join('\n')
            : '- All periods require review';

        const clientBase = String(process.env.CLIENT_URL || '').replace(/\/+$/, '');
        const recreateUrl = clientBase
            ? `${clientBase}/portal/substitutions/create?replace=${request._id}`
            : '';
        const detailUrl = clientBase
            ? `${clientBase}/portal/substitutions/${request._id}`
            : '';

        const absentTeacherName = [request.absentTeacherId?.firstName, request.absentTeacherId?.lastName]
            .filter(Boolean)
            .join(' ') || 'Teacher';
        const message = [
            'A substitution request expired without a complete response.',
            `Absent teacher: ${absentTeacherName}`,
            `Date: ${new Date(request.date).toLocaleDateString()}`,
            'Uncovered periods:',
            pendingPeriodLines,
            detailUrl ? `Request details: ${detailUrl}` : null,
            recreateUrl ? `Re-create request: ${recreateUrl}` : null
        ].filter(Boolean).join('\n');

        const htmlContent = `
<div style="font-family:sans-serif;color:#0f172a;max-width:620px;">
  <h2 style="margin:0 0 12px;">Substitution Request Expired</h2>
  <p style="margin:0 0 8px;">A substitution request expired without full coverage confirmation.</p>
  <p style="margin:0 0 8px;"><strong>Absent teacher:</strong> ${absentTeacherName}</p>
  <p style="margin:0 0 8px;"><strong>Date:</strong> ${new Date(request.date).toLocaleDateString()}</p>
  <h3 style="margin:12px 0 8px;">Uncovered periods</h3>
  <pre style="margin:0 0 12px;padding:10px;background:#f8fafc;border-radius:6px;white-space:pre-wrap;">${pendingPeriodLines}</pre>
  ${detailUrl ? `<p style="margin:0 0 8px;"><a href="${detailUrl}">Open request details</a></p>` : ''}
  ${recreateUrl ? `<p style="margin:0;"><a href="${recreateUrl}">Create replacement request</a></p>` : ''}
</div>`;

        await notifySubRequestStakeholders({
            schoolId: request.school,
            departmentId: request.department || null,
            createdBy: request.createdBy || null,
            requestId: request._id,
            subject: 'Substitution request expired',
            message,
            htmlContent,
            metadata: { event: 'sub_request_expired' }
        });
    }

    if (expiredCount > 0) {
        logger.info(`Substitution expiry job: marked ${expiredCount} request(s) as EXPIRED`);
    }
    return expiredCount;
}
