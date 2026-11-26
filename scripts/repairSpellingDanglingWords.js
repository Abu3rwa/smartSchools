/**
 * Reconstructs missing SpellingWord identities referenced by saved attempts or
 * retests as archived tombstones at their original IDs.
 *
 * Always start with a dry run:
 *   node scripts/repairSpellingDanglingWords.js --school <schoolId> --grade G4
 * Apply only after reviewing the manifest:
 *   node scripts/repairSpellingDanglingWords.js --school <id> --grade G4 --apply --confirm
 *
 * Evidence must be unambiguous: every reference to a missing ID has to record
 * one text/week/category. Conflicting evidence blocks the grade instead of
 * guessing. Tombstones are archived, so they reserve no active position or text
 * identity. Prints no student names.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SpellingWord from '../models/SpellingWord.js';
import SpellingWordAuditLog from '../models/SpellingWordAuditLog.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';
import { isValidSpellingWeek } from '../utils/spellingProgress.js';
import { withTransaction } from '../utils/withTransaction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const parseArgs = (argv) => {
    const args = { mode: 'dry-run', confirm: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--school') args.school = argv[++index];
        else if (arg === '--grade') args.grade = String(argv[++index] || '').toUpperCase();
        else if (arg === '--report') args.report = argv[++index];
        else if (arg === '--confirm') args.confirm = true;
        else if (arg === '--dry-run') args.mode = 'dry-run';
        else if (arg === '--apply') args.mode = 'apply';
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return args;
};

const describeTarget = (uri) => {
    try {
        const parsed = new URL(uri);
        return `${parsed.hostname}${parsed.pathname ? `/${parsed.pathname.replace(/^\//, '').split('?')[0]}` : ''}`;
    } catch {
        return 'configured MONGODB_URI';
    }
};

/**
 * Pure repair plan: every reference to an identity that no longer exists must
 * record one text/week/category. Anything else becomes a conflict so the grade
 * is blocked instead of guessed at.
 */
export const buildRepairPlan = ({ grade, words = [], references = [] }) => {
    const knownIds = new Set(words.map((word) => String(word._id)));
    const dangling = references.filter((reference) => reference.wordId && !knownIds.has(String(reference.wordId)));

    const byWordId = new Map();
    for (const reference of dangling) {
        if (!byWordId.has(reference.wordId)) byWordId.set(reference.wordId, []);
        byWordId.get(reference.wordId).push(reference);
    }

    const tombstones = [];
    const conflicts = [];
    for (const [wordId, rows] of byWordId) {
        const shapeKeys = new Set(rows.map((row) => JSON.stringify({
            word: row.word,
            week: row.week,
            category: row.category
        })));
        const shape = JSON.parse([...shapeKeys][0]);
        const students = new Set(rows.map((row) => row.student));
        const base = {
            wordId,
            references: rows.length,
            students: students.size
        };
        const invalid = [];
        if (shapeKeys.size !== 1) invalid.push('conflicting text, week or category');
        if (!shape.word.trim()) invalid.push('no recorded word text');
        if (!isValidSpellingWeek(grade, shape.week)) invalid.push('recorded week is outside this grade');
        if (!shape.category.trim()) invalid.push('no recorded category');
        if (invalid.length) {
            conflicts.push({ ...base, reasons: invalid });
            continue;
        }
        tombstones.push({
            wordId,
            grade,
            week: shape.week,
            category: shape.category.trim(),
            word: shape.word.trim(),
            normalizedWord: normalizeForGrading(shape.word),
            references: rows.length,
            students: students.size
        });
    }

    tombstones.sort((left, right) => left.wordId.localeCompare(right.wordId));
    conflicts.sort((left, right) => left.wordId.localeCompare(right.wordId));

    // The deployed index still reserves a position for archived rows, so a
    // tombstone takes the next free order above its week instead of a guess.
    const orderCeiling = new Map();
    for (const word of words) {
        const week = Number(word.week);
        orderCeiling.set(week, Math.max(orderCeiling.get(week) || 0, Number(word.order) || 0));
    }
    for (const tombstone of tombstones) {
        const next = (orderCeiling.get(tombstone.week) || 0) + 1;
        orderCeiling.set(tombstone.week, next);
        tombstone.order = next;
    }

    return { tombstones, conflicts };
};

