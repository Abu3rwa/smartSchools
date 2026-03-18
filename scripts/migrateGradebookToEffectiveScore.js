/**
 * Migration script: Backfill effectiveScore for existing StandardsGradebookEntry records.
 *
 * For each entry that has a percentage but no effectiveScore, computes and sets the
 * effectiveScore using the unified 0-4 scale.
 *
 * Also ensures every school's SBRScale includes level 0 if missing.
 *
 * Usage: node scripts/migrateGradebookToEffectiveScore.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import StandardsGradebookEntry from '../models/StandardsGradebookEntry.js';
import SBRScale from '../models/SBRScale.js';
import { percentageToScaleLevel, SCALE_LEVELS } from '../utils/sbrScaleUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BATCH = 500;

async function backfillEffectiveScores() {
    const query = {
        effectiveScore: { $eq: null },
        percentage: { $ne: null }
    };

    const total = await StandardsGradebookEntry.countDocuments(query)
        .setOptions({ skipTenantFilter: true });
    console.log(`Found ${total} entries to backfill.`);

    let processed = 0;
    let cursor = StandardsGradebookEntry.find(query)
        .select('_id percentage manualScore')
        .setOptions({ skipTenantFilter: true })
        .lean()
        .cursor();

    let bulkOps = [];

    for await (const entry of cursor) {
        let score;
        if (entry.manualScore != null && Number.isFinite(entry.manualScore)) {
            score = entry.manualScore;
        } else {
            const mapped = percentageToScaleLevel(entry.percentage);
            score = mapped.value;
        }

        if (score !== null) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: entry._id },
                    update: { $set: { effectiveScore: score } }
                }
            });
        }

        if (bulkOps.length >= BATCH) {
            await StandardsGradebookEntry.bulkWrite(bulkOps);
            processed += bulkOps.length;
            console.log(`  Backfilled ${processed} / ${total}`);
            bulkOps = [];
        }
    }

    if (bulkOps.length > 0) {
        await StandardsGradebookEntry.bulkWrite(bulkOps);
        processed += bulkOps.length;
    }

    console.log(`✓ Backfilled effectiveScore for ${processed} entries.`);
}

async function ensureLevel0OnScales() {
    const scales = await SBRScale.find({}).setOptions({ skipTenantFilter: true });
    let updated = 0;

    for (const scale of scales) {
        const hasLevel0 = (scale.levels || []).some((l) => l.value === 0);
        if (!hasLevel0) {
            const level0 = SCALE_LEVELS.find((l) => l.value === 0);
            scale.levels.push({
                value: 0,
                label: level0.label,
                labelAr: level0.labelAr,
                color: level0.color,
                minPercent: 0,
                maxPercent: 0,
                description: level0.description
            });
            await scale.save();
            updated++;
        }
    }

    console.log(`✓ Added level 0 to ${updated} SBRScale document(s).`);
}

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB');

        await backfillEffectiveScores();
        await ensureLevel0OnScales();

        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

main();
