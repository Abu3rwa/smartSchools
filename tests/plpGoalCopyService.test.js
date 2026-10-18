import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildCopiedGoal,
    buildCopiedTask,
    isCompatibleDestinationRecord,
    normalizeDestinationRecordIds,
} from '../services/plpGoalCopyService.js';

const sourceGoal = {
    _id: 'source-goal',
    school: 'school-id',
    goalType: 'academic',
    title: 'Build reading fluency',
    description: 'Read a short passage each day',
    linkedTraitCodes: ['PERSISTENCE'],
    linkedSubjectId: 'subject-id',
    linkedStandardIds: ['standard-id'],
    baselineNote: 'Current baseline',
    successCriteria: 'Read 90 words per minute',
    teacherProgressNote: 'Private progress note',
    targetDate: new Date('2026-11-01T00:00:00Z'),
    checkInDate: new Date('2026-10-28T00:00:00Z'),
    milestones: [{ title: 'Read a short passage', targetDate: new Date('2026-10-28T00:00:00Z'), status: 'achieved', completedAt: new Date() }],
    status: 'completed',
    aiSuggested: true,
};

test('buildCopiedGoal creates an independent active goal and clears progress notes', () => {
    const copied = buildCopiedGoal({
        sourceGoal,
        destinationRecordId: 'destination-record',
        copyDueDates: false,
        copyOperationId: 'copy-operation-123',
        actorId: 'teacher-id',
    });

    assert.equal(copied.plpRecord, 'destination-record');
    assert.equal(copied.status, 'active');
    assert.equal(copied.teacherProgressNote, '');
    assert.equal(copied.targetDate, null);
    assert.equal(copied.checkInDate, null);
    assert.equal(copied.milestones[0].status, 'pending');
    assert.equal(copied.milestones[0].completedAt, null);
    assert.equal(copied.aiSuggested, true);
    assert.deepEqual(copied.linkedTraitCodes, ['PERSISTENCE']);
    assert.notEqual(copied.linkedTraitCodes, sourceGoal.linkedTraitCodes);
});

test('buildCopiedGoal preserves the target date only when requested', () => {
    const copied = buildCopiedGoal({
        sourceGoal,
        destinationRecordId: 'destination-record',
        copyDueDates: true,
        copyOperationId: 'copy-operation-123',
        actorId: 'teacher-id',
    });

    assert.equal(copied.targetDate, sourceGoal.targetDate);
    assert.equal(copied.checkInDate, sourceGoal.checkInDate);
});

test('buildCopiedTask resets student work, teacher feedback, state, evidence and notification fields', () => {
    const sourceTask = {
        school: 'school-id',
        title: 'Read aloud',
        instructions: 'Read the passage',
        dueDate: new Date('2026-11-02T00:00:00Z'),
        status: 'completed',
        studentCompletionNote: 'I finished this',
        studentComment: 'Here is my note',
        teacherFeedback: 'Excellent',
        teacherFollowUpAction: 'Continue',
        completionEvidenceLinks: ['evidence-link'],
        notifiedAt: new Date(),
        completedAt: new Date(),
    };
    const copied = buildCopiedTask({
        sourceTask,
        destinationRecord: { _id: 'destination-record', student: 'destination-student' },
        goalId: 'destination-goal',
        actorId: 'teacher-id',
        copyDueDates: false,
    });

    assert.equal(copied.status, 'assigned');
    assert.equal(copied.dueDate, null);
    assert.equal(copied.student, 'destination-student');
    assert.equal(copied.plpRecord, 'destination-record');
    assert.equal(copied.plpGoal, 'destination-goal');
    assert.equal(copied.studentCompletionNote, '');
    assert.equal(copied.studentComment, '');
    assert.equal(copied.teacherFeedback, '');
    assert.equal(copied.teacherFollowUpAction, '');
    assert.deepEqual(copied.completionEvidenceLinks, []);
    assert.equal(copied.notifiedAt, null);
    assert.equal(copied.notificationStatus, 'pending');
    assert.equal(copied.completedAt, null);
});

test('normalizeDestinationRecordIds removes blanks and duplicate selections', () => {
    assert.deepEqual(
        normalizeDestinationRecordIds([' record-a ', 'record-a', '', null, 'record-b']),
        ['record-a', 'record-b']
    );
});

test('destination compatibility enforces same school, class, academic year and round but permits any record status', () => {
    const source = {
        school: 'school-1',
        class: 'class-1',
        academicYear: '2026-2027',
        cycle: 'cycle-1',
        student: 'student-1',
        status: 'in_progress',
    };
    const destination = {
        ...source,
        student: 'student-2',
    };
    assert.equal(isCompatibleDestinationRecord(source, destination), true);
    assert.equal(isCompatibleDestinationRecord(source, { ...destination, school: 'school-2' }), false);
    assert.equal(isCompatibleDestinationRecord(source, { ...destination, class: 'class-2' }), false);
    assert.equal(isCompatibleDestinationRecord(source, { ...destination, academicYear: '2025-2026' }), false);
    assert.equal(isCompatibleDestinationRecord(source, { ...destination, cycle: 'cycle-2' }), false);
    assert.equal(isCompatibleDestinationRecord(source, { ...destination, student: 'student-1' }), false);
    assert.equal(isCompatibleDestinationRecord(source, { ...destination, status: 'submitted' }), true);
    assert.equal(isCompatibleDestinationRecord(source, { ...destination, status: 'locked' }), true);
});
