/**
 * Test sending reminders right now with the updated window
 * Run from server folder: node scripts/test-reminder-now.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { processAttendanceReminders } from '../controllers/attendanceTakingReminderController.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Room from '../models/Room.js';

async function testReminderNow() {
  await connectDB();

  console.log('=== TESTING REMINDER WITH UPDATED WINDOW ===\n');
  console.log('Current time:', new Date().toLocaleString());
  console.log('Checking for classes that ended 10-12 hours ago...\n');

  try {
    const result = await processAttendanceReminders(10);
    
    console.log('=== RESULT ===');
    console.log(`Processed: ${result.results.processed}`);
    console.log(`Sent: ${result.results.sent}`);
    console.log(`Skipped: ${result.results.skipped}`);
    console.log(`Failed: ${result.results.failed}`);

    if (result.results.sent > 0) {
      console.log('\n✅ SUCCESS! Reminders sent');
    } else if (result.results.skipped > 0) {
      console.log('\n⚠️  Classes were skipped (attendance already taken or reminder already sent)');
    } else if (result.results.processed === 0) {
      console.log('\n⚠️  No classes found in the time window');
      console.log('   Run: node scripts/check-pending-classes.js');
      console.log('   to see what classes exist and when they ended');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }

  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

testReminderNow().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
