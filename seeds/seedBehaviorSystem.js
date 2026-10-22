/* global process */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import logger from '../utils/logger.js';
import School from '../models/School.js';
import BehaviorType from '../models/BehaviorType.js';
import BehaviorLadder from '../models/BehaviorLadder.js';
import BehaviorEmailTemplate from '../models/BehaviorEmailTemplate.js';
import { BEHAVIOR_DEFAULT_TEMPLATES } from '../services/behavior/notificationService.js';

dotenv.config();

/**
 * Idempotent seed of the school consequence chart ("Our 5th Grade Plan").
 *
 * Rules:
 *  - a school that already has any behavior type is left alone, so an admin's
 *    edits are never overwritten;
 *  - the feature flag is never touched: seeding must not switch a live school on;
 *  - every row carries a stable seedKey so a re-run recognises its own rows;
 *  - indexes are created in the background by the migration, not here.
 *
 * Usage:
 *   node seeds/seedBehaviorSystem.js                 # every school
 *   node seeds/seedBehaviorSystem.js --school=<id>   # one school
 *   node seeds/seedBehaviorSystem.js --dry-run       # report only
 */

const LEVEL_NAMES = {
    1: 'Small mistakes',
    2: 'Repeated choices',
    3: 'Harmful choices',
    4: 'Serious harm'
};

const CONSEQUENCE = (overrides) => ({
    taskType: 'other',
    title: 'Consequence',
    instructions: '',
    dueInDays: 3,
    minWords: 0,
    toWhom: null,
    questions: [],
    verifierRule: null,
    requiresHumanDecision: false,
    ...overrides
});

const STEP = (overrides) => ({
    order: 1,
    title: 'Step',
    summary: '',
    consequences: [],
    actions: { emailParents: false, showInPortal: true, ccRoles: [] },
    requiresApproval: null,
    approverRoles: [],
    emailTemplateKey: 'parent-notification',
    ...overrides
});

const REFLECTION_QUESTIONS = [
    'What happened?',
    'Who was affected and how?',
    'What is your plan so it doesn\'t happen again?'
];

const COMING_BACK_QUESTIONS = [
    'What happened?',
    'Who was affected and how?',
    'What is your plan so it doesn\'t happen again?'
];

/**
 * Level 1-3 share one ladder shape that starts light. Level 4 starts at the
 * written stage because the behavior itself is already serious.
 */
const buildStandardLadder = (level) => {
    const steps = [
        STEP({
            order: 1,
            title: 'Talk it out',
            summary: 'A quiet correction and a chance to put it right.',
            consequences: [CONSEQUENCE({
                taskType: 'verbal_warning',
                title: 'Quiet reminder and reset',
                instructions: 'Talk with the student one-to-one, then let them rejoin the lesson.',
                dueInDays: 0
            })]
        }),
        STEP({
            order: 2,
            title: 'Written reflection',
            summary: 'The student writes what happened and what comes next.',
            consequences: [CONSEQUENCE({
                taskType: 'written_warning',
                title: 'Reflection note',
                instructions: 'Answer each question in full sentences.',
                dueInDays: 2,
                minWords: 50,
                toWhom: 'school',
                questions: REFLECTION_QUESTIONS
            })]
        }),
        STEP({
            order: 3,
            title: 'Make it right',
            summary: 'The student repairs the harm and the family is told.',
            consequences: [
                CONSEQUENCE({
                    taskType: 'apology_letter',
                    title: 'Apology letter',
                    instructions: 'Write to the person who was affected. Say what you did, how it affected them, and what you will do differently.',
                    dueInDays: 3,
                    minWords: 100,
                    toWhom: 'person-affected'
                }),
                CONSEQUENCE({
                    taskType: 'fix_it_plan',
                    title: 'Fix-it plan',
                    instructions: 'Describe the concrete steps you will take this week.',
                    dueInDays: 3,
                    minWords: 60,
                    toWhom: 'school',
                    questions: REFLECTION_QUESTIONS
                })
            ],
            actions: { emailParents: true, showInPortal: true, ccRoles: [] }
        }),
        STEP({
            order: 4,
            title: 'Plan together with the family',
            summary: 'A meeting with the family and a written plan, agreed before it runs.',
            consequences: [
                CONSEQUENCE({
                    taskType: 'family_meeting',
                    title: 'Family meeting',
                    instructions: 'Meet with the family and agree one plan for the next two weeks.',
                    dueInDays: 5
                }),
                CONSEQUENCE({
                    taskType: 'detention',
                    title: 'Reflection time',
                    instructions: 'One supervised reflection session inside school hours.',
                    dueInDays: 5
                })
            ],
            actions: { emailParents: true, showInPortal: true, ccRoles: ['admin'] },
            requiresApproval: true
        })
    ];

    if (level === 1) {
        // Lightest level: nothing but a correction and a reflection.
        steps[2].consequences = [CONSEQUENCE({
            taskType: 'fix_it_plan',
            title: 'Fix-it plan',
            instructions: 'Describe the concrete steps you will take this week.',
            dueInDays: 3,
            minWords: 60,
            toWhom: 'school',
            questions: REFLECTION_QUESTIONS
        })];
        steps[3].consequences = [CONSEQUENCE({
            taskType: 'family_meeting',
            title: 'Family meeting',
            instructions: 'Meet with the family and agree one plan for the next two weeks.',
            dueInDays: 5
        })];
    }

    return steps;
};

