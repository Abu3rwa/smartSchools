import test from 'node:test';
import assert from 'node:assert/strict';

import BehaviorSettings from '../models/BehaviorSettings.js';
import BehaviorNotification from '../models/BehaviorNotification.js';
import BehaviorEmailTemplate from '../models/BehaviorEmailTemplate.js';
import BehaviorAuditLog from '../models/BehaviorAuditLog.js';
import BehaviorTask from '../models/BehaviorTask.js';
import BehaviorIncident from '../models/BehaviorIncident.js';
import BehaviorCounter from '../models/BehaviorCounter.js';
import { requireBehaviorSystem } from '../middleware/requireBehaviorSystem.js';
import { behaviorSettingsPatchBodySchema } from '../validators/behaviorValidators.js';
import {
    updateBehaviorSettings,
    invalidateBehaviorSettingsCache,
    getBehaviorSettings
} from '../services/behavior/settingsService.js';
import { releaseIncidentCommunications } from '../services/behavior/notificationService.js';
import { submitBehaviorTask } from '../services/behavior/taskService.js';
import { voidBehaviorIncident } from '../services/behavior/incidentService.js';

const originals = {
    settingsUpdate: BehaviorSettings.findOneAndUpdate,
    notificationUpdate: BehaviorNotification.findOneAndUpdate,
    notificationFindOne: BehaviorNotification.findOne,
    notificationCount: BehaviorNotification.countDocuments,
    templateFindOne: BehaviorEmailTemplate.findOne,
    auditCreate: BehaviorAuditLog.create,
    taskFindOne: BehaviorTask.findOne,
    taskUpdateOne: BehaviorTask.findOneAndUpdate,
    taskUpdateMany: BehaviorTask.updateMany,
    incidentFindOne: BehaviorIncident.findOne,
    incidentUpdateOne: BehaviorIncident.updateOne,
    counterUpdateOne: BehaviorCounter.updateOne
};

const restore = () => {
    BehaviorSettings.findOneAndUpdate = originals.settingsUpdate;
    BehaviorNotification.findOneAndUpdate = originals.notificationUpdate;
    BehaviorNotification.findOne = originals.notificationFindOne;
    BehaviorNotification.countDocuments = originals.notificationCount;
    BehaviorEmailTemplate.findOne = originals.templateFindOne;
    BehaviorAuditLog.create = originals.auditCreate;
    BehaviorTask.findOne = originals.taskFindOne;
    BehaviorTask.findOneAndUpdate = originals.taskUpdateOne;
    BehaviorTask.updateMany = originals.taskUpdateMany;
    BehaviorIncident.findOne = originals.incidentFindOne;
    BehaviorIncident.updateOne = originals.incidentUpdateOne;
    BehaviorCounter.updateOne = originals.counterUpdateOne;
};

const quietAudit = () => {
    const rows = [];
    BehaviorAuditLog.create = async (payload) => {
        rows.push(payload);
        return payload;
    };
    return rows;
};

const runMiddleware = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            resolve({ statusCode: this.statusCode, payload, next: null });
            return this;
        }
    };
    handler(req, res, (error) => resolve({ statusCode: 200, payload: null, next: error || 'called' }));
});

const req = (overrides = {}) => ({
    schoolId: 'school-1',
    user: { _id: 'u-1', role: 'teacher', firstName: 'A', lastName: 'B' },
    ...overrides
});

test('every behavior route answers 404 while the module is switched off', async () => {
    BehaviorSettings.findOneAndUpdate = async () => ({ enabled: false });
    invalidateBehaviorSettingsCache('school-off');

    const result = await runMiddleware(requireBehaviorSystem, req({ schoolId: 'school-off' }));
    assert.equal(result.statusCode, 404);
    assert.equal(result.payload.code, 'BEHAVIOR_SYSTEM_DISABLED');
    assert.equal(result.next, null);
    restore();
});

test('the gate lets requests through once the flag is on', async () => {
    BehaviorSettings.findOneAndUpdate = async () => ({ enabled: true });
    invalidateBehaviorSettingsCache('school-on');

    const result = await runMiddleware(requireBehaviorSystem, req({ schoolId: 'school-on' }));
    assert.equal(result.next, 'called');
    restore();
});

