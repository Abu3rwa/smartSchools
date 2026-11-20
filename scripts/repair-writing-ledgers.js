/**
 * Repair WritingProject revision ledgers that accumulated duplicate task ids,
 * empty rows or unknown statuses. Dry run by default; writes only with --apply.
 *
 * Usage: node scripts/repair-writing-ledgers.js [--school <schoolId>] [--apply]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import WritingProject from '../models/WritingProject.js';
import { sanitizeLedgerRows } from '../services/writingRevisionIntelligence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OBJECT_ID = /^[a-f\d]{24}$/i;

const parseArgs = (argv) => {
  const options = { school: null, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--school') options.school = argv[index + 1] || null;
    if (argv[index] === '--apply') options.apply = true;
  }
  return options;
};

const sameRows = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const { school, apply } = parseArgs(process.argv.slice(2));
  if (school && !OBJECT_ID.test(String(school))) {
    console.error('Usage: node scripts/repair-writing-ledgers.js [--school <schoolId>] [--apply]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✓ Connected to MongoDB (${apply ? 'apply' : 'dry run'})`);

  const filter = school ? { school } : {};
  const projects = await WritingProject.find({ ...filter, 'revisionLedger.0': { $exists: true } })
    .select('school student revisionLedger')
    .setOptions({ skipTenantFilter: true })
    .lean();
  console.log(`Scanned ${projects.length} project(s) with a revision ledger.`);

  const repairs = [];
  const bySchool = new Map();
  for (const project of projects) {
    const cleaned = sanitizeLedgerRows(project.revisionLedger);
    if (sameRows(cleaned, project.revisionLedger)) continue;
    const schoolKey = String(project.school);
    bySchool.set(schoolKey, (bySchool.get(schoolKey) || 0) + 1);
    repairs.push({
      projectId: project._id,
      school: project.school,
      before: project.revisionLedger.length,
      after: cleaned.length,
      ledger: cleaned,
    });
  }

  for (const [schoolKey, count] of bySchool) {
    console.log(`  school ${schoolKey}: ${count} project(s) need repair`);
  }

  for (const repair of repairs.slice(0, 50)) {
    console.log(
      `  project ${repair.projectId} · ${repair.before} → ${repair.after} row(s)`,
    );
  }
  if (repairs.length > 50) console.log(`  …and ${repairs.length - 50} more`);

  console.log(`\n${repairs.length} project(s) can be repaired.`);

  if (apply && repairs.length) {
    for (const repair of repairs) {
      await WritingProject.updateOne(
        { _id: repair.projectId, school: repair.school },
        { $set: { revisionLedger: repair.ledger } },
      ).setOptions({ skipTenantFilter: true });
    }
    console.log(`✓ Repaired ${repairs.length} project(s).`);
  } else if (!apply && repairs.length) {
    console.log('Dry run: no changes written. Re-run with --apply to repair.');
  } else {
    console.log('Nothing to repair.');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Repair failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