const buildSeriousLadder = () => [
    STEP({
        order: 1,
        title: 'Written reflection and family told',
        summary: 'A written account, and the family is informed the same day.',
        consequences: [
            CONSEQUENCE({
                taskType: 'written_warning',
                title: 'Written account',
                instructions: 'Write what happened and who was affected.',
                dueInDays: 1,
                minWords: 80,
                toWhom: 'school',
                questions: REFLECTION_QUESTIONS
            })
        ],
        actions: { emailParents: true, showInPortal: true, ccRoles: ['admin'] },
        requiresApproval: true
    }),
    STEP({
        order: 2,
        title: 'Make it right',
        summary: 'Repair the harm, with a plan the student writes.',
        consequences: [
            CONSEQUENCE({
                taskType: 'apology_letter',
                title: 'Apology letter',
                instructions: 'Write to the person who was affected.',
                dueInDays: 2,
                minWords: 100,
                toWhom: 'person-affected'
            }),
            CONSEQUENCE({
                taskType: 'fix_it_plan',
                title: 'Fix-it plan',
                instructions: 'Describe how you will keep everyone safe.',
                dueInDays: 2,
                minWords: 80,
                toWhom: 'school',
                questions: REFLECTION_QUESTIONS
            })
        ],
        actions: { emailParents: true, showInPortal: true, ccRoles: ['admin'] },
        requiresApproval: true
    }),
    STEP({
        order: 3,
        title: 'Meet and plan the return',
        summary: 'A meeting with the family plus a coming-back plan.',
        consequences: [
            CONSEQUENCE({
                taskType: 'family_meeting',
                title: 'Family meeting',
                instructions: 'Agree the plan with the family before it runs.',
                dueInDays: 3
            }),
            CONSEQUENCE({
                taskType: 'coming_back_plan',
                title: 'Coming-back plan',
                instructions: 'Answer each question. A staff member must agree it before the student returns.',
                dueInDays: 3,
                minWords: 100,
                toWhom: 'school',
                questions: COMING_BACK_QUESTIONS
            })
        ],
        actions: { emailParents: true, showInPortal: true, ccRoles: ['admin'] },
        requiresApproval: true
    }),
    // A suspension is always a suggestion: an adult decides, never the counter.
    STEP({
        order: 4,
        title: 'Suspension proposed',
        summary: 'A proposed outside day with a re-entry plan. Staff decide every part of this.',
        consequences: [
            CONSEQUENCE({
                taskType: 'suspension',
                title: 'Proposed day outside school',
                instructions: 'Suggestion only. An administrator decides whether it runs and when.',
                dueInDays: 3,
                requiresHumanDecision: true
            }),
            CONSEQUENCE({
                taskType: 're_entry_plan',
                title: 'Re-entry plan',
                instructions: 'Written before the student comes back, agreed by staff.',
                dueInDays: 3,
                minWords: 100,
                toWhom: 'school',
                questions: COMING_BACK_QUESTIONS
            })
        ],
        actions: { emailParents: true, showInPortal: true, ccRoles: ['admin'] },
        requiresApproval: true
    })
];