test('BEHAVIOR_SYSTEM_ENABLED overrides the stored flag both ways', async () => {
    const stored = { school: 'school-env', enabled: false };
    BehaviorSettings.findOneAndUpdate = async () => stored;

    process.env.BEHAVIOR_SYSTEM_ENABLED = 'true';
    invalidateBehaviorSettingsCache('school-env');
    assert.equal((await getBehaviorSettings('school-env')).enabled, true);
    assert.equal((await updateBehaviorSettings({ schoolId: 'school-env', patch: {} })).enabled, true);
    const on = await runMiddleware(requireBehaviorSystem, req({ schoolId: 'school-env' }));
    assert.equal(on.next, 'called');

    stored.enabled = true;
    process.env.BEHAVIOR_SYSTEM_ENABLED = 'false';
    invalidateBehaviorSettingsCache('school-env');
    assert.equal((await getBehaviorSettings('school-env')).enabled, false);
    const off = await runMiddleware(requireBehaviorSystem, req({ schoolId: 'school-env' }));
    assert.equal(off.payload.code, 'BEHAVIOR_SYSTEM_DISABLED');

    // Unset restores the per-school document as the single source of truth.
    delete process.env.BEHAVIOR_SYSTEM_ENABLED;
    invalidateBehaviorSettingsCache('school-env');
    assert.equal((await getBehaviorSettings('school-env')).enabled, true);
    assert.equal(stored.enabled, true, 'the override must not rewrite the document');
    restore();
});

test('settings writes keep the school email switch but never auto-send on timeout', async () => {
    let written = null;
    BehaviorSettings.findOneAndUpdate = async (filter, update) => {
        written = update.$set;
        return { school: 'school-1', ...written };
    };

    await updateBehaviorSettings({
        schoolId: 'school-1',
        actorId: 'u-1',
        patch: {
            approval: { defaultRequired: true, autoSendOnTimeout: true },
            emailDelivery: { enabled: true, defaultLanguage: 'ar' }
        }
    });

    assert.equal(written.approval.autoSendOnTimeout, false);
    assert.equal(written.emailDelivery.enabled, true, 'the school decides whether families are emailed');
    assert.equal(written.emailDelivery.defaultLanguage, 'ar');
    restore();
});

test('a settings patch that omits the language list leaves it alone', async () => {
    let written = null;
    BehaviorSettings.findOneAndUpdate = async (filter, update) => {
        written = update.$set;
        return { school: 'school-1', ...written };
    };

    await updateBehaviorSettings({
        schoolId: 'school-1',
        actorId: 'u-1',
        patch: { emailDelivery: { enabled: true, supportedLanguages: ['en', 'ar', 'fr'] } }
    });

    assert.deepEqual(written.emailDelivery.supportedLanguages, ['en', 'ar'], 'unknown codes are dropped');
    restore();
});

test('the settings validator keeps the email switch instead of stripping it', async () => {
    const parsed = behaviorSettingsPatchBodySchema.safeParse({
        emailDelivery: { enabled: true, defaultLanguage: 'ar' }
    });

    assert.equal(parsed.success, true);
    assert.equal(parsed.data.emailDelivery.enabled, true,
        'a stripped key here is why delivery could never be switched on');
    assert.equal(
        behaviorSettingsPatchBodySchema.safeParse({ emailDelivery: { defaultLanguage: 'fr' } }).success,
        false
    );
});

test('settings reads are cached and dropped on write', async () => {
    let calls = 0;
    BehaviorSettings.findOneAndUpdate = async () => {
        calls += 1;
        return { school: 'school-1', enabled: false };
    };
    invalidateBehaviorSettingsCache('school-cache');

    await getBehaviorSettings('school-cache');
    await getBehaviorSettings('school-cache');
    assert.equal(calls, 1, 'the second read must come from cache');

    invalidateBehaviorSettingsCache('school-cache');
    await getBehaviorSettings('school-cache');
    assert.equal(calls, 2);
    restore();
});

