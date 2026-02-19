/**
 * Test the new HTML email format for attendance reminders
 * Run from server folder: node scripts/test-new-email-format.js
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
import { processAttendanceReminders } from '../controllers/attendanceReminderController.js';
import gmailOAuthService from '../services/gmailOAuthService.js';

async function testNewEmailFormat() {
  await connectDB();

  console.log('=== TESTING NEW HTML EMAIL FORMAT ===\n');

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

  console.log(`Teacher: ${teacher.firstName} ${teacher.lastName}`);
  console.log(`Email will be sent to: ${teacher.email}\n`);

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
    title: `${subject.name} - ${cls.name}`,
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
  console.log(`   Date: ${startTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  console.log(`   Start: ${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`);
  console.log(`   End: ${endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`);
  console.log(`   (Class ended ~10 hours ago)\n`);

  console.log('📧 Sending reminder with NEW HTML FORMAT...\n');

  try {
    const result = await processAttendanceReminders(10);
    
    console.log('=== RESULT ===');
    console.log(`Processed: ${result.results.processed}`);
    console.log(`Sent: ${result.results.sent}`);
    console.log(`Skipped: ${result.results.skipped}`);
    console.log(`Failed: ${result.results.failed}`);

    if (result.results.sent > 0) {
      console.log('\n✅ SUCCESS! Email sent with new HTML format');
      console.log(`   Recipient: ${teacher.email}`);
      console.log(`   Sent via: ${selectedAdmin.email}`);
      console.log('\n📬 Please check the teacher\'s email inbox to see the new format!');
      console.log('   The email should have:');
      console.log('   ✓ Professional greeting');
      console.log('   ✓ Nice HTML table with class details');
      console.log('   ✓ Full date and time information');
      console.log('   ✓ Start and end times');
      console.log('   ✓ Beautiful gradient header');
      console.log('   ✓ Professional footer');
    } else if (result.results.failed > 0) {
      console.log('\n❌ FAILED! Check logs above for error details');
    } else {
      console.log('\n⚠️  No emails sent (skipped or no classes found)');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }

  // Cleanup
  console.log('\n🧹 Cleaning up test schedule...');
  await Schedule.findByIdAndDelete(schedule._id).setOptions({ skipTenantFilter: true });
  console.log('✅ Cleanup complete');

  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}

testNewEmailFormat().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