const PLAN = [
    {
        seedKey: 'small-mistakes',
        name: 'Small mistake',
        level: 1,
        description: 'A first-time slip that can be corrected quietly.',
        behaviors: [
            { seedKey: 'interrupting-others', name: 'Interrupting others', description: 'Talking over a classmate or a teacher.' },
            { seedKey: 'not-following-a-direction', name: 'Not following a direction', description: 'Being asked once and choosing not to start.' },
            { seedKey: 'leaving-seat-without-permission', name: 'Leaving a seat without permission', description: 'Moving around the room during a lesson.' }
        ]
    },
    {
        seedKey: 'repeated-choices',
        name: 'Repeated choice',
        level: 2,
        description: 'The same choice again after a correction.',
        behaviors: [
            { seedKey: 'device-without-permission', name: 'Using a device without permission', description: 'A phone or tablet during learning time.' },
            { seedKey: 'unfinished-agreed-work', name: 'Not completing agreed work', description: 'Work that was agreed and then left undone.' },
            { seedKey: 'unkind-words', name: 'Using unkind words', description: 'Words that hurt without being persistent.' }
        ]
    },
    {
        seedKey: 'harmful-choices',
        name: 'Harmful choice',
        level: 3,
        description: 'A choice that affects learning or another person.',
        behaviors: [
            { seedKey: 'disrespecting-an-adult', name: 'Disrespecting an adult', description: 'Answering an adult in a way that stops learning.' },
            { seedKey: 'repeatedly-disrupting-learning', name: 'Disrupting learning repeatedly', description: 'Stopping a lesson for the class again and again.' },
            { seedKey: 'misusing-school-property', name: 'Misusing school property', description: 'Using things in a way they were not meant for.' }
        ]
    },
    {
        seedKey: 'serious-harm',
        name: 'Serious harm',
        level: 4,
        description: 'A choice that harms a person, safety or trust.',
        behaviors: [
            { seedKey: 'bullying-or-repeated-harm', name: 'Bullying or repeated harm', description: 'Hurt that is repeated or aimed at one person.' },
            { seedKey: 'physical-aggression', name: 'Physical aggression', description: 'Hitting, pushing or any physical harm.' },
            { seedKey: 'deliberate-damage-or-theft', name: 'Deliberate damage or theft', description: 'Breaking or taking something on purpose.' },
            { seedKey: 'cheating-or-falsifying-work', name: 'Cheating or falsifying work', description: 'Copying, or signing or changing work that is not yours.' }
        ]
    }
];

const argValues = process.argv.slice(2);
const dryRun = argValues.includes('--dry-run');
const schoolArg = argValues.find((arg) => arg.startsWith('--school='));
const schoolFilter = schoolArg ? schoolArg.split('=')[1] : null;

const seedLadder = async ({ schoolId, level, actorId }) => {
    const seedKey = `our-5th-grade-plan-level-${level}`;
    const existing = await BehaviorLadder.findOne({ school: schoolId, seedKey }).setOptions({ skipTenantFilter: true });
    if (existing) return existing;

    const steps = level === 4 ? buildSeriousLadder() : buildStandardLadder(level);
    const created = await BehaviorLadder.create([{
        school: schoolId,
        name: `Our 5th Grade Plan - ${LEVEL_NAMES[level]}`,
        behaviorType: null,
        overflowBehavior: level === 4 ? 'flag_for_admin' : 'repeat_last',
        steps,
        seedKey,
        updatedBy: actorId
    }]).then((rows) => rows[0]);

    return created;
};