const commSetup = ({ sentLanguages = [] } = {}) => {
    const rows = [];
    BehaviorEmailTemplate.findOne = () => ({ lean: async () => null });
    // The release reads the stored row so a message that already went out is not
    // re-queued; tests say which languages are already sent.
    BehaviorNotification.findOne = (filter) => ({
        select: () => ({
            lean: async () => (sentLanguages.some((language) => filter.idempotencyKey.endsWith(`:${language}`))
                ? { status: 'sent' }
                : null)
        })
    });
    BehaviorNotification.findOneAndUpdate = async (filter, update) => {
        const payload = update.$set;
        rows.push({ filter, payload });
        return payload;
    };
    quietAudit();

    const incident = {
        _id: 'inc-1',
        school: 'school-1',
        status: 'in_progress',
        occurredAt: new Date('2026-10-20T08:00:00.000Z'),
        emailDraft: {},
        portalReleased: false,
        save: async () => incident
    };
    const student = {
        _id: 'stu-1',
        firstName: 'Sara',
        getAllContactEmailEntries: () => ([
            { type: 'father', name: 'Mr Sara', email: 'father@example.test' },
            { type: 'student', name: 'Sara', email: 'sara@example.test' }
        ])
    };
    const settings = {
        emailDelivery: { enabled: false, defaultLanguage: 'en', supportedLanguages: ['en', 'ar'] },
        cc: { roles: [] },
        sendDelayMinutes: 0,
        apologyMinWords: 100
    };

    return { rows, incident, student, settings };
};

