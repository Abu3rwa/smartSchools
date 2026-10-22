import mongoose from 'mongoose';
import Student from '../../models/Student.js';
import BehaviorType from '../../models/BehaviorType.js';
import BehaviorLadder from '../../models/BehaviorLadder.js';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import BehaviorTask from '../../models/BehaviorTask.js';
import BehaviorCountReset from '../../models/BehaviorCountReset.js';
import BehaviorCounter from '../../models/BehaviorCounter.js';
import { assertStaffCanAccessStudent, canApproveBehaviorIncident, canLogBehaviorIncident } from './accessService.js';
import { buildCountingWindow, previewOccurrence, reserveOccurrence } from './counterService.js';
import { createTasksForStep } from './taskService.js';
import { releaseIncidentCommunications } from './notificationService.js';
import { deliverBehaviorEmails } from './emailDeliveryService.js';
import { applyBehaviorTransition } from './stateMachine.js';
import { recordBehaviorAudit, BEHAVIOR_AUDIT_ACTIONS } from './auditService.js';
import { resolveApproverRoles, stepRequiresApproval } from './settingsService.js';
import { suggestStep } from './suggestionService.js';
import { resolveAcademicYearForRequest, buildAcademicYearDateFilter } from '../../helpers/academicYearScope.js';

const badRequest = (message, code) => Object.assign(new Error(message), { statusCode: 400, code });
const forbidden = (message, code) => Object.assign(new Error(message), { statusCode: 403, code });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const toStepSnapshot = (step, ladder) => (step ? {
    order: step.order,
    title: step.title,
    stepId: step._id || null,
    ladder: ladder?._id || null
} : {});

const yearBoundsFor = (req, academicYear) => {
    const resolved = resolveAcademicYearForRequest(req, academicYear);
    const filter = buildAcademicYearDateFilter(resolved, req.school) || {};
    return {
        academicYear: resolved,
        start: filter.$gte || null,
        end: filter.$lte || null,
        semester: new Date().getMonth() >= 7 ? 1 : 2
    };
};

export const loadBehaviorPlan = async ({ schoolId, behaviorTypeId }) => {
    if (!mongoose.isValidObjectId(behaviorTypeId)) throw badRequest('Invalid behavior id', 'INVALID_BEHAVIOR_ID');

    const behaviorType = await BehaviorType.findOne({ _id: behaviorTypeId, school: schoolId, active: true })
        .select('name description level ladder')
        .lean();
    if (!behaviorType) throw notFound('Behavior not found');

    const ladder = behaviorType.ladder
        ? await BehaviorLadder.findOne({ _id: behaviorType.ladder, school: schoolId }).lean()
        : await BehaviorLadder.findOne({ school: schoolId, behaviorType: behaviorType._id }).lean();
    if (!ladder) throw notFound('No consequence ladder is configured for this behavior');

    return { behaviorType, ladder };
};

/**
 * Same student, same behavior, inside the duplicate window. The logging screen
 * offers merge or log-separately; a merge never adds to the count.
 */
export const findRecentDuplicate = async ({ schoolId, studentId, behaviorTypeId, minutes, occurredAt }) => {
    const window = Number(minutes) || 0;
    if (window <= 0) return null;

    const end = new Date(occurredAt || Date.now());
    return BehaviorIncident.findOne({
        school: schoolId,
        student: studentId,
        behaviorType: behaviorTypeId,
        status: { $nin: ['voided', 'merged'] },
        occurredAt: { $gte: new Date(end.getTime() - window * 60 * 1000), $lte: end }
    }).sort({ occurredAt: -1 }).select('_id occurredAt status appliedStep').lean();
};

const stepTitles = (ladder) => (ladder?.steps || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step) => ({ order: step.order, title: step.title, _id: step._id }));

/**
 * Everything the logging screen needs before anything is written: the count so
 * far, the suggested step, whether approval will be needed and any duplicate.
 */
