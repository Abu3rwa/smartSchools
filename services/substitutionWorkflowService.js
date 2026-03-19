import mongoose from 'mongoose';
import SubstitutionRequest, { REQUEST_STATUS } from '../models/SubstitutionRequest.js';
import SubRequestToken from '../models/SubRequestToken.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import TeacherAbsence from '../models/TeacherAbsence.js';
import User from '../models/User.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import { getTargetPeriods, getCandidates } from './substitutionCandidateService.js';
import { createToken, validateToken, claimToken } from './substitutionTokenService.js';
import { notifySubstituteTeacher } from './substitutionNotificationService.js';

const DEFAULT_EXPIRES_HOURS = 48;

function getDayOfWeek(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.getDay();
}

/**
 * Check if a teacher is free for the given date and periodIds.
 * Same logic as candidate service: not scheduled, not absent, not assigned as sub.
 */
async function isTeacherFree(schoolId, teacherId, date, periodIds) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = getDayOfWeek(d);
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);

    const scheduled = await TeacherPeriodAssignment.findOne({
        school: schoolId,
        teacher: teacherId,
        period: { $in: periodIds },
        isActive: true,
        startDate: { $lte: endOfDay },
        endDate: { $gte: d },
        $or: [
            { daysOfWeek: { $exists: false } },
            { daysOfWeek: { $size: 0 } },
            { daysOfWeek: dayOfWeek }
        ]
    });

    if (scheduled) return false;

    const absent = await TeacherAbsence.findOne({
        school: schoolId,
        teacher: teacherId,
        date: { $gte: d, $lte: endOfDay }
    });

    if (absent) return false;

    const assignedAsSub = await SubstitutionRequest.findOne({
        school: schoolId,
        date: { $gte: d, $lte: endOfDay },
        status: { $in: ['SUBMITTED', 'CONFIRMED'] },
        'assignments.substituteTeacherId': teacherId,
        'assignments.periodId': { $in: periodIds }
    });

    if (assignedAsSub) return false;

    return true;
}

/**
 * Create a substitution request with validation.
 * @param {Object} params
 * @returns {Promise<SubstitutionRequest>}
 */
