/**
 * Drop the unique index on AttendanceTakingReminder to allow multiple reminders
 * Run from server folder: node scripts/drop-unique-index.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';

async function dropUniqueIndex() {
  await connectDB();

  console.log('=== DROPPING UNIQUE INDEX ===\n');

  const db = mongoose.connection.db;
  const collection = db.collection('attendancetakingreminders');

  try {
    // Get existing indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      if (idx.unique) console.log(`    (unique: true)`);
    });

    // Drop the unique index
    console.log('\nDropping index: schedule_1_attendanceDate_1...');
    await collection.dropIndex('schedule_1_attendanceDate_1');
    console.log('✅ Index dropped successfully');

    // Recreate as non-unique
    console.log('\nRecreating index without unique constraint...');
    await collection.createIndex({ schedule: 1, attendanceDate: 1 });
    console.log('✅ Index recreated');

    // Show updated indexes
    const newIndexes = await collection.indexes();
    console.log('\nUpdated indexes:');
    newIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      if (idx.unique) console.log(`    (unique: true)`);
    });

    console.log('\n✅ SUCCESS! Multiple reminders can now be sent for the same class');
  } catch (error) {
    if (error.message.includes('index not found')) {
      console.log('⚠️  Index already dropped or does not exist');
      console.log('Creating non-unique index...');
      await collection.createIndex({ schedule: 1, attendanceDate: 1 });
      console.log('✅ Index created');
    } else {
      console.error('❌ Error:', error.message);
    }
  }

  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

dropUniqueIndex().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
