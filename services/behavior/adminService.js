import mongoose from 'mongoose';
import BehaviorType from '../../models/BehaviorType.js';
import BehaviorLadder from '../../models/BehaviorLadder.js';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import BehaviorTask from '../../models/BehaviorTask.js';
import BehaviorNotification from '../../models/BehaviorNotification.js';
import BehaviorEmailTemplate from '../../models/BehaviorEmailTemplate.js';
import {
    BEHAVIOR_TASK_TYPES,
    BEHAVIOR_VERIFIER_RULES,
    BEHAVIOR_OVERFLOW_BEHAVIORS,
    BEHAVIOR_SEVERITY_LEVELS,
    BEHAVIOR_INCIDENT_STATUSES
} from '../../constants/behavior.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../../helpers/teacherScoping.js';
import { canManageBehaviorAdmin } from './accessService.js';
import { recordBehaviorAudit, BEHAVIOR_AUDIT_ACTIONS } from './auditService.js';

const badRequest = (message, code) => Object.assign(new Error(message), { statusCode: 400, code });
const forbidden = (message, code) => Object.assign(new Error(message), { statusCode: 403, code });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const MIN_LEVEL = Math.min(...BEHAVIOR_SEVERITY_LEVELS);
const MAX_LEVEL = Math.max(...BEHAVIOR_SEVERITY_LEVELS);
const MAX_PAGE_SIZE = 200;

const pageSize = (limit, fallback = 50) => Math.min(Number(limit) || fallback, MAX_PAGE_SIZE);
const pageSkip = (skip) => Math.max(Number(skip) || 0, 0);

const duplicateKey = (error, message, code) => {
    if (error?.code !== 11000) throw error;
    throw badRequest(message, code);
};

/**
 * A suspension is always a suggestion a human decides on, whatever the request
 * body says, so the flag is forced here rather than trusted from the client.
 */
const normalizeConsequence = (consequence = {}) => {
    const taskType = consequence.taskType;
    if (!BEHAVIOR_TASK_TYPES.includes(taskType)) throw badRequest('Unknown consequence type', 'INVALID_TASK_TYPE');
    if (!String(consequence.title || '').trim()) throw badRequest('Every consequence needs a title', 'CONSEQUENCE_TITLE_REQUIRED');

    const verifierRule = consequence.verifierRule || null;
    if (verifierRule && !BEHAVIOR_VERIFIER_RULES.includes(verifierRule)) {
        throw badRequest('Unknown verifier rule', 'INVALID_VERIFIER_RULE');
    }

    return {
        taskType,
        title: String(consequence.title).trim().slice(0, 200),
        instructions: String(consequence.instructions || '').trim().slice(0, 2000),
        dueInDays: Math.min(Math.max(Number(consequence.dueInDays) || 0, 0), 120),
        minWords: Math.min(Math.max(Number(consequence.minWords) || 0, 0), 2000),
        toWhom: ['person-affected', 'school', 'self'].includes(consequence.toWhom) ? consequence.toWhom : null,
        questions: (consequence.questions || []).map((q) => String(q).trim().slice(0, 500)).filter(Boolean),
        verifierRule,
        requiresHumanDecision: taskType === 'suspension' ? true : consequence.requiresHumanDecision === true
    };
};

const normalizeStep = (step = {}) => {
    const order = Number(step.order);
    if (!Number.isInteger(order) || order < 1) throw badRequest('Step order must be a positive number', 'INVALID_STEP_ORDER');

    const consequences = (step.consequences || []).map(normalizeConsequence);

    return {
        order,
        title: String(step.title || '').trim().slice(0, 200),
        summary: String(step.summary || '').trim().slice(0, 1000),
        consequences,
        actions: {
            emailParents: step?.actions?.emailParents === true,
            showInPortal: step?.actions?.showInPortal !== false,
            ccRoles: (step?.actions?.ccRoles || []).map((role) => String(role)).slice(0, 10)
        },
        requiresApproval: step?.requiresApproval === true || step?.requiresApproval === false ? step.requiresApproval : null,
        approverRoles: (step?.approverRoles || []).map((role) => String(role)).slice(0, 10),
        emailTemplateKey: step?.emailTemplateKey ? String(step.emailTemplateKey).slice(0, 120) : null
    };
};

