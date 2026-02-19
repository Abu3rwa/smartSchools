/**
 * Test that multiple reminders can be sent for the same class
 * Run from server folder: node scripts/test-multiple-reminders.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Room from '../models/Room.js';
import Schedule from '../models/Schedule.js';
import AttendanceTakingReminder from '../models/AttendanceTakingReminder.js';
import { processAttendanceReminders } from '../controllers/attendanceReminderController.js';
import gmailOAuthService from '../services/gmailOAuthService.js';

async function testMultipleReminders() {
  await connectDB();

  console.log('=== TESTING MULTIPLE REMINDERS FOR SAME CLASS ===\n');

  // Find admin with Gmail
  const adminsWithGmail = await User.find({
    role: 'admin',
    isActive: true,
    'gmailTokens.refreshToken': { $exists: true, $ne: null }
  })
    .select('_id firstName lastName email school')
    .setOptions({ skipTenantFilter: true })
    .lean();

  if (adminsWithGmail.length === 0) {
    console.error('❌ No admin with Gmail connected found!');
    process.exit(1);
  }

  let selectedAdmin = null;
  for (const admin of adminsWithGmail) {
    try {
      const hasValid = await gmailOAuthService.hasValidTokens(admin._id.toString());
      if (hasValid) {
        selectedAdmin = admin;
        break;
      }
    } catch (error) {
      console.log(`Admin ${admin.firstName} ${admin.lastName}: Invalid tokens`);
    }
  }

  if (!selectedAdmin) {
    console.error('❌ No admin with valid Gmail tokens found!');
    process.exit(1);
  }

  console.log(`Using admin: ${selectedAdmin.firstName} ${selectedAdmin.lastName}`);
  console.log(`School ID: ${selectedAdmin.school}\n`);

  const schoolId = selectedAdmin.school;

  // Find teacher
  const teacher = await User.findOne({
    school: schoolId,
    role: 'teacher',
    isActive: true,
    email: { $exists: true, $ne: '' }
  })
    .setOptions({ skipTenantFilter: true })
    .lean();

  if (!teacher) {
    console.error('❌ No teacher found');
    process.exit(1);
  }

  console.log(`Teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.email})\n`);

  // Get required entities
  const room = await Room.findOne({ school: schoolId })
    .setOptions({ skipTenantFilter: true })
    .lean();
  const cls = await Class.findOne({ school: schoolId })
    .setOptions({ skipTenantFilter: true })
    .lean();
  const subject = await Subject.findOne({ school: schoolId })
    .setOptions({ skipTenantFilter: true })
    .lean();

  if (!room || !cls || !subject) {
    console.error('❌ Missing required entities');
    process.exit(1);
  }

  // Create test class that ended 10 hours ago
  const now = new Date();
  const endTime = new Date(now.getTime() - (10 * 60 * 60 * 1000 + 5 * 60 * 1000));
  const startTime = new Date(endTime.getTime() - 45 * 60 * 1000);

  const schedule = await Schedule.create([{
    school: schoolId,
    title: `Multiple Reminders Test - ${cls.name}`,
    type: 'class',
    requiresAttendance: true,
    status: 'scheduled',
    teacher: teacher._id,
    class: cls._id,
    subject: subject._id,
    room: room._id,
    startTime,
    endTime,
    createdBy: selectedAdmin._id
  }]).then(([s]) => s);

  console.log('✅ Created test schedule');
  console.log(`   End time: ${endTime.toISOString()}\n`);

  // Send first reminder
  console.log('📧 Sending FIRST reminder...');
  const result1 = await processAttendanceReminders(10);
  console.log(`   Result: Sent ${result1.results.sent}, Skipped ${result1.results.skipped}, Failed ${result1.results.failed}\n`);

  // Check how many reminders exist
  const remindersAfterFirst = await AttendanceTakingReminder.find({
    school: schoolId,
    schedule: schedule._id
  }).setOptions({ skipTenantFilter: true }).lean();

  console.log(`✅ Reminders in DB after first send: ${remindersAfterFirst.length}`);

  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send second reminder (should work now with updated code)
  console.log('\n📧 Sending SECOND reminder for the SAME class...');
  const result2 = await processAttendanceReminders(10);
  console.log(`   Result: Sent ${result2.results.sent}, Skipped ${result2.results.skipped}, Failed ${result2.results.failed}\n`);

  // Check how many reminders exist now
  const remindersAfterSecond = await AttendanceTakingReminder.find({
    school: schoolId,
    schedule: schedule._id
  }).setOptions({ skipTenantFilter: true }).lean();

  console.log(`✅ Reminders in DB after second send: ${remindersAfterSecond.length}`);

  // Verify
  console.log('\n=== VERIFICATION ===');
  if (remindersAfterSecond.length >= 2) {
    console.log('✅ SUCCESS! Multiple reminders were sent for the same class');
    console.log(`   Total reminders sent: ${remindersAfterSecond.length}`);
    remindersAfterSecond.forEach((r, i) => {
      console.log(`   Reminder ${i + 1}: ${r.status} at ${r.sentAt}`);
    });
  } else {
    console.log('❌ FAILED! Only one reminder was sent');
    console.log('   Expected: 2 or more reminders');
    console.log(`   Actual: ${remindersAfterSecond.length} reminder(s)`);
  }

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  await Schedule.findByIdAndDelete(schedule._id).setOptions({ skipTenantFilter: true });
  await AttendanceTakingReminder.deleteMany({
    school: schoolId,
    schedule: schedule._id
  }).setOptions({ skipTenantFilter: true });
  console.log('✅ Cleanup complete');

  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}

testMultipleReminders().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
