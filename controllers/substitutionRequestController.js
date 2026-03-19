import { asyncHandler } from '../middleware/errorHandler.js';
import SubstitutionRequest from '../models/SubstitutionRequest.js';
import Teacher from '../models/Teacher.js';
import TeacherAbsence from '../models/TeacherAbsence.js';
import User from '../models/User.js';
import { getCandidates } from '../services/substitutionCandidateService.js';
import { createRequest, processResponse } from '../services/substitutionWorkflowService.js';
import { notifySubRequestStakeholders, notifyTeacherPortalResponse } from '../services/substitutionNotificationService.js';
import { applyDepartmentScope, enforceDepartmentOnWrite } from '../helpers/departmentScope.js';
import { resolveAcademicYearDateRangeForRequest, clampDateRangeToAcademicYear, isDateInAcademicYear } from '../helpers/academicYearScope.js';

/** Mark expired SUBMITTED requests as EXPIRED */
async function expireStaleRequests(schoolId) {
    await SubstitutionRequest.updateMany(
        { school: schoolId, status: 'SUBMITTED', expiresAt: { $lt: new Date() } },
        { $set: { status: 'EXPIRED' }, $push: { timeline: { action: 'EXPIRED', by: null, at: new Date(), meta: { reason: 'Token expired' } } } }
    );
}

function getSubstitutionYearScope(req) {
    return resolveAcademicYearDateRangeForRequest(req);
}

function formatPeriodSummary(request, assignment) {
    const periodObj = assignment?.periodId;
    const periodName = periodObj?.name || 'Period';
    const time = periodObj?.startTime && periodObj?.endTime
        ? `${periodObj.startTime}-${periodObj.endTime}`
        : 'time not set';
    return `${periodName} (${time})`;
}

/**
 * @desc    Register a teacher absence (so they are excluded from candidate lists)
 * @route   POST /api/substitutions/absences
 * @access  Private (department_principal, admin)
 */
export const createAbsenceHandler = asyncHandler(async (req, res) => {
    const { teacherId, date, reason } = req.body;
    const schoolId = req.schoolId;
    const { academicYear, dateFilter } = getSubstitutionYearScope(req);

    const teacher = await User.findById(teacherId).select('role school').setOptions({ skipTenantFilter: true });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    if (teacher.role !== 'teacher') return res.status(400).json({ success: false, message: 'Must be a teacher' });
    if (teacher.school?.toString() !== schoolId.toString()) return res.status(403).json({ success: false, message: 'Teacher must belong to your school' });

    if (req.departmentId) {
        const teacherProfile = await Teacher.findOne({ user: teacherId, school: schoolId }).select('department').setOptions({ skipTenantFilter: true });
        if (!teacherProfile?.department || teacherProfile.department.toString() !== req.departmentId.toString()) {
            return res.status(403).json({ success: false, message: 'Teacher must be in your department' });
        }
    }

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (!isDateInAcademicYear(d, dateFilter)) {
        return res.status(400).json({
            success: false,
            message: `Absence date must be inside academic year ${academicYear}`
        });
    }

    const existing = await TeacherAbsence.findOne({ school: schoolId, teacher: teacherId, date: d });
    if (existing) return res.status(400).json({ success: false, message: 'Absence already registered for this date' });

    const absence = await TeacherAbsence.create({
        school: schoolId,
        teacher: teacherId,
        date: d,
        reason: reason || '',
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: { absence, academicYear }, message: 'Absence registered' });
});

/**
 * @desc    Get substitution candidates for an absent teacher on a date
 * @route   POST /api/substitutions/candidates
 * @access  Private (department_principal, admin)
 */
export const getCandidatesHandler = asyncHandler(async (req, res) => {
    const { absentTeacherId, date } = req.body;
    const schoolId = req.schoolId;
    const { academicYear, dateFilter } = getSubstitutionYearScope(req);
    const targetDate = new Date(date);
    if (!isDateInAcademicYear(targetDate, dateFilter)) {
        return res.status(400).json({
            success: false,
            message: `Date must be inside academic year ${academicYear}`
        });
    }

    const absentTeacher = await User.findById(absentTeacherId)
        .select('role school')
        .setOptions({ skipTenantFilter: true });

    if (!absentTeacher) {
        return res.status(404).json({ success: false, message: 'Absent teacher not found' });
    }
    if (absentTeacher.role !== 'teacher') {
        return res.status(400).json({ success: false, message: 'Absent teacher must be a teacher' });
    }
    if (absentTeacher.school?.toString() !== schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Teacher must belong to your school' });
    }

    const result = await getCandidates({ schoolId, absentTeacherId, date, departmentId: req.departmentId || undefined });
    res.status(200).json({ success: true, data: { ...result, academicYear } });
});

