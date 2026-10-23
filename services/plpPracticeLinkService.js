import mongoose from 'mongoose';
import SpellingSession from '../models/SpellingSession.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
// Registered for their own sake: plan.skills and assignment.set populate these
// refs, and Mongoose fails the query if the target model was never loaded.
import '../models/MapPracticeSkill.js';
import '../models/MapPracticeSet.js';

/**
 * A PLP goal can name a subject and a standard, but that says nothing about the
 * work the student is actually doing. This service finds that work — spelling
 * sessions and MAP practice for the same student — so a teacher can attach it to
 * a goal, and so the link can be re-checked instead of trusted.
 */

export const PRACTICE_LINK_KINDS = ['spelling_session', 'map_practice_plan', 'map_practice_assignment'];

export const MAX_PRACTICE_LINKS = 10;

const CANDIDATES_PER_KIND = 12;

const SPELLING_TYPE_LABELS = {
    'spelling-assessment': 'Spelling assessment',
    'formal-spelling-test': 'Formal spelling test',
    'retest-quiz': 'Retest quiz',
};

const clamp = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const formatShortDate = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const spellingLabel = (session) => {
    const type = SPELLING_TYPE_LABELS[session.assessmentType] || 'Spelling session';
    return clamp(session.curriculumWeek ? `${type} · week ${session.curriculumWeek}` : type, 180);
};

const spellingDetail = (session) => {
    const attempts = Array.isArray(session.attempts) ? session.attempts : [];
    if (!attempts.length) return clamp(`${session.status === 'scheduled' ? 'Not started' : 'In progress'} · no answers yet`, 400);
    const attempted = new Set(attempts.map((attempt) => String(attempt.wordId))).size;
    const missed = new Set(attempts
        .filter((attempt) => attempt.skipped !== true && attempt.correct === false)
        .map((attempt) => String(attempt.wordId))).size;
    const stamp = formatShortDate(session.completedAt || session.startedAt);
    return clamp(`${missed} of ${attempted} words missed${stamp ? ` · ${stamp}` : ''}`, 400);
};

const planDetail = (plan) => {
    const skills = (plan.skills || []).slice(0, 4).map((skill) => skill?.name || skill?.code).filter(Boolean);
    const rest = (plan.skills || []).length - skills.length;
    const skillText = skills.length
        ? `${skills.join(', ')}${rest > 0 ? ` +${rest} more` : ''}`
        : 'No skills listed yet';
    return clamp(skillText, 400);
};

const assignmentDetail = (assignment) => {
    const pieces = [
        assignment.status,
        assignment.set?.questionCount ? `${assignment.set.questionCount} questions` : '',
        assignment.dueDate ? `due ${formatShortDate(assignment.dueDate)}` : '',
    ].filter(Boolean);
    return clamp(pieces.join(' · '), 400);
};

const collectSpelling = async ({ schoolId, studentId, ids = null }) => {
    const filter = { school: schoolId, student: studentId };
    if (ids) {
        filter._id = { $in: ids };
    } else {
        filter.status = { $in: ['in-progress', 'completed'] };
    }
    const sessions = await SpellingSession.find(filter)
        .select('assessmentType status curriculumWeek startedAt completedAt attempts')
        .sort({ startedAt: -1 })
        .limit(ids ? ids.length : CANDIDATES_PER_KIND)
        .lean();
    return sessions.map((session) => ({
        kind: 'spelling_session',
        targetId: String(session._id),
        label: spellingLabel(session),
        detail: spellingDetail(session),
        updatedAt: session.completedAt || session.startedAt || null,
    }));
};

