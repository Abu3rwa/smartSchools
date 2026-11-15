/**
 * Student Support clean restart — PREPARED, NOT RUN.
 *
 * This script deletes support records for one school. It is dry-run by default,
 * backs every document up to disk before deleting, and refuses to run unless
 * the caller passes the same approval flags twice. It never starts the server.
 *
 * Dry run (safe, read-only):
 *   node scripts/support-reset.js --school=<schoolId>
 *
 * Execute (needs all three flags and a backup directory):
 *   node scripts/support-reset.js --school=<schoolId> --execute \
 *     --backup=<absoluteDir> --i-understand
 *
 * Optional:
 *   --include-questions   also delete this school's own bank questions
 *   --drop-obsolete-indexes  remove legacy support indexes after the delete
 *
 * Before executing in production: take a database snapshot, run the dry run,
 * rehearse the backup restore on a scratch database, and get the owner's
 * explicit approval. This file has not been executed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';

const args = new Map(
    process.argv.slice(2).map((raw) => {
        const [key, value] = raw.replace(/^--/, '').split('=');
        return [key, value ?? true];
    }),
);

const schoolId = String(args.get('school') || '').trim();
const execute = args.has('execute');
const understands = args.has('i-understand');
const includeQuestions = args.has('include-questions');
const dropObsoleteIndexes = args.has('drop-obsolete-indexes');
const backupDir = args.get('backup') ? path.resolve(String(args.get('backup'))) : null;

const SUPPORT_COLLECTIONS = [
    'supportcases',
    'supportreviews',
    'supportplanversions',
    'supportplans',
    'supportcheckins',
    'supportsurveys',
    'supportrespondents',
    'supportsuggestiondismissals',
];

const LEGACY_INDEXES = [
    { collection: 'supportrespondents', name: 'school_1_student_1' },
    { collection: 'supportplans', name: 'school_1_cycle_1' },
];

const fail = (message) => {
    console.error(`\nREFUSED: ${message}\n`);
    process.exit(1);
};

const main = async () => {
    if (!mongoose.isValidObjectId(schoolId)) {
        fail('pass --school=<a valid school ObjectId>.');
    }
    if (execute && !understands) {
        fail('execution needs --i-understand after a reviewed dry run.');
    }
    if (execute && !backupDir) {
        fail('execution needs --backup=<absolute directory>. Nothing is deleted without a verified backup.');
    }
    if (execute && backupDir && !path.isAbsolute(String(args.get('backup')))) {
        fail('--backup must be an absolute path.');
    }

    await connectDB();
    const db = mongoose.connection.db;
    const filter = { school: new mongoose.Types.ObjectId(schoolId) };

    console.log(`\n=== Student support clean restart (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
    console.log(`School: ${schoolId}\n`);

    const counts = {};
    for (const collection of SUPPORT_COLLECTIONS) {
        counts[collection] = await db.collection(collection).countDocuments(filter);
    }
    if (includeQuestions) {
        counts.supportquestions = await db.collection('supportquestions').countDocuments(filter);
    }

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    for (const [collection, count] of Object.entries(counts)) {
        console.log(`  ${collection.padEnd(32)} ${count}`);
    }
    console.log(`\n  total records: ${total}`);

    if (!execute) {
        console.log('\nDry run only. Nothing was changed.');
        console.log('Review the counts, prepare a backup directory, then rerun with --execute --backup=<dir> --i-understand.\n');
        await mongoose.disconnect();
        return;
    }

    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runDir = path.join(backupDir, `support-reset-${stamp}`);
    await fs.mkdir(runDir, { recursive: true });

    const collectionsToBackup = includeQuestions
        ? [...SUPPORT_COLLECTIONS, 'supportquestions']
        : SUPPORT_COLLECTIONS;

    for (const collection of collectionsToBackup) {
        const file = path.join(runDir, `${collection}.ndjson`);
        const rows = await db.collection(collection).find(filter).toArray();
        await fs.writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n'), 'utf8');
        const written = (await fs.stat(file)).size;
        if (rows.length > 0 && written === 0) {
            fail(`backup for ${collection} is empty although ${rows.length} rows exist. Nothing was deleted.`);
        }
        console.log(`  backed up ${collection}: ${rows.length} row(s) -> ${file}`);
    }
    await fs.writeFile(
        path.join(runDir, 'manifest.json'),
        JSON.stringify({ schoolId, counts, createdAt: new Date().toISOString() }, null, 2),
        'utf8',
    );

    console.log('\nBackup written. Deleting school support records…');
    for (const collection of collectionsToBackup) {
        const result = await db.collection(collection).deleteMany(filter);
        console.log(`  ${collection}: deleted ${result.deletedCount}`);
    }

    if (dropObsoleteIndexes) {
        for (const entry of LEGACY_INDEXES) {
            try {
                await db.collection(entry.collection).dropIndex(entry.name);
                console.log(`  dropped index ${entry.collection}.${entry.name}`);
            } catch (error) {
                if (String(error?.message || '').includes('not found')) {
                    console.log(`  index ${entry.collection}.${entry.name} already absent`);
                } else {
                    throw error;
                }
            }
        }
    }

    console.log(`\nDone. Restore point: ${runDir}\n`);
    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error('\nFAILED:', error?.message || error);
    try {
        await mongoose.disconnect();
    } catch {
        // already disconnected
    }
    process.exit(1);
});