/**
 * @desc    Create a substitution request
 * @route   POST /api/substitutions
 * @access  Private (department_principal, admin)
 */
export const createRequestHandler = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const user = req.user;
    const { absentTeacherId, date, coverageType, periods, selections, principalNote, materialsLink, expiresInHours } = req.body;
    const { academicYear, dateFilter } = getSubstitutionYearScope(req);
    if (!isDateInAcademicYear(new Date(date), dateFilter)) {
        return res.status(400).json({
            success: false,
            message: `Request date must be inside academic year ${academicYear}`
        });
    }

    const payload = { department: req.body.departmentId || req.departmentId };
    const enforced = enforceDepartmentOnWrite(payload, req.departmentId);
    if (!enforced.allowed) {
        return res.status(403).json({ success: false, message: enforced.message });
    }
    const departmentId = payload.department;

    const request = await createRequest({
        schoolId,
        departmentId,
        absentTeacherId,
        date,
        coverageType,
        periods,
        selections,
        principalNote,
        materialsLink,
        expiresInHours,
        createdBy: user._id
    });

    const populated = await SubstitutionRequest.findById(request._id)
        .populate('absentTeacherId', 'firstName lastName email')
        .populate('assignments.substituteTeacherId', 'firstName lastName email')
        .populate('assignments.periodId', 'name startTime endTime')
        .populate('periods.periodId', 'name startTime endTime')
        .populate('periods.classId', 'name grade section')
        .populate('periods.roomId', 'name')
        .populate('periods.subjectId', 'name code')
        .populate('createdBy', 'firstName lastName');

    res.status(201).json({
        success: true,
        message: 'Substitution request created. Substitute teacher(s) have been notified.',
        data: {
            _id: populated._id,
            status: populated.status,
            date: populated.date,
            absentTeacherId: populated.absentTeacherId,
            coverageType: populated.coverageType,
            periods: populated.periods,
            assignments: populated.assignments,
            principalNote: populated.principalNote,
            expiresAt: populated.expiresAt,
            timeline: populated.timeline,
            createdBy: populated.createdBy,
            academicYear
        }
    });
});

/**
 * @desc    List substitution requests (role-scoped)
 * @route   GET /api/substitutions
 * @access  Private (department_principal, admin, teacher)
 */
export const listRequestsHandler = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const user = req.user;
    const { academicYear, dateFilter } = getSubstitutionYearScope(req);

    await expireStaleRequests(schoolId);
    const { startDate, endDate, status, absentTeacherId, substituteTeacherId, page = 1, limit = 20 } = req.query;

    const query = { school: schoolId };

    if (user.role === 'teacher') {
        query['assignments.substituteTeacherId'] = user._id;
    } else {
        applyDepartmentScope(query, req.departmentId);
        if (req.queryFilter?.departmentId) query.department = req.queryFilter.departmentId;
    }

    if (status) query.status = status;
    if (user.role !== 'teacher') {
        if (absentTeacherId) query.absentTeacherId = absentTeacherId;
        if (substituteTeacherId) query['assignments.substituteTeacherId'] = substituteTeacherId;
    }

    const requestedDateRange = {};
    if (startDate) requestedDateRange.$gte = new Date(startDate);
    if (endDate) requestedDateRange.$lte = new Date(endDate);
    const scopedDateRange = clampDateRangeToAcademicYear(requestedDateRange, dateFilter);
    if (!scopedDateRange) {
        return res.status(200).json({
            success: true,
            data: {
                requests: [],
                pagination: {
                    page: parseInt(page, 10),
                    limit: parseInt(limit, 10),
                    total: 0,
                    pages: 0
                },
                academicYear
            }
        });
    }
    query.date = scopedDateRange;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [requests, total] = await Promise.all([
        SubstitutionRequest.find(query)
            .populate('absentTeacherId', 'firstName lastName email')
            .populate('assignments.substituteTeacherId', 'firstName lastName email')
            .populate('assignments.periodId', 'name startTime endTime')
            .populate('createdBy', 'firstName lastName')
            .sort({ date: -1, createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit, 10))
            .lean(),
        SubstitutionRequest.countDocuments(query)
    ]);

    res.status(200).json({
        success: true,
        data: {
            requests,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total,
                pages: Math.ceil(total / parseInt(limit, 10))
            },
            academicYear
        }
    });
});

/**
 * @desc    Get a single substitution request
 * @route   GET /api/substitutions/:id
 * @access  Private (role-based)
 */