export const previewBehaviorSuggestion = async ({ req, studentId, behaviorTypeId, occurredAt, settings }) => {
    const access = await assertStaffCanAccessStudent(req, studentId);
    if (access.error) throw Object.assign(new Error(access.error.message), { statusCode: access.error.status });

    const { behaviorType, ladder } = await loadBehaviorPlan({ schoolId: req.schoolId, behaviorTypeId });
    const yearBounds = yearBoundsFor(req, null);
    const window = await buildCountingWindow({
        schoolId: req.schoolId,
        studentId,
        behaviorTypeId,
        settings,
        yearBounds
    });
    const suggestion = await previewOccurrence({
        schoolId: req.schoolId,
        studentId,
        behaviorTypeId,
        ladder,
        settings,
        window
    });
    const step = suggestion.step || ladder.steps?.[0] || null;
    const approvalRequired = stepRequiresApproval(settings, step);
    const duplicate = await findRecentDuplicate({
        schoolId: req.schoolId,
        studentId,
        behaviorTypeId,
        minutes: settings?.duplicateWindowMinutes,
        occurredAt: occurredAt || new Date()
    });

    return {
        student: {
            _id: access.student._id,
            firstName: access.student.firstName,
            lastName: access.student.lastName,
            studentId: access.student.studentId
        },
        behaviorType,
        ladder: { _id: ladder._id, overflowBehavior: ladder.overflowBehavior, steps: stepTitles(ladder) },
        suggestion: {
            occurrence: suggestion.occurrence,
            priorCount: suggestion.priorCount,
            order: step?.order ?? null,
            title: step?.title ?? null,
            stepId: step?._id ?? null,
            overflow: suggestion.overflow,
            flagForAdmin: suggestion.flagForAdmin,
            window: { mode: window.mode, key: window.key, start: window.start, end: window.end }
        },
        approval: {
            required: approvalRequired,
            approverRoles: resolveApproverRoles(settings, step)
        },
        duplicateWarning: duplicate ? {
            found: true,
            incidentId: duplicate._id,
            occurredAt: duplicate.occurredAt,
            windowMinutes: settings?.duplicateWindowMinutes || 0
        } : { found: false },
        consequences: (step?.consequences || []).map((consequence) => ({
            taskType: consequence.taskType,
            title: consequence.title,
            dueInDays: consequence.dueInDays,
            minWords: consequence.minWords || settings?.apologyMinWords || 0
        }))
    };
};

const resolveAppliedStep = ({ ladder, suggestion, payload }) => {
    const order = Number(payload?.appliedStepOrder);
    if (!order || order === suggestion.step?.order) {
        return { step: suggestion.step, overridden: false };
    }

    const step = (ladder.steps || []).find((entry) => entry.order === order);
    if (!step) throw badRequest('That step is not on this ladder', 'STEP_NOT_FOUND');
    if (!String(payload?.overrideReason || '').trim()) {
        throw badRequest('An override needs a reason', 'OVERRIDE_REASON_REQUIRED');
    }
    return { step, overridden: true };
};

/**
 * Moves an approved (or never-blocked) incident onto its consequence: tasks are
 * created, the parent draft and portal entry are released, and the status walks
 * approved -> notified -> in_progress.
 */
const releaseAppliedStep = async ({ incident, step, settings, req, approvalCleared, draftEdits = null }) => {
    const student = await Student.findOne({ _id: incident.student, school: req.schoolId });
    const behaviorType = await BehaviorType.findOne({ _id: incident.behaviorType, school: req.schoolId }).lean();

    if (incident.status === 'logged' || incident.status === 'pending_approval') {
        await applyBehaviorTransition({
            incident,
            to: 'approved',
            actor: req.user,
            auditAction: approvalCleared ? BEHAVIOR_AUDIT_ACTIONS.APPROVED : null
        });
    }

    const tasks = await createTasksForStep({ incident, step, settings, actor: req.user });
    const communications = await releaseIncidentCommunications({
        incident,
        step,
        student,
        behaviorType,
        school: req.school,
        staff: req.user,
        settings,
        tasks,
        approvalCleared,
        draftEdits,
        actor: req.user
    });

    await applyBehaviorTransition({ incident, to: 'notified', actor: req.user });
    await applyBehaviorTransition({ incident, to: 'in_progress', actor: req.user });

    // Best effort, and only for rows that are actually due: a held draft keeps
    // its readyAt and the hourly sweep picks it up later. A mail failure must
    // never undo the consequence that was just applied.
    const delivery = approvalCleared
        ? await deliverBehaviorEmails({
            schoolId: req.schoolId,
            settings,
            // req.school is the populated school the caller is already standing in.
            school: req.school
        }).catch(() => null)
        : null;

    return {
        tasks,
        missingParentEmail: communications.missingParentEmail,
        emailSent: delivery?.sent || 0
    };
};

const rollbackOccurrence = async ({ incident }) => BehaviorCounter
    .updateOne(
        {
            school: incident.school,
            student: incident.student,
            behaviorType: incident.behaviorType,
            windowKey: incident.countSnapshot?.windowKey
        },
        { $inc: { count: -1 } }
    )
    .catch(() => null);