test('with the school switch off, family mail is held rather than queued', async () => {
    const { rows, incident, student, settings } = commSetup();

    await releaseIncidentCommunications({
        incident,
        step: { order: 2, title: 'Written warning', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Phone use' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings,
        tasks: [{ dueAt: new Date('2026-10-23T08:00:00.000Z') }],
        approvalCleared: true,
        actor: { _id: 'u-1' }
    });

    const emails = rows.filter((row) => row.payload.channel === 'email');
    assert.equal(emails.length, 2, 'one draft per supported language');
    assert.ok(emails.every((row) => row.payload.status === 'suppressed'));
    assert.ok(emails.every((row) => row.payload.blockedReason === 'DELIVERY_DISABLED'));
    assert.ok(rows.every((row) => row.payload.status !== 'draft'));
    restore();
});

test('with the school switch on, an approved step queues a sendable draft', async () => {
    const { rows, incident, student, settings } = commSetup();

    await releaseIncidentCommunications({
        incident,
        step: { order: 2, title: 'Written warning', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Phone use' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings: { ...settings, emailDelivery: { ...settings.emailDelivery, enabled: true } },
        tasks: [],
        approvalCleared: true,
        actor: { _id: 'u-1' }
    });

    const emails = rows.filter((row) => row.payload.channel === 'email');
    assert.equal(emails.length, 2);
    assert.ok(emails.every((row) => row.payload.status === 'draft'));
    assert.ok(emails.every((row) => row.payload.blockedReason === null));
    assert.ok(emails.every((row) => row.payload.nextAttemptAt instanceof Date));
    // The student's own address is a contact, not a recipient of a family notice.
    assert.ok(emails.every((row) => row.payload.recipients.every((entry) => entry.email !== 'sara@example.test')));
    restore();
});

test('a message that already reached a family is never re-queued by a second release', async () => {
    const { rows, incident, student, settings } = commSetup({ sentLanguages: ['en'] });

    await releaseIncidentCommunications({
        incident,
        step: { order: 2, title: 'Written warning', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Phone use' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings: { ...settings, emailDelivery: { ...settings.emailDelivery, enabled: true } },
        tasks: [],
        approvalCleared: true,
        actor: { _id: 'u-1' }
    });

    const english = rows.find((row) => row.filter.idempotencyKey.endsWith(':en'));
    const arabic = rows.find((row) => row.filter.idempotencyKey.endsWith(':ar'));

    assert.equal(english.payload.status, undefined, 'the sent row keeps its status');
    assert.equal(english.payload.nextAttemptAt, undefined);
    assert.equal(arabic.payload.status, 'draft', 'the unsent language is still queued');
    restore();
});

test('the approver wording edit reaches the row that is sent', async () => {
    const { rows, incident, student, settings } = commSetup();

    await releaseIncidentCommunications({
        incident,
        step: { order: 2, title: 'Written warning', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Phone use' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings: { ...settings, emailDelivery: { ...settings.emailDelivery, enabled: true } },
        tasks: [],
        approvalCleared: true,
        draftEdits: { subject: 'A corrected subject', language: 'en' },
        actor: { _id: 'u-1' }
    });

    const english = rows.find((row) => row.filter.idempotencyKey.endsWith(':en'));
    const arabic = rows.find((row) => row.filter.idempotencyKey.endsWith(':ar'));

    assert.equal(english.payload.subject, 'A corrected subject');
    assert.match(arabic.payload.subject, /بخصوص/, 'the other language keeps its own rendering');
    restore();
});

test('each language draft carries its own facts and its own date wording', async () => {
    const { rows, incident, student, settings } = commSetup();

    await releaseIncidentCommunications({
        incident,
        step: { order: 3, title: 'Make it right', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Phone use' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings: { ...settings, emailDelivery: { ...settings.emailDelivery, enabled: true } },
        tasks: [{ dueAt: new Date('2026-10-23T08:00:00.000Z') }],
        approvalCleared: true,
        actor: { _id: 'u-1' }
    });

    const english = rows.find((row) => row.filter.idempotencyKey.endsWith(':en')).payload;
    const arabic = rows.find((row) => row.filter.idempotencyKey.endsWith(':ar')).payload;

    assert.equal(english.facts.nextStep, 'Make it right');
    assert.equal(english.facts.dueBy, '23 October 2026');
    assert.match(arabic.facts.dueBy, /أكتوبر/, 'an arabic draft dates itself in arabic');
    assert.equal(arabic.body.includes('The work is due by'), false,
        'the english due line must not be glued onto the arabic letter');
    assert.equal(english.body.includes('{{dueLine}}'), false, 'no token may survive into a sent message');
    restore();
});

test('notification rows are idempotent per incident, step, channel and language', async () => {
    const { incident, student, settings, rows } = commSetup();
    const args = {
        incident,
        step: { order: 2, title: 'Written warning', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Phone use' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings,
        tasks: [],
        approvalCleared: true,
        actor: { _id: 'u-1' }
    };

    await releaseIncidentCommunications(args);
    const firstKeys = rows.map((row) => row.filter.idempotencyKey);
    await releaseIncidentCommunications(args);
    const secondKeys = rows.slice(3).map((row) => row.filter.idempotencyKey);

    assert.deepEqual(firstKeys, secondKeys);
    assert.equal(new Set(firstKeys).size, firstKeys.length);
    assert.ok(firstKeys.every((key) => typeof key === 'string' && key.length > 0));
    assert.ok(rows.every((row) => row.payload.idempotencyKey === undefined),
        'the key must stay out of $set, or MongoDB rejects the update');
    restore();
});

test('upserting a notification must not claim the same path twice', async () => {
    const { incident, student, settings } = commSetup();

    // Replaces the lenient stub with a second update object, so the driver rule
    // is enforced: a path may appear in $set or $setOnInsert, never both.
    BehaviorNotification.findOneAndUpdate = async (filter, update) => {
        const paths = [...Object.keys(update.$set || {}), ...Object.keys(update.$setOnInsert || {})];
        const clash = paths.filter((path) => paths.indexOf(path) !== paths.lastIndexOf(path));
        if (clash.length) {
            const error = new Error(`Updating the path '${clash[0]}' would create a conflict at '${clash[0]}'`);
            error.codeName = 'ConflictingUpdateOperators';
            throw error;
        }
        return { ...filter, ...update.$setOnInsert, ...update.$set, save: async () => {} };
    };

    await releaseIncidentCommunications({
        incident,
        step: { order: 3, title: 'Make it right', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Phone use' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings,
        tasks: [],
        approvalCleared: true,
        actor: { _id: 'u-1' }
    });
    restore();
});

test('nothing is released to the family while an approval is outstanding', async () => {
    const { rows, incident, student, settings } = commSetup();

    await releaseIncidentCommunications({
        incident,
        step: { order: 3, title: 'Apology letter', summary: '', actions: { emailParents: true, showInPortal: true, ccRoles: [] } },
        student,
        behaviorType: { _id: 'bt-1', name: 'Disrespect' },
        school: { name: 'Test School' },
        staff: { _id: 'u-1', firstName: 'A' },
        settings,
        tasks: [],
        approvalCleared: false,
        actor: { _id: 'u-1' }
    });

    assert.ok(rows.every((row) => row.payload.status === 'suppressed'));
    assert.ok(rows.every((row) => row.payload.blockedReason === 'AWAITING_APPROVAL'));
    assert.equal(incident.portalReleased, false);
    restore();
});

const TASK_ID = '5f9f9f9f9f9f9f9f9f9f9f9f';

const submittableTask = (overrides = {}) => ({
    _id: TASK_ID,
    school: 'school-1',
    student: 'stu-1',
    incident: 'inc-1',
    taskType: 'apology_letter',
    title: 'Apology letter',
    minWords: 100,
    status: 'assigned',
    ...overrides
});

test('a short written task is rejected by the server, not only the browser', async () => {
    BehaviorTask.findOne = () => ({ lean: async () => submittableTask() });
    quietAudit();

    await assert.rejects(
        () => submitBehaviorTask({
            req: req(),
            taskId: TASK_ID,
            text: 'Sorry.',
            answers: [],
            linkedStudentId: 'stu-1'
        }),
        (error) => error.code === 'WORD_COUNT_TOO_SHORT'
            && error.statusCode === 400
            && error.minWords === 100
    );
    restore();
});

test('a family cannot submit work that belongs to another student', async () => {
    BehaviorTask.findOne = () => ({ lean: async () => submittableTask() });
    quietAudit();

    await assert.rejects(
        () => submitBehaviorTask({
            req: req({ user: { _id: 'u-9', role: 'student' } }),
            taskId: TASK_ID,
            text: 'a'.repeat(200),
            answers: [],
            linkedStudentId: 'other-student'
        }),
        (error) => error.statusCode === 403
    );
    restore();
});

test('a written task is accepted once it reaches the minimum and becomes submitted', async () => {
    const saved = { _id: 'task-1', status: 'submitted', submission: { wordCount: 120 } };
    BehaviorTask.findOne = () => ({ lean: async () => submittableTask() });
    BehaviorTask.findOneAndUpdate = () => ({
        populate: () => ({ lean: async () => saved })
    });
    BehaviorIncident.updateOne = async () => ({});
    const audits = quietAudit();

    const task = await submitBehaviorTask({
        req: req(),
        taskId: TASK_ID,
        text: Array.from({ length: 120 }, (unused, index) => `word${index}`).join(' '),
        answers: [{ question: 'What happened?', answer: 'I took a phone.' }],
        linkedStudentId: 'stu-1'
    });

    assert.equal(task.status, 'submitted');
    assert.equal(audits[0].action, 'task_submitted');
    assert.equal(audits[0].after.wordCount, 120);
    restore();
});

const voidableIncident = () => {
    const doc = {
        _id: 'inc-1',
        school: 'school-1',
        student: 'stu-1',
        behaviorType: 'bt-1',
        status: 'in_progress',
        countSnapshot: { windowKey: 'year:2026-2027' },
        set(key, value) {
            this[key] = value;
        },
        save: async () => doc
    };
    return doc;
};

test('voiding an incident needs a reason', async () => {
    quietAudit();
    await assert.rejects(
        () => voidBehaviorIncident({ req: req(), incidentId: 'inc-1', reason: '  ' }),
        (error) => error.code === 'VOID_REASON_REQUIRED'
    );
    restore();
});

test('voiding releases the occurrence and waives open tasks', async () => {
    const incident = voidableIncident();
    BehaviorIncident.findOne = () => ({ lean: async () => incident });
    const audits = quietAudit();

    let decremented = null;
    BehaviorCounter.updateOne = async (filter, update) => {
        decremented = { filter, update };
        return { modifiedCount: 1 };
    };
    let waived = null;
    BehaviorTask.updateMany = async (filter, update) => {
        waived = { filter, update };
        return { modifiedCount: 2 };
    };

    // voidBehaviorIncident loads a live document, so findOne must return the doc
    BehaviorIncident.findOne = () => incident;

    await voidBehaviorIncident({ req: req({ user: { _id: 'u-1', role: 'admin' } }), incidentId: 'inc-1', reason: 'Logged for the wrong student' });

    assert.equal(incident.status, 'voided');
    assert.equal(decremented.update.$inc.count, -1);
    assert.equal(decremented.filter.windowKey, 'year:2026-2027');
    assert.equal(waived.update.$set.status, 'waived');
    assert.ok(audits.some((row) => row.action === 'status_voided'));
    restore();
});