export const getRequestHandler = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = getSubstitutionYearScope(req);
    await expireStaleRequests(req.schoolId);
    const request = await SubstitutionRequest.findById(req.params.id)
        .populate('absentTeacherId', 'firstName lastName email')
        .populate('assignments.substituteTeacherId', 'firstName lastName email')
        .populate('assignments.periodId', 'name startTime endTime')
        .populate('periods.periodId', 'name startTime endTime')
        .populate('periods.classId', 'name grade section')
        .populate('periods.roomId', 'name')
        .populate('periods.subjectId', 'name code')
        .populate('createdBy', 'firstName lastName')
        .populate('timeline.by', 'firstName lastName');

    if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
    }
    if (!isDateInAcademicYear(request.date, dateFilter)) {
        return res.status(404).json({ success: false, message: `Request not found for academic year ${academicYear}` });
    }

    if (request.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this request' });
    }

    const user = req.user;
    if (user.role === 'teacher') {
        const isAssigned = request.assignments?.some(
            a => a.substituteTeacherId?._id?.toString() === user._id.toString() ||
                a.substituteTeacherId?.toString() === user._id.toString()
        );
        const isAbsent = request.absentTeacherId?._id?.toString() === user._id.toString() ||
            request.absentTeacherId?.toString() === user._id.toString();
        if (!isAssigned && !isAbsent) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this request' });
        }
    } else if (req.departmentId) {
        const reqDept = request.department?.toString();
        const scopeDept = req.departmentId.toString();
        if (!reqDept || reqDept !== scopeDept) {
            return res.status(403).json({ success: false, message: 'Not in your department' });
        }
    }

    res.status(200).json({ success: true, data: { ...request.toObject(), academicYear } });
});

/**
 * @desc    Cancel a substitution request
 * @route   POST /api/substitutions/:id/cancel
 * @access  Private (department_principal, admin)
 */
export const cancelRequestHandler = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = getSubstitutionYearScope(req);
    const request = await SubstitutionRequest.findById(req.params.id);

    if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!isDateInAcademicYear(request.date, dateFilter)) {
        return res.status(404).json({ success: false, message: `Request not found for academic year ${academicYear}` });
    }

    if (request.status !== 'SUBMITTED') {
        return res.status(400).json({
            success: false,
            message: `Cannot cancel request with status ${request.status}. Only SUBMITTED requests can be cancelled.`
        });
    }

    if (req.departmentId) {
        const reqDept = request.department?.toString();
        const scopeDept = req.departmentId.toString();
        if (!reqDept || reqDept !== scopeDept) {
            return res.status(403).json({ success: false, message: 'Not in your department' });
        }
    }

    request.status = 'CANCELLED';
    request.timeline.push({
        action: 'CANCELLED',
        by: req.user._id,
        at: new Date(),
        meta: { note: req.body.note || 'Request cancelled' }
    });
    await request.save();

    const populated = await SubstitutionRequest.findById(request._id)
        .populate('absentTeacherId', 'firstName lastName')
        .populate('assignments.substituteTeacherId', 'firstName lastName')
        .populate('createdBy', 'firstName lastName');

    res.status(200).json({
        success: true,
        message: 'Request cancelled',
        data: { ...populated.toObject(), academicYear }
    });
});

/**
 * @desc    Respond to substitution request (confirm/decline) via token
 * @route   POST /api/substitutions/respond
 * @route   GET /api/substitutions/respond?token=... (redirect to frontend response page)
 * @access  Public (token-based, rate-limited)
 */
