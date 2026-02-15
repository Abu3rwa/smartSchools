/**
 * Check what classes need attendance reminders
 * Run from server folder: node scripts/check-pending-classes.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Schedule from '../models/Schedule.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Room from '../models/Room.js';

async function checkPendingClasses() {
  await connectDB();

  console.log('=== CHECKING CLASSES NEEDING ATTENDANCE ===\n');
  console.log('Current time:', new Date().toISOString(), '\n');

  const now = new Date();
  
  // Check classes from the past 24 hours
  const past24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const schedules = await Schedule.find({
    type: 'class',
    requiresAttendance: true,
    status: { $ne: 'cancelled' },
    endTime: { $gte: past24Hours, $lte: now },
  })
    .setOptions({ skipTenantFilter: true })
    .populate('teacher', 'firstName lastName email')
    .populate('class', 'name')
    .populate('subject', 'name')
    .populate('room', 'name')
    .sort({ endTime: -1 })
    .lean();

  console.log(`Found ${schedules.length} classes in the past 24 hours\n`);

  if (schedules.length === 0) {
    console.log('⚠️  No classes found in the past 24 hours');
    console.log('   This means there are no classes to send reminders for.');
    process.exit(0);
  }

  for (const schedule of schedules) {
    const hoursAgo = (now - new Date(schedule.endTime)) / (1000 * 60 * 60);
    
    console.log('---');
    console.log(`Class: ${schedule.class?.name || 'N/A'} - ${schedule.subject?.name || 'N/A'}`);
    console.log(`Teacher: ${schedule.teacher ? `${schedule.teacher.firstName} ${schedule.teacher.lastName}` : 'N/A'}`);
    console.log(`Email: ${schedule.teacher?.email || 'N/A'}`);
    console.log(`End time: ${new Date(schedule.endTime).toLocaleString()}`);
    console.log(`Hours ago: ${hoursAgo.toFixed(2)}`);

    // Check attendance
    const attendanceDate = new Date(schedule.startTime);
    attendanceDate.setHours(0, 0, 0, 0);
    
    const attendance = await Attendance.findOne({
      school: schedule.school,
      schedule: schedule._id,
      date: attendanceDate,
    }).setOptions({ skipTenantFilter: true });

    console.log(`Attendance taken: ${attendance ? '✅ YES' : '❌ NO'}`);

    // Suggest appropriate time window
    if (!attendance) {
      if (hoursAgo < 1) {
        console.log(`💡 Suggestion: Wait ${(1 - hoursAgo).toFixed(1)} more hours, then use 1-hour window`);
      } else if (hoursAgo < 2) {
        console.log(`💡 Suggestion: Use 1-hour window`);
      } else if (hoursAgo < 3) {
        console.log(`💡 Suggestion: Use 2-hour window`);
      } else if (hoursAgo < 6) {
        console.log(`💡 Suggestion: Use 3-hour window`);
      } else if (hoursAgo < 10) {
        console.log(`💡 Suggestion: Use 6-hour window`);
      } else if (hoursAgo < 24) {
        console.log(`💡 Suggestion: Use 10-hour window (default)`);
      } else {
        console.log(`⚠️  Class is more than 24 hours old - too late for automatic reminders`);
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  const needsAttendance = schedules.filter(async (s) => {
    const attendanceDate = new Date(s.startTime);
    attendanceDate.setHours(0, 0, 0, 0);
    const att = await Attendance.findOne({
      school: s.school,
      schedule: s._id,
      date: attendanceDate,
    }).setOptions({ skipTenantFilter: true });
    return !att;
  });

  console.log(`Total classes: ${schedules.length}`);
  console.log(`Missing attendance: Check above for details`);
  console.log('\n💡 To send reminders, use the admin UI at /admin/attendance-reminders');
  console.log('   Select the appropriate time window based on when classes ended');

  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

checkPendingClasses().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