/**
 * Writes the incident. The occurrence number is reserved atomically first, so a
 * second staff member logging the same pair at the same instant gets the next
 * step instead of the same one.
 */
export const logBehaviorIncident = async ({ req, payload, settings }) => {
    if (!canLogBehaviorIncident(req.user)) throw forbidden('You cannot log behavior incidents.', 'NOT_BEHAVIOR_STAFF');

    const occurredAt = payload?.occurredAt ? new Date(payload.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw badRequest('Invalid incident date', 'INVALID_OCCURRED_AT');

    if (payload?.mergeInto) {
        return mergeBehaviorIncidents({
            req,
            sourceId: null,
            targetId: payload.mergeInto,
            pending: { studentId: payload.student, behaviorTypeId: payload.behaviorType, occurredAt }
        });
    }

    const access = await assertStaffCanAccessStudent(req, payload?.student);
    if (access.error) throw Object.assign(new Error(access.error.message), { statusCode: access.error.status });

    const { behaviorType, ladder } = await loadBehaviorPlan({
        schoolId: req.schoolId,
        behaviorTypeId: payload?.behaviorType
    });

    if (payload?.isSerious && !canMarkSerious(req, settings)) {
        throw forbidden('Your role cannot mark an incident as serious.', 'SERIOUS_NOT_ALLOWED');
    }

    const yearBounds = yearBoundsFor(req, null);
    const window = await buildCountingWindow({
        schoolId: req.schoolId,
        studentId: access.student._id,
        behaviorTypeId: behaviorType._id,
        settings,
        yearBounds
    });
    const reserved = await reserveOccurrence({
        schoolId: req.schoolId,
        studentId: access.student._id,
        behaviorTypeId: behaviorType._id,
        window
    });

    const suggestion = suggestStep({ priorCount: reserved.priorCount, ladder, settings });
    const { step, overridden } = resolveAppliedStep({ ladder, suggestion, payload });
    const approvalRequired = stepRequiresApproval(settings, step);

    const incident = new BehaviorIncident({
        school: req.schoolId,
        student: access.student._id,
        class: access.student.currentClass || null,
        academicYear: yearBounds.academicYear,
        behaviorType: behaviorType._id,
        reportedBy: req.user._id,
        occurredAt,
        staffNotes: String(payload?.staffNotes || '').trim(),
        otherStudentsInvolved: payload?.otherStudentsInvolved || [],
        status: 'logged',
        suggestedStep: toStepSnapshot(suggestion.step, ladder),
        appliedStep: toStepSnapshot(step, ladder),
        overrideReason: overridden ? String(payload.overrideReason || '').trim() : '',
        overriddenBy: overridden ? req.user._id : null,
        overriddenAt: overridden ? new Date() : null,
        isSerious: payload?.isSerious === true,
        seriousReason: payload?.isSerious ? String(payload?.seriousReason || '').trim() : '',
        flagForAdmin: suggestion.flagForAdmin === true,
        flaggedForAdminAt: suggestion.flagForAdmin ? new Date() : null,
        countSnapshot: {
            priorCount: reserved.priorCount,
            occurrence: reserved.occurrence,
            mode: window.mode,
            windowKey: window.key,
            windowStart: window.start,
            windowEnd: window.end,
            ladderLength: suggestion.ladderLength,
            overflow: suggestion.overflow
        }
    });

    try {
        await incident.save();
    } catch (error) {
        await rollbackOccurrence({ incident });
        throw error;
    }

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.INCIDENT_LOGGED,
        actor: req.user,
        incidentId: incident._id,
        after: {
            status: incident.status,
            occurrence: reserved.occurrence,
            suggestedStep: incident.suggestedStep?.order ?? null,
            appliedStep: incident.appliedStep?.order ?? null,
            overridden
        }
    });

    if (approvalRequired) {
        await applyBehaviorTransition({
            incident,
            to: 'pending_approval',
            actor: req.user,
            patch: {
                'approval.required': true,
                'approval.requestedAt': new Date(),
                'approval.approverRoles': resolveApproverRoles(settings, step)
            },
            auditAction: BEHAVIOR_AUDIT_ACTIONS.APPROVAL_REQUESTED
        });

        // Drafted but suppressed: nothing reaches a parent until approval.
        await draftSuppressedCommunications({ incident, step, settings, req });

        return { incident, status: incident.status, approvalRequired: true, flagForAdmin: incident.flagForAdmin };
    }

    const released = await releaseAppliedStep({ incident, step, settings, req, approvalCleared: true });
    return {
        incident,
        status: incident.status,
        approvalRequired: false,
        tasks: released.tasks,
        missingParentEmail: released.missingParentEmail,
        emailSent: released.emailSent,
        flagForAdmin: incident.flagForAdmin
    };
};