const validateLadderSteps = (steps) => {
    if (!Array.isArray(steps)) throw badRequest('Steps must be a list', 'INVALID_STEPS');
    const normalized = steps.map(normalizeStep);
    const orders = new Set(normalized.map((step) => step.order));
    if (orders.size !== normalized.length) throw badRequest('Step orders must be unique', 'DUPLICATE_STEP_ORDER');
    return normalized.sort((a, b) => a.order - b.order);
};

export const listBehaviorTypes = async ({ req, includeInactive = false }) => {
    const filter = { school: req.schoolId, ...(includeInactive ? {} : { active: true }) };
    const types = await BehaviorType.find(filter)
        .sort({ level: 1, name: 1 })
        .select('-__v')
        .lean();

    const ladderIds = types.map((type) => type.ladder).filter(Boolean);
    const ladders = ladderIds.length
        ? await BehaviorLadder.find({ school: req.schoolId, _id: { $in: ladderIds } })
            .select('name steps overflowBehavior')
            .lean()
        : [];
    const ladderById = new Map(ladders.map((ladder) => [String(ladder._id), ladder]));

    return types.map((type) => {
        const ladder = ladderById.get(String(type.ladder || '')) || null;
        return {
            ...type,
            ladderSummary: ladder
                ? { _id: ladder._id, name: ladder.name, stepCount: (ladder.steps || []).length, overflowBehavior: ladder.overflowBehavior }
                : null
        };
    });
};

export const createBehaviorType = async ({ req, payload }) => {
    if (!canManageBehaviorAdmin(req.user)) throw forbidden('Only behavior administrators can edit the catalog.', 'NOT_BEHAVIOR_ADMIN');

    const name = String(payload?.name || '').trim();
    if (!name) throw badRequest('Behavior name is required', 'NAME_REQUIRED');
    const level = Number(payload?.level);
    if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
        throw badRequest(`Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}`, 'INVALID_LEVEL');
    }

    let ladderId = payload?.ladder || null;
    if (ladderId && !mongoose.isValidObjectId(ladderId)) throw badRequest('Invalid ladder id', 'INVALID_LADDER_ID');

    const created = await BehaviorType.create({
        school: req.schoolId,
        name: name.slice(0, 200),
        description: String(payload?.description || '').trim().slice(0, 1000),
        level,
        active: payload?.active !== false,
        ladder: ladderId
    }).catch((error) => duplicateKey(error, 'A behavior with that name already exists', 'DUPLICATE_BEHAVIOR_NAME'));

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.BEHAVIOR_TYPE_CHANGED,
        actor: req.user,
        targetType: 'behaviorType',
        targetId: created._id,
        after: { level, active: created.active }
    });

    return created;
};

export const updateBehaviorType = async ({ req, id, patch }) => {
    if (!canManageBehaviorAdmin(req.user)) throw forbidden('Only behavior administrators can edit the catalog.', 'NOT_BEHAVIOR_ADMIN');
    if (!mongoose.isValidObjectId(id)) throw badRequest('Invalid behavior id', 'INVALID_BEHAVIOR_ID');

    const update = { updatedBy: req.user._id };
    if (patch?.name !== undefined) {
        const name = String(patch.name).trim();
        if (!name) throw badRequest('Behavior name is required', 'NAME_REQUIRED');
        update.name = name.slice(0, 200);
    }
    if (patch?.description !== undefined) update.description = String(patch.description).trim().slice(0, 1000);
    if (patch?.active !== undefined) update.active = patch.active === true;
    if (patch?.level !== undefined) {
        const level = Number(patch.level);
        if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
            throw badRequest(`Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}`, 'INVALID_LEVEL');
        }
        update.level = level;
    }
    if (patch?.ladder !== undefined) {
        if (patch.ladder === null) update.ladder = null;
        else if (mongoose.isValidObjectId(patch.ladder)) update.ladder = patch.ladder;
        else throw badRequest('Invalid ladder id', 'INVALID_LADDER_ID');
    }

    const updated = await BehaviorType.findOneAndUpdate(
        { _id: id, school: req.schoolId },
        { $set: update },
        { new: true }
    ).catch((error) => duplicateKey(error, 'A behavior with that name already exists', 'DUPLICATE_BEHAVIOR_NAME'));
    if (!updated) throw notFound('Behavior not found');

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.BEHAVIOR_TYPE_CHANGED,
        actor: req.user,
        targetType: 'behaviorType',
        targetId: updated._id,
        after: { level: updated.level, active: updated.active }
    });

    return updated;
};