export async function createRequest({
    schoolId,
    departmentId,
    absentTeacherId,
    date,
    coverageType,
    periods, // [{ periodId, ... }] or just periodIds
    selections, // SINGLE: { substituteTeacherId }, PER_PERIOD: [{ periodId, substituteTeacherId }]
    principalNote,
    materialsLink,
    expiresInHours,
    createdBy
}) {
    const targetPeriods = await getTargetPeriods(schoolId, absentTeacherId, date);
    const targetPeriodIds = targetPeriods.map(p => p.periodId);

    if (targetPeriodIds.length === 0) {
        throw new Error('No periods found for absent teacher on this date');
    }

    const targetMap = Object.fromEntries(targetPeriods.map((p) => [(p.periodId || p).toString(), p]));
    let periodInfos = periods;
    if (!periodInfos || !Array.isArray(periodInfos)) {
        periodInfos = targetPeriods;
    } else {
        const validIds = new Set(targetPeriodIds.map(id => id.toString()));
        periodInfos = periodInfos
            .map((p) => {
                const pid = (typeof p === 'object' && p.periodId ? p.periodId : p).toString();
                const full = targetMap[pid];
                return full ? { ...full, periodId: full.periodId || p.periodId || p } : (typeof p === 'object' ? p : { periodId: p });
            })
            .filter((p) => validIds.has((p.periodId || p).toString()));
        if (periodInfos.length === 0) {
            periodInfos = targetPeriods;
        }
    }

    const periodIds = periodInfos.map(p => (p.periodId || p));

    let assignments = [];
    if (coverageType === 'SINGLE_TEACHER_ALL_PERIODS') {
        const subId = selections?.substituteTeacherId;
        if (!subId) throw new Error('substituteTeacherId is required for SINGLE_TEACHER_ALL_PERIODS');
        const free = await isTeacherFree(schoolId, subId, date, periodIds);
        if (!free) throw new Error('Selected substitute is not free for all target periods');
        assignments = periodIds.map(periodId => ({
            periodId,
            substituteTeacherId: subId,
            status: 'PENDING'
        }));
    } else {
        const perPeriod = selections?.perPeriod || selections;
        if (!Array.isArray(perPeriod) || perPeriod.length === 0) {
            throw new Error('Per-period selections are required for PER_PERIOD coverage');
        }
        for (const sel of perPeriod) {
            const periodId = sel.periodId || sel.period;
            const subId = sel.substituteTeacherId;
            if (!periodId || !subId) throw new Error('Each selection must have periodId and substituteTeacherId');
            const free = await isTeacherFree(schoolId, subId, date, [periodId]);
            if (!free) throw new Error(`Teacher ${subId} is not free for period ${periodId}`);
            assignments.push({
                periodId,
                substituteTeacherId: subId,
                status: 'PENDING'
            });
        }
    }

    const expiresIn = expiresInHours ?? DEFAULT_EXPIRES_HOURS;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresIn);

    const timeline = [{
        action: 'SUBMITTED',
        by: createdBy,
        at: new Date(),
        meta: { note: 'Request created' }
    }];

    const request = await SubstitutionRequest.create({
        school: schoolId,
        department: departmentId || null,
        date: new Date(date),
        absentTeacherId,
        coverageType,
        periods: periodInfos.map(p => ({
            periodId: p.periodId || p,
            startTime: p.startTime,
            endTime: p.endTime,
            classId: p.classId,
            roomId: p.roomId,
            subjectId: p.subjectId
        })),
        assignments,
        principalNote: principalNote || '',
        materialsLink: materialsLink || '',
        status: 'SUBMITTED',
        expiresAt,
        timeline,
        createdBy
    });

    const appBaseUrl = process.env.CLIENT_URL || process.env.API_BASE_URL || process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
    const normalizedAppBaseUrl = String(appBaseUrl).replace(/\/+$/, '');
    const apiBaseUrl = process.env.API_BASE_URL || process.env.API_URL || `${normalizedAppBaseUrl}/api`;
    const normalizedApiBaseUrl = String(apiBaseUrl).replace(/\/+$/, '');
    const hasMobileBridge = Boolean(String(process.env.MOBILE_DEEP_LINK_BASE || '').trim());
    const tokenMap = {}; // substituteTeacherId -> { rawToken, confirmUrl, declineUrl }

    for (const a of request.assignments) {
        const { rawToken } = await createToken({
            schoolId,
            requestId: request._id,
            assignmentId: a._id,
            periodId: a.periodId,
            substituteTeacherId: a.substituteTeacherId,
            expiresAt
        });

        const confirmWebUrl = `${normalizedAppBaseUrl}/substitutions/respond?token=${encodeURIComponent(rawToken)}&intent=confirm`;
        const declineWebUrl = `${normalizedAppBaseUrl}/substitutions/respond?token=${encodeURIComponent(rawToken)}&intent=decline`;
        const confirmUrl = hasMobileBridge
            ? `${normalizedApiBaseUrl}/substitutions/respond-bridge?token=${encodeURIComponent(rawToken)}&intent=confirm`
            : confirmWebUrl;
        const declineUrl = hasMobileBridge
            ? `${normalizedApiBaseUrl}/substitutions/respond-bridge?token=${encodeURIComponent(rawToken)}&intent=decline`
            : declineWebUrl;

        const subIdStr = a.substituteTeacherId.toString();
        if (!tokenMap[subIdStr]) {
            tokenMap[subIdStr] = { rawToken, confirmUrl, declineUrl };
        }
    }

    const absentTeacher = await User.findById(absentTeacherId)
        .select('firstName lastName')
        .setOptions({ skipTenantFilter: true })
        .lean();

    const absentName = absentTeacher ? `${absentTeacher.firstName || ''} ${absentTeacher.lastName || ''}`.trim() : 'Teacher';
    const dateStr = new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const populated = await SubstitutionRequest.findById(request._id)
        .populate('periods.periodId', 'name startTime endTime')
        .populate('periods.classId', 'name grade section')
        .populate('periods.roomId', 'name')
        .populate('periods.subjectId', 'name code')
        .lean();

    const periodDetails = (populated?.periods || []).map((p) => {
        const period = p.periodId;
        const cls = p.classId;
        const room = p.roomId;
        const subj = p.subjectId;
        return {
            periodName: period?.name || 'Period',
            time: p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : (period?.startTime && period?.endTime ? `${period.startTime}–${period.endTime}` : '—'),
            className: cls?.name || '—',
            grade: cls?.grade != null ? `Grade ${cls.grade}` : '',
            roomName: room?.name || '—',
            subjectName: subj?.name || '—'
        };
    });

    const notified = new Set();
    for (const a of request.assignments) {
        const subIdStr = a.substituteTeacherId.toString();
        if (notified.has(subIdStr)) continue;
        notified.add(subIdStr);
        const { confirmUrl, declineUrl } = tokenMap[subIdStr] || {};
        await notifySubstituteTeacher({
            teacherId: a.substituteTeacherId,
            requestId: request._id,
            confirmUrl,
            declineUrl,
            schoolId,
            createdBy,
            requestDetails: {
                date: dateStr,
                absentTeacherName: absentName,
                periodDetails,
                principalNote: principalNote || '',
                materialsLink: materialsLink || ''
            }
        });
    }

    return request;
}

