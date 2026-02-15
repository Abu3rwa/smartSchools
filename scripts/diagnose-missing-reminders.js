/**
 * Diagnostic script: Check why attendance reminders weren't sent for specific dates
 * Run from server folder: node scripts/diagnose-missing-reminders.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Schedule from '../models/Schedule.js';
import Attendance from '../models/Attendance.js';
import AttendanceTakingReminder from '../models/AttendanceTakingReminder.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Room from '../models/Room.js';
import User from '../models/User.js';
import { processAttendanceReminders } from '../controllers/attendanceTakingReminderController.js';

async function diagnose() {
  await connectDB();

  console.log('=== ATTENDANCE REMINDER DIAGNOSTIC ===\n');
  console.log('Current time:', new Date().toISOString(), '\n');

  // Check dates from Feb 8-14, 2026
  const startDate = new Date('2026-02-08T00:00:00Z');
  const endDate = new Date('2026-02-15T00:00:00Z');

  console.log('Checking schedules from:', startDate.toISOString());
  console.log('                     to:', endDate.toISOString(), '\n');

  // Find all schedules in this date range
  const schedules = await Schedule.find({
    type: 'class',
    startTime: { $gte: startDate, $lt: endDate },
    status: { $ne: 'cancelled' }
  })
    .setOptions({ skipTenantFilter: true })
    .populate('teacher', 'firstName lastName email')
    .populate('class', 'name')
    .populate('subject', 'name')
    .populate('room', 'name')
    .sort({ startTime: 1 })
    .lean();

  console.log(`Found ${schedules.length} scheduled classes\n`);

  // Analyze each schedule
  for (const schedule of schedules) {
    const now = new Date();
    const hoursAgo = (now - new Date(schedule.endTime)) / (1000 * 60 * 60);
    
    console.log('---');
    console.log('Schedule:', schedule.title);
    console.log('  Class:', schedule.class?.name || 'N/A');
    console.log('  Subject:', schedule.subject?.name || 'N/A');
    console.log('  Room:', schedule.room?.name || 'N/A');
    console.log('  Teacher:', schedule.teacher ? `${schedule.teacher.firstName} ${schedule.teacher.lastName} (${schedule.teacher.email})` : 'N/A');
    console.log('  Start:', new Date(schedule.startTime).toISOString());
    console.log('  End:', new Date(schedule.endTime).toISOString());
    console.log('  Hours ago:', hoursAgo.toFixed(2));
    console.log('  requiresAttendance:', schedule.requiresAttendance);
    console.log('  status:', schedule.status);

    // Check if attendance was taken
    const attendanceDate = new Date(schedule.startTime);
    attendanceDate.setHours(0, 0, 0, 0);
    
    const attendance = await Attendance.findOne({
      school: schedule.school,
      schedule: schedule._id,
      date: attendanceDate
    }).setOptions({ skipTenantFilter: true });

    console.log('  Attendance taken:', attendance ? 'YES' : 'NO');

    // Check if reminder was sent
    const reminder = await AttendanceTakingReminder.findOne({
      school: schedule.school,
      schedule: schedule._id,
      attendanceDate
    }).setOptions({ skipTenantFilter: true });

    console.log('  Reminder sent:', reminder ? `YES (${reminder.status} at ${reminder.sentAt})` : 'NO');

    // Determine if reminder SHOULD have been sent
    const shouldSendReminder = 
      schedule.requiresAttendance === true &&
      schedule.status !== 'cancelled' &&
      !attendance &&
      !reminder &&
      schedule.teacher?.email &&
      hoursAgo >= 10; // Default is 10 hours

    console.log('  Should send reminder:', shouldSendReminder ? 'YES' : 'NO');
    
    if (!shouldSendReminder && !reminder) {
      console.log('  Reason not sent:');
      if (schedule.requiresAttendance !== true) console.log('    - requiresAttendance is not true');
      if (schedule.status === 'cancelled') console.log('    - Schedule is cancelled');
      if (attendance) console.log('    - Attendance already taken');
      if (!schedule.teacher?.email) console.log('    - Teacher has no email');
      if (hoursAgo < 10) console.log('    - Not enough time passed (needs 10+ hours)');
    }
  }

  console.log('\n=== TESTING REMINDER JOB NOW ===\n');
  
  // Test with 1 hour window (for recent classes)
  console.log('Testing 1-hour window...');
  const result1h = await processAttendanceReminders(1);
  console.log('1-hour result:', result1h.results);

  // Test with 10 hour window (default)
  console.log('\nTesting 10-hour window (default)...');
  const result10h = await processAttendanceReminders(10);
  console.log('10-hour result:', result10h.results);

  // Test with 24 hour window (catch everything from yesterday)
  console.log('\nTesting 24-hour window...');
  const result24h = await processAttendanceReminders(24);
  console.log('24-hour result:', result24h.results);

  // Check if any reminders exist in the system
  console.log('\n=== REMINDER HISTORY ===\n');
  const allReminders = await AttendanceTakingReminder.find({})
    .setOptions({ skipTenantFilter: true })
    .sort({ sentAt: -1 })
    .limit(10)
    .populate('teacher', 'firstName lastName email')
    .populate('schedule', 'title startTime endTime')
    .lean();

  console.log(`Total reminders in database: ${allReminders.length > 0 ? 'Found ' + allReminders.length : 'NONE'}`);
  
  if (allReminders.length > 0) {
    console.log('\nRecent reminders:');
    allReminders.forEach(r => {
      console.log(`  - ${r.teacher?.firstName} ${r.teacher?.lastName}: ${r.schedule?.title}`);
      console.log(`    Status: ${r.status}, Sent: ${r.sentAt}`);
      if (r.failureReason) console.log(`    Failure: ${r.failureReason}`);
    });
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  process.exit(0);
}

diagnose().catch((err) => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
