import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import mongoose from 'mongoose';
import StudentBehavior from '../models/StudentBehavior.js';
import BehaviorIncident from '../models/BehaviorIncident.js';
import BehaviorNotification from '../models/BehaviorNotification.js';
import BehaviorType from '../models/BehaviorType.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { queryBehaviorEvents, behaviorEvidenceRows } from '../services/behavior/eventQueryService.js';

test('shared event aggregation executes against isolated local MongoDB', { skip: process.env.BEHAVIOR_TEST_MONGO !== '1' }, async () => {
    const dbName = `test_behavior_${randomUUID().replaceAll('-', '')}`;
    await mongoose.connect(`mongodb://127.0.0.1:27028/${dbName}`, { serverSelectionTimeoutMS: 3000, autoIndex: false });
    try {
        const id = () => new mongoose.Types.ObjectId();
        const school = id(), otherSchool = id(), student = id(), classroom = id(), record = id(), linked = id(), formal = id(), type = id();
        await Student.collection.insertOne({ _id: student, school, firstName: 'Synthetic', lastName: 'Student', currentClass: classroom });
        await Class.collection.insertOne({ _id: classroom, school, name: 'Test class' });
        await BehaviorType.collection.insertOne({ _id: type, school, name: 'Test classroom type' });
        await StudentBehavior.collection.insertMany([
            { _id: record, school, student, class: classroom, incidentDate: new Date(), description: 'Routine note', category: 'disruptive', severity: 'low' },
            { school: otherSchool, student, incidentDate: new Date(), description: 'Cross-school must not appear' },
            { school, student, class: classroom, isConfidential: true, incidentDate: new Date(), description: 'Confidential must not appear' }
        ]);
        await BehaviorIncident.collection.insertMany([
            { _id: linked, school, student, class: classroom, routineEntry: record, behaviorType: type, occurredAt: new Date(), status: 'in_progress', staffNotes: 'Linked duplicate' },
            { _id: formal, school, student, class: classroom, behaviorType: type, occurredAt: new Date(), status: 'logged', staffNotes: 'Formal history' },
            { school: otherSchool, student, occurredAt: new Date(), staffNotes: 'Wrong tenant' }
        ]);
        await BehaviorNotification.collection.insertOne({ school, incident: formal, channel: 'email', status: 'sent', createdAt: new Date() });
        const history = await queryBehaviorEvents({ schoolId: school, studentId: student, classIds: [classroom] });
        assert.equal(history.total, 2);
        assert.equal(history.items.filter(row => row.source === 'record').length, 1);
        assert.equal(history.items.find(row => row.source === 'formal').communication.status, 'sent');
        assert.equal(history.items.find(row => row.source === 'record').communication.status, 'not_sent');
        assert.equal(String(history.items[0].student._id), String(student));
        assert.equal((await queryBehaviorEvents({ schoolId: school, classIds: [] })).total, 0);
        const evidence = await behaviorEvidenceRows({ schoolId: school, studentId: student });
        assert.equal(evidence.length, 2);
        assert.ok(evidence.every(row => row.typeName === 'Test classroom type'));
        assert.ok(evidence.every(row => !('description' in row)));
    } finally {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    }
});