/**
 * Process teacher response (confirm/decline) via token.
 * @param {Object} params
 */
export async function processResponse({ token, action, note, meta = {} }) {
    const validation = await validateToken(token);
    if (!validation.valid) {
        throw new Error('Invalid or expired token');
    }

    const claim = await claimToken(token);
    if (!claim.claimed) {
        throw new Error('Invalid or expired token');
    }
    const { tokenDoc } = claim;
    const { requestId, assignmentId, substituteTeacherId } = validation;

    const request = await SubstitutionRequest.findById(requestId)
        .populate('assignments.periodId', 'name startTime endTime')
        .setOptions({ skipTenantFilter: true });

    if (!request) throw new Error('Request not found');
    if (request.status !== 'SUBMITTED') {
        throw new Error(`Request is no longer pending (status: ${request.status})`);
    }

    const assignment = request.assignments.id(assignmentId);
    if (!assignment) throw new Error('Assignment not found');
    if (assignment.substituteTeacherId.toString() !== substituteTeacherId.toString()) {
        throw new Error('Token does not match assignment');
    }

    if (action === 'CONFIRM') {
        assignment.status = 'CONFIRMED';
        assignment.teacherResponseNote = note || '';

        if (request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS') {
            for (const a of request.assignments) {
                if (a._id.toString() !== assignmentId.toString()) {
                    a.status = 'CONFIRMED';
                    a.teacherResponseNote = note || '';
                }
            }
            request.status = 'CONFIRMED';
        } else {
            const allConfirmed = request.assignments.every(a => a.status === 'CONFIRMED' || a._id.toString() === assignmentId.toString());
            request.status = allConfirmed ? 'CONFIRMED' : 'SUBMITTED';
        }
    } else if (action === 'DECLINE') {
        assignment.status = 'DECLINED';
        assignment.teacherResponseNote = note || '';

        if (request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS') {
            for (const a of request.assignments) {
                if (a._id.toString() !== assignmentId.toString()) {
                    a.status = 'DECLINED';
                }
            }
        }
        request.status = 'DECLINED';
    } else {
        throw new Error('Invalid action. Use CONFIRM or DECLINE.');
    }

    request.timeline.push({
        action: action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED',
        by: substituteTeacherId,
        at: new Date(),
        meta: { note, assignmentId: assignmentId.toString(), ip: meta.ip, userAgent: meta.userAgent }
    });

    await request.save();

    // Burn any other tokens for this request (e.g. same teacher, multiple periods)
    await SubRequestToken.updateMany(
        { requestId, usedAt: null },
        { $set: { usedAt: new Date() } }
    ).setOptions({ skipTenantFilter: true });

    return request;
}
