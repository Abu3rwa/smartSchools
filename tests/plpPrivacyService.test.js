import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildFamilySafeProgressUpdate,
    toStudentVisibleGoal,
    toStudentVisibleTask,
} from '../services/plpPrivacyService.js';

test('student-facing goal projection excludes private progress and review notes', () => {
    const goal = toStudentVisibleGoal({
        _id: 'goal-1',
        title: 'Practice persistence',
        status: 'active',
        teacherProgressNote: 'Private note',
        reviewNote: 'Supervisor discussion',
        linkedStandardIds: ['standard-1'],
        milestones: [{ title: 'Complete step one', status: 'achieved', internalNote: 'hidden' }],
    });

    assert.equal(goal.title, 'Practice persistence');
    assert.equal('teacherProgressNote' in goal, false);
    assert.equal('reviewNote' in goal, false);
    assert.equal('linkedStandardIds' in goal, false);
    assert.equal('internalNote' in goal.milestones[0], false);
});

test('student-facing task projection excludes internal follow-up and delivery details', () => {
    const task = toStudentVisibleTask({
        _id: 'task-1',
        title: 'Read a passage',
        status: 'needs_revision',
        teacherFollowUpAction: 'Discuss privately with supervisor',
        notificationError: 'internal delivery failure',
        completionEvidenceLinks: ['private-link'],
    });

    assert.equal(task.title, 'Read a passage');
    assert.equal('teacherFollowUpAction' in task, false);
    assert.equal('notificationError' in task, false);
    assert.equal('completionEvidenceLinks' in task, false);
});

test('family progress projection includes only allowlisted goal and task fields', () => {
    const update = buildFamilySafeProgressUpdate({
        student: { firstName: 'Ava', lastName: 'Lee', parentInfo: { guardianEmail: 'private@example.test' } },
        record: { academicYear: '2026-2027', month: 10 },
        goals: [{
            title: 'Build reading fluency',
            description: 'Read regularly',
            successCriteria: 'Read 90 words per minute',
            status: 'active',
            teacherProgressNote: 'Sensitive teacher note',
            reviewNote: 'Internal supervisor note',
        }],
        tasks: [{
            title: 'Read for 10 minutes',
            instructions: 'Choose a book',
            status: 'assigned',
            teacherFeedback: '',
            studentCompletionNote: 'Private response',
        }],
    });

    assert.equal(update.studentName, 'Ava Lee');
    assert.equal(update.goals[0].title, 'Build reading fluency');
    assert.equal('teacherProgressNote' in update.goals[0], false);
    assert.equal('reviewNote' in update.goals[0], false);
    assert.equal('studentCompletionNote' in update.nextTasks[0], false);
    assert.equal(JSON.stringify(update).includes('private@example.test'), false);
    assert.equal(JSON.stringify(update).includes('Sensitive teacher note'), false);
});