const seedSchool = async ({ school, actorId }) => {
    const schoolId = school._id;
    const existingTypes = await BehaviorType.countDocuments({ school: schoolId }).setOptions({ skipTenantFilter: true });
    if (existingTypes > 0) {
        return { schoolId, skipped: true, reason: 'the school already has behavior types' };
    }

    if (dryRun) return { schoolId, skipped: false, dryRun: true, types: PLAN.reduce((sum, group) => sum + group.behaviors.length, 0) };

    const laddersByLevel = {};
    for (const level of [1, 2, 3, 4]) {
        laddersByLevel[level] = await seedLadder({ schoolId, level, actorId });
    }

    const types = [];
    for (const group of PLAN) {
        for (const behavior of group.behaviors) {
            const created = await BehaviorType.create([{
                school: schoolId,
                name: behavior.name,
                description: behavior.description || '',
                level: group.level,
                active: true,
                ladder: laddersByLevel[group.level]._id,
                seedKey: behavior.seedKey
            }]).then((rows) => rows[0]);
            types.push(created);
        }
    }

    // Each ladder belongs to its first behavior so the editor has one owner.
    for (const level of [1, 2, 3, 4]) {
        const owner = types.find((type) => type.level === level);
        await BehaviorLadder.updateOne(
            { _id: laddersByLevel[level]._id, school: schoolId },
            { $set: { behaviorType: owner?._id || null } }
        ).setOptions({ skipTenantFilter: true });
    }

    const templates = await seedTemplates({ schoolId, actorId });
    return { schoolId, skipped: false, types: types.length, ladders: 4, templates };
};

const seedTemplates = async ({ schoolId, actorId }) => {
    let created = 0;
    for (const [key, variants] of Object.entries(BEHAVIOR_DEFAULT_TEMPLATES)) {
        for (const [language, variant] of Object.entries(variants)) {
            const existing = await BehaviorEmailTemplate.findOne({ school: schoolId, key, language })
                .setOptions({ skipTenantFilter: true });
            if (existing) continue;

            await BehaviorEmailTemplate.create([{
                school: schoolId,
                key,
                language,
                label: language === 'ar' ? 'إشعار ولي الأمر' : 'Parent notification',
                subject: variant.subject,
                body: variant.body,
                variables: ['studentFirstName', 'schoolName', 'behavior', 'date', 'consequence', 'stepNumber', 'dueDate', 'dueLine', 'teacherFirstName'],
                active: true,
                seedKey: `${key}:${language}`,
                updatedBy: actorId
            }]);
            created += 1;
        }
    }
    return created;
};

const main = async () => {
    await connectDB();

    if (schoolFilter && !mongoose.isValidObjectId(schoolFilter)) {
        throw new Error(`--school expects an id, got "${schoolFilter}"`);
    }

    const schools = await School.find(schoolFilter ? { _id: schoolFilter } : {})
        .select('_id name')
        .setOptions({ skipTenantFilter: true })
        .lean();

    if (!schools.length) throw new Error('No schools found to seed');

    // The flag is never set here: seeding data must not enable a live feature.
    const summary = [];
    for (const school of schools) {
        const result = await seedSchool({ school, actorId: null });
        summary.push(result);
        logger.info('behavior_seed_school', { ...result, dryRun });
    }

    logger.success(dryRun
        ? `behavior_seed_dry_run: ${summary.filter((row) => !row.skipped).length} school(s) would be seeded`
        : `behavior_seed_done: ${summary.filter((row) => !row.skipped && row.types).length} school(s) seeded`);

    await mongoose.connection.close();
    process.exit(0);
};

main().catch((error) => {
    logger.error('behavior_seed_failed', error?.message || String(error));
    process.exit(1);
});