const collectMapPlans = async ({ schoolId, studentId, ids = null }) => {
    const filter = { school: schoolId, student: studentId };
    if (ids) filter._id = { $in: ids };
    else filter.status = 'active';
    const plans = await MapPracticePlan.find(filter)
        .select('title skills updatedAt')
        .populate('skills', 'name code')
        .sort({ updatedAt: -1 })
        .limit(ids ? ids.length : CANDIDATES_PER_KIND)
        .lean();
    return plans.map((plan) => ({
        kind: 'map_practice_plan',
        targetId: String(plan._id),
        label: clamp(plan.title, 180),
        detail: planDetail(plan),
        updatedAt: plan.updatedAt || null,
    }));
};

const collectMapAssignments = async ({ schoolId, studentId, ids = null }) => {
    const filter = { school: schoolId, student: studentId };
    if (ids) filter._id = { $in: ids };
    const assignments = await MapPracticeAssignment.find(filter)
        .select('status dueDate set plan createdAt')
        .populate('set', 'title questionCount')
        .populate('plan', 'title')
        .sort({ createdAt: -1 })
        .limit(ids ? ids.length : CANDIDATES_PER_KIND)
        .lean();
    return assignments.map((assignment) => ({
        kind: 'map_practice_assignment',
        targetId: String(assignment._id),
        label: clamp([assignment.set?.title, assignment.plan?.title].filter(Boolean).join(' · ') || 'MAP practice assignment', 180),
        detail: assignmentDetail(assignment),
        updatedAt: assignment.createdAt || null,
    }));
};

const COLLECTORS = {
    spelling_session: collectSpelling,
    map_practice_plan: collectMapPlans,
    map_practice_assignment: collectMapAssignments,
};

/**
 * Every candidate this student could be linked to, newest first. Labels and
 * details are built here, never taken from the client.
 */
export const collectPracticeCandidates = async ({ schoolId, studentId } = {}) => {
    if (!schoolId || !studentId) {
        throw Object.assign(new Error('School and student are required'), { statusCode: 400 });
    }
    const groups = await Promise.all(Object.values(COLLECTORS).map((collect) => collect({ schoolId, studentId })));
    return groups.flat().sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
};

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Turns what the client sent (kind + id + optional reason) into stored links by
 * re-reading each target under the same school and student. A link that points at
 * another student's session, an unknown kind, or a forged id fails here rather
 * than being written into the plan.
 */
export const resolvePracticeLinks = async ({ schoolId, studentId, submitted = [], actorId = null } = {}) => {
    if (!Array.isArray(submitted)) throw badRequest('links must be an array');
    if (submitted.length > MAX_PRACTICE_LINKS) {
        throw badRequest(`A goal can link at most ${MAX_PRACTICE_LINKS} practice items`);
    }

    const requested = submitted.map((link) => {
        const kind = String(link?.kind || '').trim();
        const targetId = String(link?.targetId || '').trim();
        if (!PRACTICE_LINK_KINDS.includes(kind)) throw badRequest('Unknown linked practice type');
        if (!mongoose.isValidObjectId(targetId)) throw badRequest('Invalid linked practice id');
        const source = String(link?.source || '').trim() === 'ai_suggested' ? 'ai_suggested' : 'teacher';
        return { kind, targetId, source, reason: clamp(link?.reason, 300) };
    });

    const unique = new Map(requested.map((link) => [`${link.kind}:${link.targetId}`, link]));
    const linkedAt = new Date();
    const resolved = [];
    for (const kind of PRACTICE_LINK_KINDS) {
        const group = [...unique.values()].filter((link) => link.kind === kind);
        if (!group.length) continue;
        const found = await COLLECTORS[kind]({ schoolId, studentId, ids: group.map((link) => link.targetId) });
        const byId = new Map(found.map((candidate) => [candidate.targetId, candidate]));
        for (const link of group) {
            const candidate = byId.get(link.targetId);
            if (!candidate) throw badRequest('Linked practice does not belong to this student');
            resolved.push({
                kind,
                targetId: link.targetId,
                label: candidate.label,
                detail: candidate.detail,
                source: link.source,
                reason: link.reason,
                linkedBy: actorId,
                linkedAt,
            });
        }
    }
    return resolved;
};
