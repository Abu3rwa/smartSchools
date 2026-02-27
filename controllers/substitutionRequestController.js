import { asyncHandler } from '../middleware/errorHandler.js';
import SubstitutionRequest from '../models/SubstitutionRequest.js';
import Teacher from '../models/Teacher.js';
import TeacherAbsence from '../models/TeacherAbsence.js';
import User from '../models/User.js';
import { getCandidates } from '../services/substitutionCandidateService.js';
import { createRequest, processResponse } from '../services/substitutionWorkflowService.js';
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
    const { action, note } = req.body;
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

    if (action === 'CONFIRM') {
        const hasPending = myAssignments.some(a => (a.status || 'PENDING') === 'PENDING');
        if (!hasPending) {
            return res.status(400).json({ success: false, message: 'No pending assignment to confirm' });
        }
        for (const assignment of myAssignments) {
            if ((assignment.status || 'PENDING') === 'PENDING') {
                assignment.status = 'CONFIRMED';
                assignment.teacherResponseNote = trimmedNote;
            }
        }

        if (request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS') {
            for (const a of request.assignments) {
                a.status = 'CONFIRMED';
                if (!a.teacherResponseNote) a.teacherResponseNote = trimmedNote;
            }
            request.status = 'CONFIRMED';
        } else {
            const allConfirmed = request.assignments.every((a) => a.status === 'CONFIRMED');
            request.status = allConfirmed ? 'CONFIRMED' : 'SUBMITTED';
        }

    } else if (action === 'DECLINE') {
        for (const assignment of myAssignments) {
            assignment.status = 'DECLINED';
            assignment.teacherResponseNote = trimmedNote;
        }

        if (request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS') {
            for (const a of request.assignments) {
                if (!myAssignments.some((m) => m._id.toString() === a._id.toString())) {
                    a.status = 'DECLINED';
                }
            }
        }
        request.status = 'DECLINED';

    } else if (action === 'WITHDRAW') {
        // Teacher withdraws a previously confirmed assignment, reverting it to PENDING
        const hasConfirmed = myAssignments.some(a => a.status === 'CONFIRMED');
        if (!hasConfirmed) {
            return res.status(400).json({ success: false, message: 'No confirmed assignment to withdraw' });
        }
        for (const assignment of myAssignments) {
            if (assignment.status === 'CONFIRMED') {
                assignment.status = 'PENDING';
                assignment.teacherResponseNote = trimmedNote || 'Withdrawn by teacher';
            }
        }
        // Revert request back to SUBMITTED so admin can re-assign
        request.status = 'SUBMITTED';

    } else {
        return res.status(400).json({ success: false, message: 'Invalid action. Use CONFIRM, DECLINE, or WITHDRAW.' });
    }

    request.timeline.push({
        action: action === 'CONFIRM' ? 'CONFIRMED' : action === 'DECLINE' ? 'DECLINED' : 'WITHDRAWN',
        by: teacherId,
        at: new Date(),
        meta: { note: trimmedNote || null, via: 'portal' }
    });

    await request.save();

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