export const listLadders = async ({ req }) => BehaviorLadder
    .find({ school: req.schoolId })
    .sort({ name: 1 })
    .select('name behaviorType overflowBehavior updatedBy updatedAt')
    .populate('behaviorType', 'name level')
    .lean();

/**
 * Step counts live in the document body, so the list only carries the summary and
 * the editor pulls the full ladder when it is opened.
 */
export const getLadder = async ({ req, ladderId }) => {
    if (!mongoose.isValidObjectId(ladderId)) throw badRequest('Invalid ladder id', 'INVALID_LADDER_ID');
    const ladder = await BehaviorLadder.findOne({ _id: ladderId, school: req.schoolId }).lean();
    if (!ladder) throw notFound('Consequence ladder not found');
    return ladder;
};

export const saveLadder = async ({ req, ladderId = null, payload }) => {
    if (!canManageBehaviorAdmin(req.user)) throw forbidden('Only behavior administrators can edit ladders.', 'NOT_BEHAVIOR_ADMIN');

    const name = String(payload?.name || '').trim();
    if (!name) throw badRequest('Ladder name is required', 'LADDER_NAME_REQUIRED');

    const overflowBehavior = payload?.overflowBehavior || 'flag_for_admin';
    if (!BEHAVIOR_OVERFLOW_BEHAVIORS.includes(overflowBehavior)) {
        throw badRequest('Unknown overflow behaviour', 'INVALID_OVERFLOW');
    }

    const steps = validateLadderSteps(payload?.steps || []);
    const behaviorType = payload?.behaviorType || null;
    if (behaviorType && !mongoose.isValidObjectId(behaviorType)) throw badRequest('Invalid behavior id', 'INVALID_BEHAVIOR_ID');

    const existing = ladderId
        ? await BehaviorLadder.findOne({ _id: ladderId, school: req.schoolId }).lean()
        : null;
    if (ladderId && !existing) throw notFound('Consequence ladder not found');

    const doc = {
        school: req.schoolId,
        name: name.slice(0, 200),
        behaviorType: behaviorType ?? existing?.behaviorType ?? null,
        overflowBehavior,
        steps,
        updatedBy: req.user._id
    };

    const saved = existing
        ? await BehaviorLadder.findOneAndUpdate({ _id: ladderId, school: req.schoolId }, doc, { new: true })
        : await BehaviorLadder.create(doc);

    // A ladder is only reachable through its behavior, so keep the pointer in sync.
    if (doc.behaviorType) {
        await BehaviorType.updateOne(
            { _id: doc.behaviorType, school: req.schoolId },
            { $set: { ladder: saved._id } }
        );
    }

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.LADDER_CHANGED,
        actor: req.user,
        targetType: 'ladder',
        targetId: saved._id,
        before: existing ? { stepCount: (existing.steps || []).length } : null,
        after: { stepCount: steps.length, overflowBehavior }
    });

    return saved;
};

const BEHAVIOR_INCIDENT_STATUS_SET = new Set(BEHAVIOR_INCIDENT_STATUSES);

const incidentFilters = (query = {}) => {
    const filter = {};
    if (query.status && BEHAVIOR_INCIDENT_STATUS_SET.has(query.status)) filter.status = query.status;
    if (query.student && mongoose.isValidObjectId(query.student)) filter.student = query.student;
    if (query.behaviorType && mongoose.isValidObjectId(query.behaviorType)) filter.behaviorType = query.behaviorType;
    if (query.class && mongoose.isValidObjectId(query.class)) filter.class = query.class;
    if (query.reportedBy && mongoose.isValidObjectId(query.reportedBy)) filter.reportedBy = query.reportedBy;
    if (query.flagged === 'true') filter.flagForAdmin = true;
    if (query.serious === 'true') filter.isSerious = true;

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) filter.occurredAt = { ...(filter.occurredAt || {}), $gte: from };
    if (to && !Number.isNaN(to.getTime())) filter.occurredAt = { ...(filter.occurredAt || {}), $lte: to };
    return filter;
};

/**
 * Staff list. A teacher only ever sees their own classes, and the note fields are
 * left out of the projection so the page never ships them by accident.
 */