const collectRepairInput = async ({ schoolId, grade }) => {
    const [words, sessions, retests] = await Promise.all([
        SpellingWord.find({ school: schoolId, grade }).select('_id grade week order').lean(),
        SpellingSession.find({ school: schoolId, 'attempts.grade': grade })
            .select('student attempts.grade attempts.wordId attempts.wordSnapshot attempts.week attempts.category attempts.isRetest')
            .lean(),
        SpellingRetestItem.find({ school: schoolId, grade })
            .select('student sourceWord wordSnapshot week category')
            .lean()
    ]);

    const references = [];
    for (const session of sessions) {
        for (const attempt of session.attempts || []) {
            if (attempt.grade !== grade) continue;
            references.push({
                wordId: attempt.wordId ? String(attempt.wordId) : '',
                student: String(session.student),
                source: attempt.isRetest ? 'retest-attempt' : 'attempt',
                word: attempt.wordSnapshot || '',
                week: attempt.week,
                category: attempt.category || ''
            });
        }
    }
    for (const item of retests) {
        references.push({
            wordId: item.sourceWord ? String(item.sourceWord) : '',
            student: String(item.student),
            source: 'retest-item',
            word: item.wordSnapshot || '',
            week: item.week,
            category: item.category || ''
        });
    }
    return { words, references };
};

const tombstoneDocument = (tombstone, operationId, at) => ({
    _id: new mongoose.Types.ObjectId(tombstone.wordId),
    school: tombstone.school,
    grade: tombstone.grade,
    week: tombstone.week,
    category: tombstone.category,
    word: tombstone.word,
    definition: '',
    normalizedWord: tombstone.normalizedWord,
    order: tombstone.order,
    createdBy: null,
    updatedBy: null,
    revision: 1,
    deletedAt: at,
    deletedBy: null,
    lastChangeId: operationId
});

const applyTombstones = async ({ schoolId, grade, tombstones }) => {
    if (!tombstones.length) return { operationId: null, created: 0 };
    const at = new Date();
    const operationId = `tombstone-${grade.toLowerCase()}-${at.getTime()}`;
    const documents = tombstones.map((tombstone) => tombstoneDocument({
        ...tombstone,
        school: schoolId
    }, operationId, at));
    const requestHash = crypto.createHash('sha256')
        .update(JSON.stringify(documents.map(({ _id, grade: docGrade, week, category, word }) => ({
            id: String(_id), grade: docGrade, week, category, word
        }))))
        .digest('hex');

    await withTransaction(async (dbSession) => {
        await SpellingWord.create(documents, { session: dbSession, ordered: true });
        await SpellingWordAuditLog.create([{
            school: schoolId,
            operationId,
            requestHash,
            actor: null,
            actorRole: null,
            at,
            reason: 'Dangling attempt identities reconstructed as archived tombstones at their original IDs',
            source: 'migration',
            action: 'migration-tombstone',
            changes: documents.map((document) => ({
                wordId: document._id,
                changeType: 'add',
                before: null,
                after: {
                    grade: document.grade,
                    week: document.week,
                    category: document.category,
                    word: document.word,
                    definition: document.definition,
                    order: document.order,
                    revision: document.revision,
                    deletedAt: document.deletedAt
                }
            })),
            result: { grade, wordIds: documents.map((document) => String(document._id)) }
        }], { session: dbSession, ordered: true });
    });
    return { operationId, created: documents.length };
};

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.school || !mongoose.Types.ObjectId.isValid(args.school)) {
        throw new Error('Pass --school <schoolId>.');
    }
    if (!args.grade) throw new Error('Pass --grade <KG|G1|G2|G3|G4|G5>.');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured for this process.');
    if (args.mode === 'apply' && !args.confirm) {
        throw new Error('apply requires --confirm. Run a dry run first.');
    }

    console.log(`Target: ${describeTarget(process.env.MONGODB_URI)}`);
    console.log(`Mode: ${args.mode} | school ${args.school} | grade ${args.grade}`);
    await mongoose.connect(process.env.MONGODB_URI);

    const schoolId = new mongoose.Types.ObjectId(args.school);
    const input = await collectRepairInput({ schoolId, grade: args.grade });
    const { tombstones, conflicts } = buildRepairPlan({ grade: args.grade, ...input });

    let result = {
        grade: args.grade,
        mode: args.mode,
        tombstones: tombstones.map(({ wordId, week, order, category, word, references, students }) => ({
            wordId, week, order, category, word, references, students
        })),
        conflicts,
        created: 0,
        operationId: null
    };

    if (args.mode === 'apply' && conflicts.length === 0) {
        const applied = await applyTombstones({ schoolId, grade: args.grade, tombstones });
        result = { ...result, ...applied };
    }

    console.log(JSON.stringify(result, null, 2));
    if (conflicts.length) process.exitCode = 2;
    if (args.report) {
        const target = path.resolve(args.report);
        fs.writeFileSync(target, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Report written to ${target}`);
    }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main()
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            await mongoose.disconnect();
        });
}
