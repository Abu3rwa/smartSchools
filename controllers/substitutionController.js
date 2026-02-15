import { asyncHandler } from '../middleware/errorHandler.js';
import SubstitutionRequest from '../models/SubstitutionRequest.js';
import TeacherAbsence from '../models/TeacherAbsence.js';
import User from '../models/User.js';
import { getCandidates } from '../services/substitutionCandidateService.js';
import { createRequest, processResponse } from '../services/substitutionWorkflowService.js';

/** Mark expired SUBMITTED requests as EXPIRED */
async function expireStaleRequests(schoolId) {
    await SubstitutionRequest.updateMany(
        { school: schoolId, status: 'SUBMITTED', expiresAt: { $lt: new Date() } },
        { $set: { status: 'EXPIRED' }, $push: { timeline: { action: 'EXPIRED', by: null, at: new Date(), meta: { reason: 'Token expired' } } } }
    );
}

/**
 * @desc    Register a teacher absence (so they are excluded from candidate lists)
 * @route   POST /api/substitutions/absences
 * @access  Private (department_principal, admin)
 */
export const createAbsenceHandler = asyncHandler(async (req, res) => {
    const { teacherId, date, reason } = req.body;
    const schoolId = req.schoolId;

    const teacher = await User.findById(teacherId).select('role school').setOptions({ skipTenantFilter: true });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    if (teacher.role !== 'teacher') return res.status(400).json({ success: false, message: 'Must be a teacher' });
    if (teacher.school?.toString() !== schoolId.toString()) return res.status(403).json({ success: false, message: 'Teacher must belong to your school' });

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const existing = await TeacherAbsence.findOne({ school: schoolId, teacher: teacherId, date: d });
    if (existing) return res.status(400).json({ success: false, message: 'Absence already registered for this date' });

    const absence = await TeacherAbsence.create({
        school: schoolId,
        teacher: teacherId,
        date: d,
        reason: reason || '',
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: absence, message: 'Absence registered' });
});

/**
 * @desc    Get substitution candidates for an absent teacher on a date
 * @route   POST /api/substitutions/candidates
 * @access  Private (department_principal, admin)
 */
export const getCandidatesHandler = asyncHandler(async (req, res) => {
    const { absentTeacherId, date } = req.body;
    const schoolId = req.schoolId;

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

    const result = await getCandidates({ schoolId, absentTeacherId, date });
    res.status(200).json({ success: true, data: result });
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

    let departmentId = req.body.departmentId || req.departmentId;
    if (user.role === 'department_principal' && user.department) {
        departmentId = user.department._id || user.department;
    }

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
            createdBy: populated.createdBy
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

    await expireStaleRequests(schoolId);
    const { startDate, endDate, status, absentTeacherId, substituteTeacherId, page = 1, limit = 20 } = req.query;

    const query = { school: schoolId };

    if (user.role === 'teacher') {
        query['assignments.substituteTeacherId'] = user._id;
    } else if (user.role === 'department_principal' && user.department) {
        query.$or = [
            { department: user.department._id || user.department },
            { department: null }
        ];
    }
    // admin sees all (no extra filter)

    if (status) query.status = status;
    if (user.role !== 'teacher') {
        if (absentTeacherId) query.absentTeacherId = absentTeacherId;
        if (substituteTeacherId) query['assignments.substituteTeacherId'] = substituteTeacherId;
    }

    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

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
            }
        }
    });
});

/**
 * @desc    Get a single substitution request
 * @route   GET /api/substitutions/:id
 * @access  Private (role-based)
 */
export const getRequestHandler = asyncHandler(async (req, res) => {
    await expireStaleRequests(req.schoolId);
    const request = await SubstitutionRequest.findById(req.params.id)
        .populate('absentTeacherId', 'firstName lastName email')
        .populate('assignments.substituteTeacherId', 'firstName lastName email')
        .populate('assignments.periodId', 'name startTime endTime')
        .populate('periods.periodId', 'name startTime endTime')
        .populate('createdBy', 'firstName lastName')
        .populate('timeline.by', 'firstName lastName');

    if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
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
        if (!isAssigned) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this request' });
        }
    } else if (user.role === 'department_principal' && user.department) {
        const reqDept = request.department?.toString();
        const myDept = (user.department?._id || user.department)?.toString();
        if (reqDept && myDept && reqDept !== myDept) {
            return res.status(403).json({ success: false, message: 'Not in your department' });
        }
    }

    res.status(200).json({ success: true, data: request });
});

/**
 * @desc    Cancel a substitution request
 * @route   POST /api/substitutions/:id/cancel
 * @access  Private (department_principal, admin)
 */
export const cancelRequestHandler = asyncHandler(async (req, res) => {
    const request = await SubstitutionRequest.findById(req.params.id);

    if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (request.status !== 'SUBMITTED') {
        return res.status(400).json({
            success: false,
            message: `Cannot cancel request with status ${request.status}. Only SUBMITTED requests can be cancelled.`
        });
    }

    const user = req.user;
    if (user.role === 'department_principal' && user.department) {
        const reqDept = request.department?.toString();
        const myDept = (user.department?._id || user.department)?.toString();
        if (reqDept && myDept && reqDept !== myDept) {
            return res.status(403).json({ success: false, message: 'Not in your department' });
        }
    }

    request.status = 'CANCELLED';
    request.timeline.push({
        action: 'CANCELLED',
        by: user._id,
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
        data: populated
    });
});

/**
 * @desc    Respond to substitution request (confirm/decline) via token
 * @route   POST /api/substitutions/respond
 * @route   GET /api/substitutions/respond?token=...&action=CONFIRM|DECLINE (for email links)
 * @access  Public (token-based, rate-limited)
 */
export const respondHandler = asyncHandler(async (req, res) => {
    const { token, action, note } = req.body;
    const request = await processResponse({ token, action, note });

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