export const listBehaviorIncidents = async ({ req, query = {}, limit, skip }) => {
    const filter = { school: req.schoolId, ...incidentFilters(query) };

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) throw forbidden('Teacher profile not found.', 'TEACHER_PROFILE_MISSING');
        filter.class = { $in: await getTeacherClassIds(teacher._id) };
    }

    const [items, total] = await Promise.all([
        BehaviorIncident.find(filter)
            .sort({ occurredAt: -1 })
            .skip(pageSkip(skip))
            .limit(pageSize(limit))
            .select('-staffNotes -otherStudentsInvolved -emailDraft.body -emailDraft.recipients -emailDraft.cc -__v')
            .populate('student', 'firstName lastName studentId')
            .populate('behaviorType', 'name level')
            .populate('reportedBy', 'firstName lastName role')
            .lean(),
        BehaviorIncident.countDocuments(filter)
    ]);

    return { items, total };
};

/**
 * Full incident for the workspace: tasks, communication state and the audit trail.
 */
export const getBehaviorIncidentBundle = async ({ req, incidentId }) => {
    if (!mongoose.isValidObjectId(incidentId)) throw badRequest('Invalid incident id', 'INVALID_INCIDENT_ID');

    const incident = await BehaviorIncident.findOne({ _id: incidentId, school: req.schoolId })
        .populate('student', 'firstName lastName studentId currentClass')
        .populate('behaviorType', 'name level description')
        .populate('reportedBy', 'firstName lastName role')
        .lean();
    if (!incident) throw notFound('Incident not found');

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        const classIds = (await getTeacherClassIds(teacher?._id)).map((id) => String(id));
        const linked = String(incident.student?.currentClass || '');
        if (!teacher || (linked && !classIds.includes(linked))) {
            throw forbidden('Not authorized for this incident.', 'NOT_AUTHORIZED_STUDENT');
        }
    }

    const [tasks, notifications, ladder] = await Promise.all([
        BehaviorTask.find({ school: req.schoolId, incident: incident._id })
            .sort({ dueAt: 1 })
            .select('-__v')
            .lean(),
        BehaviorNotification.find({ school: req.schoolId, incident: incident._id })
            .select('channel status language blockedReason readyAt createdAt')
            .sort({ createdAt: 1 })
            .lean(),
        incident.appliedStep?.ladder
            ? BehaviorLadder.findOne({ _id: incident.appliedStep.ladder, school: req.schoolId })
                .select('name steps overflowBehavior')
                .lean()
            : Promise.resolve(null)
    ]);

    return {
        incident,
        tasks,
        // Status only. Addresses and bodies never leave through this list.
        communications: notifications.map((row) => ({
            channel: row.channel,
            status: row.status,
            language: row.language,
            blockedReason: row.blockedReason || null,
            readyAt: row.readyAt || null
        })),
        ladder: ladder
            ? {
                _id: ladder._id,
                name: ladder.name,
                overflowBehavior: ladder.overflowBehavior,
                steps: (ladder.steps || []).map((step) => ({ order: step.order, title: step.title, summary: step.summary }))
            }
            : null
    };
};

export const listEmailTemplates = async ({ req }) => BehaviorEmailTemplate
    .find({ school: req.schoolId })
    .sort({ key: 1, language: 1 })
    .select('key language label subject body variables active updatedAt')
    .lean();

export const saveEmailTemplate = async ({ req, payload }) => {
    if (!canManageBehaviorAdmin(req.user)) throw forbidden('Only behavior administrators can edit templates.', 'NOT_BEHAVIOR_ADMIN');

    const key = String(payload?.key || '').trim();
    const language = payload?.language === 'ar' ? 'ar' : 'en';
    const subject = String(payload?.subject || '').trim();
    const body = String(payload?.body || '').trim();
    if (!key) throw badRequest('Template key is required', 'TEMPLATE_KEY_REQUIRED');
    if (!subject || !body) throw badRequest('Template subject and body are required', 'TEMPLATE_INCOMPLETE');

    const template = await BehaviorEmailTemplate.findOneAndUpdate(
        { school: req.schoolId, key, language },
        {
            $set: {
                label: String(payload?.label || key).trim().slice(0, 200),
                subject: subject.slice(0, 300),
                body: body.slice(0, 20000),
                variables: Array.from(new Set((payload?.variables || []).map((v) => String(v)).slice(0, 40))),
                active: payload?.active !== false,
                updatedBy: req.user._id
            }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.TEMPLATE_CHANGED,
        actor: req.user,
        targetType: 'template',
        targetId: template?._id || null,
        after: { key, language }
    });

    return template;
};
