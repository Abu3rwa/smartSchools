/**
 * Finds students whose class list still carries another class at their own grade — the leftover
 * from a move made before same-grade moves replaced the class the student leaves. Such a student
 * keeps being invited to live lessons, lists and reports of the class they no longer attend.
 *
 * Preview (changes nothing):  node server/scripts/cleanupStaleClassLists.js
 * Apply:                      node server/scripts/cleanupStaleClassLists.js --apply
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import School from '../models/School.js';
import { findStaleSameGradeEnrollments, removeStaleSameGradeEnrollments } from '../helpers/classMoves.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const apply = process.argv.includes('--apply');

if (!MONGO_URI) {
    console.error('MONGO_URI not set in environment');
    process.exit(1);
}

async function run() {
    await mongoose.connect(MONGO_URI);
    const schools = await School.find({}).select('name').lean();

    for (const school of schools) {
        const rows = await findStaleSameGradeEnrollments({ schoolId: school._id });
        if (!rows.length) {
            console.log(`${school.name}: clean`);
            continue;
        }
        console.log(`${school.name}: ${rows.length} student(s)`);
        for (const row of rows) {
            console.log(`  ${row.name}${row.studentCode ? ` (${row.studentCode})` : ''} now in ${row.currentClass}`);
            row.stale.forEach((item) => console.log(`      - would remove ${item.label}`));
            if (apply) {
                await removeStaleSameGradeEnrollments({
                    schoolId: school._id,
                    studentId: row.studentId,
                    classIds: row.stale.map((item) => item.id)
                });
            }
        }
    }

    console.log(apply ? 'Applied.' : 'Dry run only. Re-run with --apply to change anything.');
    await mongoose.disconnect();
    process.exit(0);
}

run().catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
});