const canMarkSerious = (req, settings) => {
    const roles = settings?.seriousIncident?.allowedRoles || [];
    return roles.includes(req.user?.role);
};

const draftSuppressedCommunications = async ({ incident, step, settings, req }) => {
    const student = await Student.findOne({ _id: incident.student, school: req.schoolId });
    const behaviorType = await BehaviorType.findOne({ _id: incident.behaviorType, school: req.schoolId }).lean();
    return releaseIncidentCommunications({
        incident,
        step,
        student,
        behaviorType,
        school: req.school,
        staff: req.user,
        settings,
        tasks: [],
        approvalCleared: false,
        actor: req.user
    });
};

/**
 * Approve or reject a suggested consequence. Rejection still counts as an
 * occurrence; only voiding or merging removes a count.
 */
export const decideBehaviorApproval = async ({ req, incidentId, decision, comment, draftEdits, settings }) => {
    if (!['approved', 'rejected'].includes(decision)) {
        throw badRequest('Unknown approval decision', 'APPROVAL_DECISION_INVALID');
    }
    if (decision === 'rejected' && !String(comment || '').trim()) {
        throw badRequest('A rejection needs a reason', 'REJECTION_REASON_REQUIRED');
    }

    const incident = await BehaviorIncident.findOne({ _id: incidentId, school: req.schoolId });
    if (!incident) throw notFound('Incident not found');
    if (!canApproveBehaviorIncident(req.user, settings, incident)) {
        throw forbidden('You are not an approver for this step.', 'NOT_APPROVER');
    }
    if (incident.status !== 'pending_approval') {
        throw badRequest('This incident is not awaiting approval', 'NOT_PENDING_APPROVAL');
    }

    const step = await loadIncidentStep(incident);
    if (!step) throw notFound('The consequence step is no longer on this ladder');

    if (decision === 'rejected') {
        await applyBehaviorTransition({
            incident,
            to: 'consequence_rejected',
            actor: req.user,
            patch: {
                'approval.decision': 'rejected',
                'approval.decidedBy': req.user._id,
                'approval.decidedAt': new Date(),
                'approval.comment': String(comment).trim()
            },
            auditAction: BEHAVIOR_AUDIT_ACTIONS.REJECTED
        });
        return { incident, status: incident.status };
    }

    await applyBehaviorTransition({
        incident,
        to: 'approved',
        actor: req.user,
        patch: {
            'approval.decision': 'approved',
            'approval.decidedBy': req.user._id,
            'approval.decidedAt': new Date(),
            'approval.comment': String(comment || '').trim()
        },
        auditAction: BEHAVIOR_AUDIT_ACTIONS.APPROVED
    });

    // The approver's wording edit is applied by the release itself, so the row
    // that is sent and the draft that is shown can never disagree.
    const released = await releaseAppliedStep({
        incident,
        step,
        settings,
        req,
        approvalCleared: true,
        draftEdits: draftEdits ? { ...draftEdits, language: incident.emailDraft?.language } : null
    });

    return {
        incident,
        status: incident.status,
        tasks: released.tasks,
        missingParentEmail: released.missingParentEmail,
        emailSent: released.emailSent
    };
};

const loadIncidentStep = async (incident) => {
    const ladder = await BehaviorLadder.findOne({ school: incident.school, _id: incident.appliedStep?.ladder })
        .select('steps overflowBehavior')
        .lean();
    if (!ladder) return null;
    return (ladder.steps || []).find((step) => step.order === incident.appliedStep?.order) || null;
};

export const voidBehaviorIncident = async ({ req, incidentId, reason }) => {
    if (!String(reason || '').trim()) throw badRequest('A void needs a reason', 'VOID_REASON_REQUIRED');

    const incident = await BehaviorIncident.findOne({ _id: incidentId, school: req.schoolId });
    if (!incident) throw notFound('Incident not found');
    if (!canLogBehaviorIncident(req.user)) throw forbidden('You cannot void incidents.', 'NOT_BEHAVIOR_STAFF');

    await applyBehaviorTransition({
        incident,
        to: 'voided',
        actor: req.user,
        patch: { voidReason: String(reason).trim() },
        meta: { reason: String(reason).trim() }
    });

    // The occurrence is released so escalation steps back down one.
    await rollbackOccurrence({ incident });
    await BehaviorTask.updateMany(
        { school: req.schoolId, incident: incident._id, status: { $nin: ['completed', 'waived'] } },
        { $set: { status: 'waived', waiverReason: 'Incident voided' } }
    );

    return incident;
};

