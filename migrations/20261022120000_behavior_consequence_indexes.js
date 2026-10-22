/**
 * Behavior & Consequence: create the indexes the module reads through, all in
 * the background so a live school is never locked while they build.
 *
 * Idempotent: every index is checked by name first, and the unique counter and
 * notification indexes are what make concurrent writes and retries safe.
 */

const BACKGROUND = { background: true };

const INDEXES = [
    {
        collection: 'behavior_settings',
        indexes: [
            // Same key and name Mongoose derives from the unique field, so the
            // migration converges with auto-index instead of adding a twin.
            { key: { school: 1 }, name: 'school_1', unique: true }
        ]
    },
    {
        collection: 'behavior_types',
        indexes: [
            { key: { school: 1, name: 1 }, name: 'school_1_name_1', unique: true },
            { key: { school: 1, active: 1, level: 1 }, name: 'school_1_active_1_level_1' },
            { key: { school: 1, seedKey: 1 }, name: 'school_1_seedKey_1' }
        ]
    },
    {
        collection: 'behavior_ladders',
        indexes: [
            { key: { school: 1, behaviorType: 1 }, name: 'school_1_behaviorType_1' },
            { key: { school: 1, seedKey: 1 }, name: 'school_1_seedKey_1' }
        ]
    },
    {
        collection: 'behavior_incidents',
        indexes: [
            { key: { school: 1, student: 1, behaviorType: 1, occurredAt: -1 }, name: 'school_1_student_1_behaviorType_1_occurredAt_-1' },
            { key: { school: 1, status: 1, occurredAt: -1 }, name: 'school_1_status_1_occurredAt_-1' },
            { key: { school: 1, reportedBy: 1, occurredAt: -1 }, name: 'school_1_reportedBy_1_occurredAt_-1' },
            { key: { school: 1, 'approval.decidedAt': -1 }, name: 'school_1_approval.decidedAt_-1' },
            { key: { school: 1, student: 1, portalReleased: 1, occurredAt: -1 }, name: 'school_1_student_1_portalReleased_1_occurredAt_-1' },
            { key: { school: 1, flagForAdmin: 1, createdAt: -1 }, name: 'school_1_flagForAdmin_1_createdAt_-1' }
        ]
    },
    {
        collection: 'behavior_tasks',
        indexes: [
            { key: { school: 1, dueAt: 1, status: 1 }, name: 'school_1_dueAt_1_status_1' },
            { key: { school: 1, student: 1, status: 1, dueAt: 1 }, name: 'school_1_student_1_status_1_dueAt_1' },
            { key: { incident: 1, taskType: 1 }, name: 'incident_1_taskType_1' },
            { key: { school: 1, 'verifier.user': 1, status: 1 }, name: 'school_1_verifier.user_1_status_1' }
        ]
    },
    {
        // The atomic occurrence counter: one row per student + behavior + window.
        collection: 'behavior_counters',
        indexes: [
            { key: { school: 1, student: 1, behaviorType: 1, windowKey: 1 }, name: 'school_1_student_1_behaviorType_1_windowKey_1', unique: true }
        ]
    },
    {
        collection: 'behavior_count_resets',
        indexes: [
            { key: { school: 1, student: 1, behaviorType: 1, resetAt: -1 }, name: 'school_1_student_1_behaviorType_1_resetAt_-1' }
        ]
    },
    {
        collection: 'behavior_notifications',
        indexes: [
            { key: { idempotencyKey: 1 }, name: 'idempotencyKey_1', unique: true },
            { key: { school: 1, incident: 1, channel: 1 }, name: 'school_1_incident_1_channel_1' },
            { key: { school: 1, status: 1, createdAt: -1 }, name: 'school_1_status_1_createdAt_-1' }
        ]
    },
    {
        collection: 'behavior_email_templates',
        indexes: [
            { key: { school: 1, key: 1, language: 1 }, name: 'school_1_key_1_language_1', unique: true }
        ]
    },
    {
        collection: 'behavior_audit_log',
        indexes: [
            { key: { school: 1, createdAt: -1 }, name: 'school_1_createdAt_-1' },
            { key: { school: 1, incident: 1, createdAt: 1 }, name: 'school_1_incident_1_createdAt_1' }
        ]
    }
];

const ensureIndexes = async (db, definition) => {
    const collection = db.collection(definition.collection);
    const existing = await collection.indexes();
    const existingNames = new Set(existing.map((index) => index.name));

    const created = [];
    for (const index of definition.indexes) {
        if (existingNames.has(index.name)) continue;
        const { key, name, unique } = index;
        await collection.createIndex(key, {
            ...BACKGROUND,
            name,
            ...(unique ? { unique: true } : {})
        });
        created.push(name);
    }

    return { collection: definition.collection, created };
};

export async function up(db) {
    const results = [];
    for (const definition of INDEXES) {
        results.push(await ensureIndexes(db, definition));
    }
    return results;
}

export async function down(db) {
    // Indexes are additive and harmless to keep; a rollback only removes the
    // unique ones so the module can no longer enforce them.
    const removals = [
        { collection: 'behavior_settings', name: 'school_1' },
        { collection: 'behavior_types', name: 'school_1_name_1' },
        { collection: 'behavior_counters', name: 'school_1_student_1_behaviorType_1_windowKey_1' },
        { collection: 'behavior_notifications', name: 'idempotencyKey_1' },
        { collection: 'behavior_email_templates', name: 'school_1_key_1_language_1' }
    ];

    for (const removal of removals) {
        const collection = db.collection(removal.collection);
        const indexes = await collection.indexes();
        if (indexes.some((index) => index.name === removal.name)) {
            await collection.dropIndex(removal.name);
        }
    }
}
