/**
 * One-time migration: populate enrolledClasses from currentClass
 *
 * For every student that has a currentClass but enrolledClasses is empty or missing,
 * this script adds currentClass into enrolledClasses.
 *
 * Run:  node server/scripts/migrateEnrolledClasses.js
 *
 * Safe to re-run — uses $addToSet so duplicates are avoided.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('MONGO_URI not set in environment');
    process.exit(1);
}

async function migrate() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('students');

    // Find students with a currentClass that isn't already in enrolledClasses
    const result = await collection.updateMany(
        {
            currentClass: { $ne: null, $exists: true },
            $or: [
                { enrolledClasses: { $exists: false } },
                { enrolledClasses: { $size: 0 } },
                // Also catch case where currentClass is set but not in the array
            ]
        },
        [
            {
                $set: {
                    enrolledClasses: {
                        $cond: {
                            if: {
                                $or: [
                                    { $eq: [{ $type: '$enrolledClasses' }, 'missing'] },
                                    { $eq: [{ $size: { $ifNull: ['$enrolledClasses', []] } }, 0] }
                                ]
                            },
                            then: ['$currentClass'],
                            else: {
                                $cond: {
                                    if: { $in: ['$currentClass', { $ifNull: ['$enrolledClasses', []] }] },
                                    then: '$enrolledClasses',
                                    else: { $concatArrays: [{ $ifNull: ['$enrolledClasses', []] }, ['$currentClass']] }
                                }
                            }
                        }
                    }
                }
            }
        ]
    );

    console.log(`Migration complete: ${result.modifiedCount} students updated`);
    await mongoose.disconnect();
    process.exit(0);
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