export const mergeBehaviorIncidents = async ({ req, sourceId, targetId, pending = null }) => {
    if (!mongoose.isValidObjectId(targetId)) throw badRequest('Invalid target incident', 'INVALID_TARGET');
    const target = await BehaviorIncident.findOne({ _id: targetId, school: req.schoolId })
        .select('_id status student behaviorType occurredAt')
        .lean();
    if (!target) throw notFound('The incident to merge into was not found');

    let source = null;
    if (sourceId) {
        source = await BehaviorIncident.findOne({ _id: sourceId, school: req.schoolId });
        if (!source) throw notFound('Incident not found');
        if (String(source.student) !== String(target.student) || String(source.behaviorType) !== String(target.behaviorType)) {
            throw badRequest('Only the same student and behavior can be merged', 'MERGE_MISMATCH');
        }
        await applyBehaviorTransition({
            source,
            to: 'merged',
            actor: req.user,
            patch: { mergedInto: target._id },
            auditAction: BEHAVIOR_AUDIT_ACTIONS.INCIDENT_MERGED
        });
        await rollbackOccurrence({ incident: source });
        await BehaviorTask.updateMany(
            { school: req.schoolId, incident: source._id, status: { $nin: ['completed', 'waived'] } },
            { $set: { status: 'waived', waiverReason: 'Merged into another incident' } }
        );
        return { merged: true, source, target };
    }

    // "Merge" straight from the logging screen: nothing new is created, and the
    // existing incident gains the note the staff member was about to file.
    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.INCIDENT_MERGED,
        actor: req.user,
        incidentId: target._id,
        meta: { duplicateSuppressed: true, occurredAt: pending?.occurredAt }
    });
    return {
        merged: true,
        source: null,
        target,
        message: 'Duplicate suppressed: nothing new was logged and no count changed.'
    };
};

/**
 * Starts a fresh counting window for a student (+ optionally one behavior).
 * Incidents are never deleted; the reset marker changes the window key.
 */
export const resetBehaviorCounts = async ({ req, studentId, behaviorTypeId, reason, settings }) => {
    if (!String(reason || '').trim()) throw badRequest('A count reset needs a reason', 'RESET_REASON_REQUIRED');
    if (!mongoose.isValidObjectId(studentId)) throw badRequest('Invalid student id', 'INVALID_STUDENT_ID');
    if (behaviorTypeId && !mongoose.isValidObjectId(behaviorTypeId)) throw badRequest('Invalid behavior id', 'INVALID_BEHAVIOR_ID');

    const access = await assertStaffCanAccessStudent(req, studentId);
    if (access.error) throw Object.assign(new Error(access.error.message), { statusCode: access.error.status });

    const reset = await BehaviorCountReset.create({
        school: req.schoolId,
        student: access.student._id,
        behaviorType: behaviorTypeId || null,
        resetBy: req.user._id,
        resetAt: new Date(),
        reason: String(reason).trim()
    });

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.COUNTS_RESET,
        actor: req.user,
        targetType: 'student',
        targetId: studentId,
        after: { mode: settings?.counting?.mode, behaviorScoped: Boolean(behaviorTypeId) }
    });

    const yearBounds = yearBoundsFor(req, null);
    const window = await buildCountingWindow({
        schoolId: req.schoolId,
        studentId,
        behaviorTypeId: behaviorTypeId || null,
        settings,
        yearBounds,
        lastResetAt: reset.resetAt
    });

    return { reset, window };
};

export const listPendingApprovals = async ({ req, limit = 50, skip = 0 }) => {
    const filter = { school: req.schoolId, status: 'pending_approval' };
    const [items, total] = await Promise.all([
        BehaviorIncident.find(filter)
            .sort({ 'approval.requestedAt': 1 })
            .skip(skip)
            .limit(Math.min(Number(limit) || 50, 200))
            .populate('student', 'firstName lastName studentId')
            .populate('behaviorType', 'name level')
            .populate('reportedBy', 'firstName lastName')
            .select('-staffNotes -otherStudentsInvolved')
            .lean(),
        BehaviorIncident.countDocuments(filter)
    ]);

    return { items, total };
};
