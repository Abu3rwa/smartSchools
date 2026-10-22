/* global process */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import LessonPlan from '../models/LessonPlan.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Assignment from '../models/Assignment.js';

dotenv.config();
const SCHOOL = new mongoose.Types.ObjectId('6984f2771b6aa993e32a0f28');

await connectDB();

const classes = await Class.find({ school: SCHOOL })
    .select('name academicYear section status')
    .setOptions({ skipTenantFilter: true })
    .lean();
console.log('--- classes ---');
for (const row of classes) {
    console.log(`${row._id}  ${row.name}  year=${row.academicYear}  status=${row.status}`);
}

const subjects = await Subject.find({ school: SCHOOL }).select('name code')
    .setOptions({ skipTenantFilter: true }).lean();
console.log('--- subjects ---');
for (const row of subjects) console.log(`${row._id}  ${row.name}  ${row.code || ''}`);

console.log('--- lesson plans ---');
const plans = await LessonPlan.find({ school: SCHOOL })
    .select('class subject teacher date title')
    .setOptions({ skipTenantFilter: true })
    .lean();
for (const row of plans) {
    console.log(`${row._id}  class=${row.class}  subject=${row.subject}  teacher=${row.teacher}  date=${row.date}`);
}

console.log('--- assignments with links ---');
const assignments = await Assignment.find({ school: SCHOOL })
    .select('title class subject assignmentTypeKey lessonPlanIds createdAt')
    .sort({ createdAt: -1 })
    .limit(8)
    .setOptions({ skipTenantFilter: true })
    .lean();
for (const row of assignments) {
    console.log(`${row._id}  ${row.assignmentTypeKey}  class=${row.class}  subject=${row.subject}  links=${(row.lessonPlanIds || []).join(',') || '-'}`);
}

await mongoose.connection.close();
process.exit(0);
