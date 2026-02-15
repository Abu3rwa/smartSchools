/**
 * Test attendance reminder with Gmail OAuth (no SMTP needed)
 * Creates a test class that ended 10 hours ago and sends reminder via admin Gmail
 * Run from server folder: node scripts/test-reminder-with-gmail.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import School from '../models/School.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Room from '../models/Room.js';
import Schedule from '../models/Schedule.js';
import { processAttendanceReminders } from '../controllers/attendanceTakingReminderController.js';
import gmailOAuthService from '../services/gmailOAuthService.js';

async function testReminderWithGmail() {
  await connectDB();

  console.log('=== TESTING ATTENDANCE REMINDER WITH GMAIL OAUTH ===\n');

  // Find school with admin that has Gmail connected
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
    console.error('   An admin must connect their Gmail in Settings > Gmail Integration');
    process.exit(1);
  }

  console.log(`Found ${adminsWithGmail.length} admin(s) with Gmail connected\n`);

  // Use the first admin with valid Gmail
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
  console.log(`Admin email: ${selectedAdmin.email}`);
  console.log(`School ID: ${selectedAdmin.school}\n`);

  const schoolId = selectedAdmin.school;

  // Find a teacher in the same school
  const teacher = await User.findOne({
    school: schoolId,
    role: 'teacher',
    isActive: true,
    email: { $exists: true, $ne: '' }
  })
    .setOptions({ skipTenantFilter: true })
    .lean();

  if (!teacher) {
    console.error('❌ No teacher found in this school');
    process.exit(1);
  }

  console.log(`Teacher: ${teacher.firstName} ${teacher.lastName}`);
  console.log(`Teacher email: ${teacher.email}\n`);

  // Find or create required entities
  let room = await Room.findOne({ school: schoolId })
    .setOptions({ skipTenantFilter: true })
    .lean();

  if (!room) {
    const [r] = await Room.create([{
      school: schoolId,
      name: 'Test Room 101',
      type: 'classroom',
      capacity: 30,
      createdBy: selectedAdmin._id
    }]);
    room = r.toObject();
  }

  const cls = await Class.findOne({ school: schoolId })
    .setOptions({ skipTenantFilter: true })
    .lean();

  const subject = await Subject.findOne({ school: schoolId })
    .setOptions({ skipTenantFilter: true })
    .lean();

  if (!cls || !subject) {
    console.error('❌ No class or subject found. Run seed first.');
    process.exit(1);
  }

  // Create a test class that ended 10 hours and 5 minutes ago
  const now = new Date();
  const endTime = new Date(now.getTime() - (10 * 60 * 60 * 1000 + 5 * 60 * 1000));
  const startTime = new Date(endTime.getTime() - 45 * 60 * 1000);

  const schedule = await Schedule.create([{
    school: schoolId,
    title: `Test Reminder - ${cls.name} - ${subject.name}`,
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

  console.log('✅ Created test schedule:');
  console.log(`   Class: ${cls.name}`);
  console.log(`   Subject: ${subject.name}`);
  console.log(`   Room: ${room.name}`);
  console.log(`   Start: ${startTime.toISOString()}`);
  console.log(`   End: ${endTime.toISOString()}`);
  console.log(`   (Class ended ~10 hours ago)\n`);

  console.log('🚀 Running reminder job...\n');

  try {
    const result = await processAttendanceReminders(10);
    
    console.log('=== REMINDER JOB RESULT ===');
    console.log(`Processed: ${result.results.processed}`);
    console.log(`Sent: ${result.results.sent}`);
    console.log(`Skipped: ${result.results.skipped}`);
    console.log(`Failed: ${result.results.failed}`);
    console.log(`\nTime window: ${result.windowStart} to ${result.windowEnd}`);

    if (result.results.sent > 0) {
      console.log('\n✅ SUCCESS! Reminder email sent via admin Gmail OAuth');
      console.log(`   Email sent to: ${teacher.email}`);
      console.log(`   Sent via admin: ${selectedAdmin.email}`);
    } else if (result.results.failed > 0) {
      console.log('\n❌ FAILED! Check logs above for error details');
    } else if (result.results.skipped > 0) {
      console.log('\n⚠️  Skipped (attendance already taken or reminder already sent)');
    } else {
      console.log('\n⚠️  No classes found in the time window');
    }

  } catch (error) {
    console.error('\n❌ Error running reminder job:', error.message);
  }

  // Cleanup
  console.log('\n🧹 Cleaning up test schedule...');
  await Schedule.findByIdAndDelete(schedule._id).setOptions({ skipTenantFilter: true });
  console.log('✅ Test schedule deleted');

  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}

testReminderWithGmail().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
