/**
 * Reconstructs consumed spelling word IDs for one school grade and derives the
 * Student projection from that ledger.
 *
 * Always start with a dry run:
 *   node scripts/migrateSpellingLibraryEditing.js --school <schoolId> --grade G2
 * Apply only to a reviewed copy:
 *   node scripts/migrateSpellingLibraryEditing.js --school <id> --grade G2 --apply --confirm
 *   node scripts/migrateSpellingLibraryEditing.js --school <id> --grade G2 --verify
 *   node scripts/migrateSpellingLibraryEditing.js --school <id> --grade G2 --rollback --confirm
 *
 * Production migration is a separate, explicit approval. This script never
 * loads a school other than the one named and prints no student names.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { runMigration } from '../services/spellingLibraryMigrationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const parseArgs = (argv) => {
    const args = { mode: 'dry-run', confirm: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--school') args.school = argv[++index];
        else if (arg === '--grade') args.grade = String(argv[++index] || '').toUpperCase();
        else if (arg === '--run-id') args.runId = argv[++index];
        else if (arg === '--report') args.report = argv[++index];
        else if (arg === '--confirm') args.confirm = true;
        else if (arg === '--dry-run') args.mode = 'dry-run';
        else if (arg === '--apply') args.mode = 'apply';
        else if (arg === '--verify') args.mode = 'verify';
        else if (arg === '--rollback') args.mode = 'rollback';
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

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.school || !mongoose.Types.ObjectId.isValid(args.school)) {
        throw new Error('Pass --school <schoolId>.');
    }
    if (!args.grade) throw new Error('Pass --grade <KG|G1|G2|G3|G4|G5>.');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured for this process.');
    if (['apply', 'rollback'].includes(args.mode) && !args.confirm) {
        throw new Error(`${args.mode} requires --confirm. Run a dry run first.`);
    }

    console.log(`Target: ${describeTarget(process.env.MONGODB_URI)}`);
    console.log(`Mode: ${args.mode} | school ${args.school} | grade ${args.grade}`);
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await runMigration({
        schoolId: new mongoose.Types.ObjectId(args.school),
        grade: args.grade,
        mode: args.mode,
        runId: args.runId || null
    });

    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'blocked' || result.mismatches?.length || result.conflicts?.length) {
        process.exitCode = 2;
    }
    if (args.report) {
        const target = path.resolve(args.report);
        fs.writeFileSync(target, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Report written to ${target}`);
    }
};

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