export const respondHandler = asyncHandler(async (req, res) => {
    const { token, action, note } = req.body;
    const clientIp = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;
    const request = await processResponse({ token, action, note, meta: { ip: clientIp, userAgent } });

    const populated = await SubstitutionRequest.findById(request._id)
        .populate('absentTeacherId', 'firstName lastName')
        .populate('assignments.substituteTeacherId', 'firstName lastName')
        .populate('assignments.periodId', 'name startTime endTime');

    const result = {
        success: true,
        message: action === 'CONFIRM' ? 'Substitution confirmed' : 'Substitution declined',
        data: populated
    };

    if (action === 'DECLINE') {
        const detailUrlBase = String(process.env.CLIENT_URL || '').replace(/\/+$/, '');
        const detailUrl = detailUrlBase ? `${detailUrlBase}/portal/substitutions/${request._id}` : '';
        const replacementUrl = detailUrlBase ? `${detailUrlBase}/portal/substitutions/create?replace=${request._id}` : '';
        const declinedAssignments = (populated.assignments || []).filter((a) => a.status === 'DECLINED');
        const periodLines = declinedAssignments.length
            ? declinedAssignments.map((assignment) => {
                const periodName = assignment.periodId?.name || 'Period';
                const time = assignment.periodId?.startTime && assignment.periodId?.endTime
                    ? `${assignment.periodId.startTime}-${assignment.periodId.endTime}`
                    : 'time not set';
                return `- ${periodName} (${time})`;
            }).join('\n')
            : '- See request details in portal';

        const message = [
            'A substitute teacher declined a substitution request via email link.',
            `Request date: ${new Date(populated.date).toLocaleDateString()}`,
            'Declined periods:',
            periodLines,
            note ? `Teacher note: ${note}` : null,
            detailUrl ? `Request details: ${detailUrl}` : null,
            replacementUrl ? `Create replacement: ${replacementUrl}` : null
        ].filter(Boolean).join('\n');

        const htmlContent = `
<div style="font-family:sans-serif;color:#1f2937;max-width:620px;">
  <h2 style="margin:0 0 12px;">Substitution Request Declined</h2>
  <p style="margin:0 0 8px;">A substitute teacher declined a substitution request via email link.</p>
  <p style="margin:0 0 8px;"><strong>Request date:</strong> ${new Date(populated.date).toLocaleDateString()}</p>
  <h3 style="margin:12px 0 8px;">Declined periods</h3>
  <pre style="margin:0 0 12px;padding:10px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;">${periodLines}</pre>
  ${note ? `<p style="margin:0 0 8px;"><strong>Teacher note:</strong> ${note}</p>` : ''}
  ${detailUrl ? `<p style="margin:0 0 8px;"><a href="${detailUrl}">Open request details</a></p>` : ''}
  ${replacementUrl ? `<p style="margin:0;"><a href="${replacementUrl}">Create replacement request</a></p>` : ''}
</div>`;

        await notifySubRequestStakeholders({
            schoolId: populated.school,
            departmentId: populated.department || null,
            createdBy: populated.createdBy || null,
            requestId: populated._id,
            subject: 'Substitution request declined',
            message,
            htmlContent,
            metadata: { event: 'sub_declined_via_token' }
        });
    }

    if (req.method === 'GET') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Substitution ${action}</title></head><body style="font-family:sans-serif;max-width:480px;margin:2rem auto;padding:1rem;"><h2>${result.message}</h2><p>Thank you for your response. You may close this window.</p></body></html>`;
        return res.status(200).type('text/html').send(html);
    }
    res.status(200).json(result);
});

/**
 * @desc    Respond to substitution request (confirm/decline/withdraw) in portal as the logged-in teacher
 * @route   POST /api/substitutions/:id/respond-auth
 * @access  Private (teacher)
 */
export const respondAuthHandler = asyncHandler(async (req, res) => {
    const { action, note, assignmentId } = req.body;
    const user = req.user;
    const { academicYear, dateFilter } = getSubstitutionYearScope(req);

    if (user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Only teachers can respond in portal' });
    }

    const request = await SubstitutionRequest.findById(req.params.id)
        .populate('assignments.periodId', 'name startTime endTime')
        .setOptions({ skipTenantFilter: true });

    if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!isDateInAcademicYear(request.date, dateFilter)) {
        return res.status(404).json({ success: false, message: `Request not found for academic year ${academicYear}` });
    }

    // WITHDRAW is allowed even when status isn't SUBMITTED (e.g. already CONFIRMED request)
    if (action !== 'WITHDRAW' && request.status !== 'SUBMITTED') {
        return res.status(400).json({
            success: false,
            message: `Request is no longer pending (status: ${request.status})`
        });
    }

    const teacherId = user._id;
    const myAssignments = request.assignments.filter(
        (a) => a.substituteTeacherId?.toString() === teacherId.toString()
    );
    if (myAssignments.length === 0) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this request' });
    }

    const trimmedNote = (note || '').trim();
    const isPerPeriod = request.coverageType === 'PER_PERIOD';
    const selectedAssignment = assignmentId
        ? myAssignments.find((a) => a._id.toString() === assignmentId.toString())
        : null;

    if (assignmentId && !selectedAssignment) {
        return res.status(400).json({ success: false, message: 'assignmentId does not belong to your assignments' });
    }

    const affectedAssignments = [];

    const recomputeRequestStatus = () => {
        if (request.assignments.some((a) => a.status === 'DECLINED')) {
            request.status = 'DECLINED';
            return;
        }
        if (request.assignments.every((a) => a.status === 'CONFIRMED')) {
            request.status = 'CONFIRMED';
            return;
        }
        request.status = 'SUBMITTED';
    };

    if (action === 'CONFIRM') {
        const confirmTargets = selectedAssignment
            ? [selectedAssignment]
            : myAssignments;
        const hasPending = confirmTargets.some(a => (a.status || 'PENDING') === 'PENDING');
        if (!hasPending) {
            return res.status(400).json({ success: false, message: 'No pending assignment to confirm' });
        }
        for (const assignment of confirmTargets) {
            if ((assignment.status || 'PENDING') === 'PENDING') {
                assignment.status = 'CONFIRMED';
                assignment.teacherResponseNote = trimmedNote;
                affectedAssignments.push(assignment);
            }
        }

        if (request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS' && !selectedAssignment) {
            for (const a of request.assignments) {
                a.status = 'CONFIRMED';
                if (!a.teacherResponseNote) a.teacherResponseNote = trimmedNote;
            }
            request.status = 'CONFIRMED';
        } else {
            recomputeRequestStatus();
        }

    } else if (action === 'DECLINE') {
        const declineTargets = selectedAssignment
            ? [selectedAssignment]
            : myAssignments;

        for (const assignment of declineTargets) {
            assignment.status = 'DECLINED';
            assignment.teacherResponseNote = trimmedNote;
            affectedAssignments.push(assignment);
        }

        if (request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS' && !selectedAssignment) {
            for (const a of request.assignments) {
                if (!myAssignments.some((m) => m._id.toString() === a._id.toString())) {
                    a.status = 'DECLINED';
                }
            }
        }
        recomputeRequestStatus();

    } else if (action === 'WITHDRAW') {
        const diffMs = new Date(request.date).getTime() - Date.now();
        const withdrawDeadlineMs = 24 * 60 * 60 * 1000;
        if (Number.isFinite(diffMs) && diffMs < withdrawDeadlineMs) {
            const detailUrlBase = String(process.env.CLIENT_URL || '').replace(/\/+$/, '');
            const detailUrl = detailUrlBase ? `${detailUrlBase}/portal/substitutions/${request._id}` : '';
            const message = [
                `${user.firstName || 'A teacher'} ${user.lastName || ''}`.trim() + ' attempted a late withdrawal.',
                `Request date: ${new Date(request.date).toLocaleDateString()}`,
                detailUrl ? `Review: ${detailUrl}` : null
            ].filter(Boolean).join('\n');

            const htmlContent = `
<div style="font-family:sans-serif;color:#1f2937;max-width:620px;">
  <h2 style="margin:0 0 12px;">Late Withdrawal Attempt</h2>
  <p style="margin:0 0 8px;">A teacher attempted to withdraw less than 24 hours before the absence date.</p>
  <p style="margin:0 0 8px;"><strong>Teacher:</strong> ${user.firstName || ''} ${user.lastName || ''}</p>
  <p style="margin:0 0 8px;"><strong>Request date:</strong> ${new Date(request.date).toLocaleDateString()}</p>
  ${trimmedNote ? `<p style="margin:0 0 8px;"><strong>Teacher note:</strong> ${trimmedNote}</p>` : ''}
  ${detailUrl ? `<p style="margin:12px 0 0;"><a href="${detailUrl}">Open request in portal</a></p>` : ''}
</div>`;

            await notifySubRequestStakeholders({
                schoolId: request.school,
                departmentId: request.department || null,
                createdBy: user._id,
                requestId: request._id,
                subject: 'Late substitution withdrawal attempt',
                message,
                htmlContent,
                metadata: { event: 'sub_withdraw_late_attempt', actorTeacherId: teacherId.toString() }
            });

            return res.status(400).json({
                success: false,
                message: 'Withdraw is only allowed more than 24 hours before the absence date'
            });
        }

        // Teacher withdraws a previously confirmed assignment, reverting it to PENDING
        const withdrawTargets = selectedAssignment
            ? [selectedAssignment]
            : myAssignments;
        const hasConfirmed = withdrawTargets.some(a => a.status === 'CONFIRMED');
        if (!hasConfirmed) {
            return res.status(400).json({ success: false, message: 'No confirmed assignment to withdraw' });
        }
        for (const assignment of withdrawTargets) {
            if (assignment.status === 'CONFIRMED') {
                assignment.status = 'PENDING';
                assignment.teacherResponseNote = trimmedNote || 'Withdrawn by teacher';
                affectedAssignments.push(assignment);
            }
        }
        recomputeRequestStatus();

    } else {
        return res.status(400).json({ success: false, message: 'Invalid action. Use CONFIRM, DECLINE, or WITHDRAW.' });
    }

    if (isPerPeriod && assignmentId && affectedAssignments.length === 0) {
        return res.status(400).json({ success: false, message: 'No applicable assignment found for this action' });
    }

    request.timeline.push({
        action: action === 'CONFIRM' ? 'CONFIRMED' : action === 'DECLINE' ? 'DECLINED' : 'WITHDRAWN',
        by: teacherId,
        at: new Date(),
        meta: {
            note: trimmedNote || null,
            via: 'portal',
            assignmentIds: affectedAssignments.map((a) => a._id.toString())
        }
    });

    await request.save();

    const periodSummaries = affectedAssignments.map((assignment) => formatPeriodSummary(request, assignment));

    await notifyTeacherPortalResponse({
        schoolId: request.school,
        teacherId,
        requestId: request._id,
        action,
        date: request.date,
        periodSummaries,
        note: trimmedNote,
        createdBy: user._id
    });

    if (action === 'DECLINE' || action === 'WITHDRAW') {
        const detailUrlBase = String(process.env.CLIENT_URL || '').replace(/\/+$/, '');
        const detailUrl = detailUrlBase ? `${detailUrlBase}/portal/substitutions/${request._id}` : '';
        const replacementUrl = detailUrlBase ? `${detailUrlBase}/portal/substitutions/create?replace=${request._id}` : '';
        const humanAction = action === 'DECLINE' ? 'declined' : 'withdrew';
        const actorName = `${user.firstName || 'Teacher'} ${user.lastName || ''}`.trim();
        const periodList = periodSummaries.length ? periodSummaries.map((line) => `- ${line}`).join('\n') : '- See portal details';
        const message = [
            `${actorName} ${humanAction} a substitution assignment.`,
            `Request date: ${new Date(request.date).toLocaleDateString()}`,
            'Periods:',
            periodList,
            trimmedNote ? `Teacher note: ${trimmedNote}` : null,
            detailUrl ? `Request details: ${detailUrl}` : null,
            replacementUrl ? `Create replacement: ${replacementUrl}` : null
        ].filter(Boolean).join('\n');

        const htmlContent = `
<div style="font-family:sans-serif;color:#1f2937;max-width:620px;">
  <h2 style="margin:0 0 12px;">Substitution Update</h2>
  <p style="margin:0 0 8px;"><strong>${actorName}</strong> ${humanAction} a substitution assignment.</p>
  <p style="margin:0 0 8px;"><strong>Request date:</strong> ${new Date(request.date).toLocaleDateString()}</p>
  <h3 style="margin:12px 0 8px;">Affected periods</h3>
  <ul style="margin:0 0 12px;padding-left:18px;">
    ${(periodSummaries.length ? periodSummaries : ['See portal details'])
        .map((line) => `<li>${line}</li>`)
        .join('')}
  </ul>
  ${trimmedNote ? `<p style="margin:0 0 8px;"><strong>Teacher note:</strong> ${trimmedNote}</p>` : ''}
  ${detailUrl ? `<p style="margin:0 0 8px;"><a href="${detailUrl}">Open request details</a></p>` : ''}
  ${replacementUrl ? `<p style="margin:0;"><a href="${replacementUrl}">Create replacement request</a></p>` : ''}
</div>`;

        await notifySubRequestStakeholders({
            schoolId: request.school,
            departmentId: request.department || null,
            createdBy: user._id,
            requestId: request._id,
            subject: action === 'DECLINE' ? 'Substitution request declined' : 'Substitution assignment withdrawn',
            message,
            htmlContent,
            metadata: {
                event: action === 'DECLINE' ? 'sub_declined' : 'sub_withdrawn',
                actorTeacherId: teacherId.toString(),
                assignmentIds: affectedAssignments.map((a) => a._id.toString())
            }
        });
    }

    const populated = await SubstitutionRequest.findById(request._id)
        .populate('absentTeacherId', 'firstName lastName email')
        .populate('assignments.substituteTeacherId', 'firstName lastName email')
        .populate('assignments.periodId', 'name startTime endTime')
        .populate('periods.periodId', 'name startTime endTime')
        .populate('periods.classId', 'name grade section')
        .populate('periods.roomId', 'name')
        .populate('periods.subjectId', 'name code')
        .populate('createdBy', 'firstName lastName')
        .populate('timeline.by', 'firstName lastName');

    const messages = { CONFIRM: 'Substitution confirmed', DECLINE: 'Substitution declined', WITHDRAW: 'Assignment withdrawn' };
    res.status(200).json({
        success: true,
        message: messages[action] || 'Done',
        data: { ...populated.toObject(), academicYear }
    });
});

function buildMonthBuckets(startDate, endDate) {
    const buckets = [];
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return buckets;

    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        buckets.push({
            key,
            year: cursor.getFullYear(),
            month: cursor.getMonth() + 1,
            label: cursor.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return buckets;
}

function buildTeacherName(user) {
    if (!user) return 'Unknown';
    const first = user.firstName || '';
    const last = user.lastName || '';
    return `${first} ${last}`.trim() || 'Unknown';
}

function round(value, digits = 1) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/**
 * @desc    Get substitution analytics for admin/department principal
 * @route   GET /api/substitutions/analytics
 * @access  Private (department_principal, admin)
 */
export const getAnalyticsHandler = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { dateFilter, academicYear } = getSubstitutionYearScope(req);
    const { coverageType } = req.query;

    const query = {
        school: schoolId,
        date: {
            $gte: dateFilter?.$gte,
            $lte: dateFilter?.$lte
        }
    };

    if (coverageType && ['SINGLE_TEACHER_ALL_PERIODS', 'PER_PERIOD'].includes(coverageType)) {
        query.coverageType = coverageType;
    }

    if (req.departmentId) {
        query.department = req.departmentId;
    } else if (req.queryFilter?.departmentId) {
        query.department = req.queryFilter.departmentId;
    }

    const requests = await SubstitutionRequest.find(query)
        .select('date status createdAt timeline assignments absentTeacherId coverageType')
        .populate('absentTeacherId', 'firstName lastName')
        .populate('assignments.substituteTeacherId', 'firstName lastName')
        .lean();

    const monthBuckets = buildMonthBuckets(dateFilter?.$gte, dateFilter?.$lte);
    const monthMap = new Map(
        monthBuckets.map((bucket) => [
            bucket.key,
            {
                ...bucket,
                total: 0,
                confirmed: 0,
                declined: 0,
                expired: 0,
                cancelled: 0,
                responseHoursTotal: 0,
                responseHoursCount: 0
            }
        ])
    );

    const responseActions = new Set(['CONFIRMED', 'DECLINED', 'WITHDRAWN']);
    const absentTeacherMap = new Map();
    const substituteTeacherMap = new Map();
    let confirmedRequests = 0;
    let responseHoursTotal = 0;
    let responseHoursCount = 0;

    requests.forEach((request) => {
        const d = new Date(request.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const month = monthMap.get(monthKey);
        if (month) {
            month.total += 1;
            if (request.status === 'CONFIRMED') month.confirmed += 1;
            if (request.status === 'DECLINED') month.declined += 1;
            if (request.status === 'EXPIRED') month.expired += 1;
            if (request.status === 'CANCELLED') month.cancelled += 1;
        }

        if (request.status === 'CONFIRMED') confirmedRequests += 1;

        const firstResponseAt = (request.timeline || [])
            .filter((event) => responseActions.has(event?.action))
            .map((event) => new Date(event.at))
            .filter((dt) => Number.isFinite(dt.getTime()))
            .sort((a, b) => a - b)[0];

        if (firstResponseAt && request.createdAt) {
            const createdAt = new Date(request.createdAt);
            const diffHours = (firstResponseAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
            if (Number.isFinite(diffHours) && diffHours >= 0) {
                responseHoursTotal += diffHours;
                responseHoursCount += 1;
                if (month) {
                    month.responseHoursTotal += diffHours;
                    month.responseHoursCount += 1;
                }
            }
        }

        const absentTeacherId = request.absentTeacherId?._id?.toString() || request.absentTeacherId?.toString();
        if (absentTeacherId) {
            const existing = absentTeacherMap.get(absentTeacherId) || {
                teacherId: absentTeacherId,
                teacherName: buildTeacherName(request.absentTeacherId),
                absences: 0,
                requestsCreated: 0,
                confirmed: 0,
                declined: 0
            };
            existing.absences += 1;
            existing.requestsCreated += 1;
            if (request.status === 'CONFIRMED') existing.confirmed += 1;
            if (request.status === 'DECLINED') existing.declined += 1;
            absentTeacherMap.set(absentTeacherId, existing);
        }

        (request.assignments || []).forEach((assignment) => {
            const sub = assignment.substituteTeacherId;
            const subId = sub?._id?.toString() || sub?.toString();
            if (!subId) return;

            const existing = substituteTeacherMap.get(subId) || {
                teacherId: subId,
                teacherName: buildTeacherName(sub),
                timesSubstituted: 0,
                confirmedAssignments: 0,
                respondedAssignments: 0,
                responseHoursTotal: 0,
                responseHoursCount: 0
            };

            existing.timesSubstituted += 1;
            if (assignment.status === 'CONFIRMED') existing.confirmedAssignments += 1;
            if (['CONFIRMED', 'DECLINED'].includes(assignment.status)) existing.respondedAssignments += 1;

            const teacherResponseAt = (request.timeline || [])
                .filter((event) => {
                    const eventBy = event?.by?._id?.toString?.() || event?.by?.toString?.();
                    return responseActions.has(event?.action) && eventBy === subId;
                })
                .map((event) => new Date(event.at))
                .filter((dt) => Number.isFinite(dt.getTime()))
                .sort((a, b) => a - b)[0];

            if (teacherResponseAt && request.createdAt) {
                const createdAt = new Date(request.createdAt);
                const diffHours = (teacherResponseAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
                if (Number.isFinite(diffHours) && diffHours >= 0) {
                    existing.responseHoursTotal += diffHours;
                    existing.responseHoursCount += 1;
                }
            }

            substituteTeacherMap.set(subId, existing);
        });
    });

    const monthlyRequests = monthBuckets.map((bucket) => {
        const month = monthMap.get(bucket.key);
        return {
            key: bucket.key,
            label: bucket.label,
            count: month?.total || 0
        };
    });

    const monthlyAverage = monthlyRequests.length
        ? monthlyRequests.reduce((sum, item) => sum + item.count, 0) / monthlyRequests.length
        : 0;
    const highestMonthlyCount = monthlyRequests.reduce((max, item) => Math.max(max, item.count), 0);

    const monthlyVolume = monthlyRequests.map((item) => {
        let band = 'below_average';
        if (item.count === highestMonthlyCount && highestMonthlyCount > 0) {
            band = 'highest';
        } else if (item.count > monthlyAverage) {
            band = 'above_average';
        } else if (item.count === Math.round(monthlyAverage)) {
            band = 'average';
        }
        return {
            ...item,
            band
        };
    });

    const monthlyOutcomes = monthBuckets.map((bucket) => {
        const month = monthMap.get(bucket.key);
        return {
            key: bucket.key,
            label: bucket.label,
            confirmed: month?.confirmed || 0,
            declined: month?.declined || 0,
            expired: month?.expired || 0,
            cancelled: month?.cancelled || 0
        };
    });

    const monthlyResponseTimes = monthBuckets.map((bucket) => {
        const month = monthMap.get(bucket.key);
        const avgHours = month?.responseHoursCount
            ? month.responseHoursTotal / month.responseHoursCount
            : 0;
        return {
            key: bucket.key,
            label: bucket.label,
            avgHours: round(avgHours, 2)
        };
    });

    const mostRequested = monthlyRequests.reduce(
        (acc, item) => (item.count > acc.count ? item : acc),
        { label: 'N/A', count: 0 }
    );

    const topAbsentTeachers = Array.from(absentTeacherMap.values())
        .sort((a, b) => b.requestsCreated - a.requestsCreated)
        .slice(0, 10)
        .map((row, index) => ({
            rank: index + 1,
            ...row
        }));

    const topSubstituteTeachers = Array.from(substituteTeacherMap.values())
        .map((row) => ({
            ...row,
            confirmationRate: row.timesSubstituted
                ? round((row.confirmedAssignments / row.timesSubstituted) * 100, 1)
                : 0,
            avgResponseHours: row.responseHoursCount
                ? round(row.responseHoursTotal / row.responseHoursCount, 2)
                : 0
        }))
        .sort((a, b) => b.timesSubstituted - a.timesSubstituted)
        .slice(0, 10)
        .map((row, index) => ({
            rank: index + 1,
            ...row
        }));

    const totalRequests = requests.length;
    const confirmationRate = totalRequests ? round((confirmedRequests / totalRequests) * 100, 1) : 0;
    const averageResponseTimeHours = responseHoursCount
        ? round(responseHoursTotal / responseHoursCount, 2)
        : 0;

    return res.status(200).json({
        success: true,
        data: {
            filters: {
                academicYear,
                coverageType: coverageType || 'ALL',
                departmentId: query.department || null
            },
            summary: {
                totalRequests,
                confirmationRate,
                averageResponseTimeHours,
                mostRequestedMonth: {
                    label: mostRequested.label,
                    count: mostRequested.count
                },
                monthlyAverage: round(monthlyAverage, 2)
            },
            charts: {
                monthlyVolume,
                monthlyOutcomes,
                monthlyResponseTimes
            },
            tables: {
                topAbsentTeachers,
                topSubstituteTeachers
            }
        }
    });
});

