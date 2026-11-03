/**
 * Repair ReadingCompletion responses whose question ids no longer exist after a
 * reading edit. Dry run by default; writes only with --apply.
 *
 * Usage: node scripts/repairReadingCompletionIds.js --school <schoolId> [--apply]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ReadingCompletion from '../models/ReadingCompletion.js';
import SimplifiedText from '../models/SimplifiedText.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const parseArgs = (argv) => {
  const options = { school: null, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--school') options.school = argv[index + 1] || null;
    if (argv[index] === '--apply') options.apply = true;
  }
  return options;
};

const questionIdsFor = (text) => [
  ...(text?.comprehensionQuestions || []),
  ...(text?.criticalThinkingQuestions || []),
].map((question) => String(question._id)).filter(Boolean);

const printCounts = (title, counts) => {
  if (!counts.size) return;
  console.log(`\n${title}`);
  for (const [key, count] of counts) console.log(`  ${key}: ${count}`);
};

async function main() {
  const { school, apply } = parseArgs(process.argv.slice(2));
  if (!/^[a-f\d]{24}$/i.test(String(school || ''))) {
    console.error('Usage: node scripts/repairReadingCompletionIds.js --school <schoolId> [--apply]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✓ Connected to MongoDB (${apply ? 'apply' : 'dry run'})`);

  const completions = await ReadingCompletion.find({ school })
    .select('student assignment text totalCount responses')
    .setOptions({ skipTenantFilter: true })
    .lean();
  console.log(`Scanned ${completions.length} completion(s) for school ${school}.`);

  const textIds = [...new Set(completions.map((completion) => String(completion.text)))];
  const texts = await SimplifiedText.find({ _id: { $in: textIds }, school })
    .select('comprehensionQuestions._id criticalThinkingQuestions._id')
    .setOptions({ skipTenantFilter: true })
    .lean();
  const idsByText = new Map(texts.map((text) => [String(text._id), questionIdsFor(text)]));

  const byText = new Map();
  const byAssignment = new Map();
  const remaps = [];
  const pairs = [];

  for (const completion of completions) {
    const currentIds = idsByText.get(String(completion.text)) || [];
    const valid = new Set(currentIds);
    const responses = completion.responses || [];
    const invalid = responses.filter((response) => !valid.has(String(response.questionId)));
    if (!invalid.length) continue;

    const textKey = String(completion.text);
    const assignmentKey = String(completion.assignment);
    byText.set(textKey, (byText.get(textKey) || 0) + 1);
    byAssignment.set(assignmentKey, (byAssignment.get(assignmentKey) || 0) + 1);

    const canRemap =
      currentIds.length > 0 &&
      responses.length === currentIds.length &&
      completion.totalCount === currentIds.length &&
      invalid.length === responses.length;

    if (canRemap) {
      remaps.push({
        completionId: completion._id,
        student: completion.student,
        assignment: completion.assignment,
        responses: responses.map((response, index) => ({
          ...response,
          questionId: currentIds[index],
        })),
      });
      continue;
    }

    pairs.push({
      student: String(completion.student),
      assignment: assignmentKey,
      matched: responses.length - invalid.length,
      total: responses.length,
    });
  }

  printCounts('Completions with unresolved responses per text:', byText);
  printCounts('Completions with unresolved responses per assignment:', byAssignment);

  if (pairs.length) {
    console.log('\nNeeds a teacher reset (cannot remap safely):');
    for (const pair of pairs) {
      console.log(`  student ${pair.student} · assignment ${pair.assignment} · ${pair.matched}/${pair.total} answers resolve`);
    }
  }

  console.log(`\n${remaps.length} completion(s) can be remapped by position.`);

  if (apply && remaps.length) {
    for (const remap of remaps) {
      await ReadingCompletion.updateOne(
        { _id: remap.completionId, school },
        { $set: { responses: remap.responses } },
      ).setOptions({ skipTenantFilter: true });
    }
    console.log(`✓ Remapped ${remaps.length} completion(s).`);
  } else if (!apply && remaps.length) {
    console.log('Dry run: no changes written. Re-run with --apply to remap.');
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
