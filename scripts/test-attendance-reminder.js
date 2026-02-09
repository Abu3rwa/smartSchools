/**
 * Test script: create a fake class that ended 59 minutes ago (actual time),
 * wait 1 minute so we're at "1 hour after end", then run the reminder job.
 * Run from server folder: node scripts/test-attendance-reminder.js
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

async function run() {
  const now = new Date();
  // Class ended 59 minutes ago → in 1 minute it will be exactly 1 hour after end (reminder window)
  const endTime = new Date(now.getTime() - 59 * 60 * 1000);
  const startTime = new Date(endTime.getTime() - 45 * 60 * 1000); // 45-min class

  await connectDB();

  // Find a school with teacher (with email), class, subject, and room
  const school = await School.findOne().lean();
  if (!school) {
    console.error('No school found. Run seed first.');
    process.exit(1);
  }
  const schoolId = school._id;

  const teacher = await User.findOne({
    school: schoolId,
    role: 'teacher',
    email: { $exists: true, $ne: '' }
  }).setOptions({ skipTenantFilter: true }).lean();
  if (!teacher) {
    console.error('No teacher with email found.');
    process.exit(1);
  }

  let room = await Room.findOne({ school: schoolId }).setOptions({ skipTenantFilter: true }).lean();
  if (!room) {
    const [r] = await Room.create([{
      school: schoolId,
      name: 'Test Room 101',
      type: 'classroom',
      capacity: 30,
      createdBy: teacher._id
    }]);
    room = r.toObject();
    console.log('Created test room:', room.name);
  }

  const cls = await Class.findOne({ school: schoolId }).setOptions({ skipTenantFilter: true }).lean();
  const subject = await Subject.findOne({ school: schoolId }).setOptions({ skipTenantFilter: true }).lean();
  if (!cls || !subject) {
    console.error('No class or subject found. Run seed first.');
    process.exit(1);
  }

  const schedule = await Schedule.create([{
    school: schoolId,
    title: 'Test class for attendance reminder',
    type: 'class',
    requiresAttendance: true,
    status: 'scheduled',
    teacher: teacher._id,
    class: cls._id,
    subject: subject._id,
    room: room._id,
    startTime,
    endTime,
    createdBy: teacher._id
  }]).then(([s]) => s);

  console.log('Created fake class (schedule):');
  console.log('  startTime:', startTime.toISOString());
  console.log('  endTime:  ', endTime.toISOString());
  console.log('  teacher:  ', teacher.email);
  console.log('  (Class ended 59 min ago; in 1 min we run the job = 1 hour after end)\n');
  console.log('Waiting 1 minute, then running reminder job...\n');

  await new Promise((r) => setTimeout(r, 60 * 1000));

  const { results } = await processAttendanceReminders();
  console.log('Reminder job result:', results);

  // Optional: remove the test schedule so it doesn't pollute data
  await Schedule.findByIdAndDelete(schedule._id).setOptions({ skipTenantFilter: true });
  console.log('Test schedule deleted.');

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
