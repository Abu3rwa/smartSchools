import assert from 'node:assert/strict';
import test from 'node:test';

import { createPacingOverrideService } from '../services/curriculum/pacingOverrideService.js';

const makeReq = (overrides = {}) => ({
    schoolId: 'school-1',
    departmentId: null,
    user: { _id: 'teacher-1', role: 'teacher', permissions: [] },
    params: {},
    query: {},
    body: {},
    ...overrides
});

test('createOverrideRequest enforces teacher assignment scope', async () => {
    const service = createPacingOverrideService({
        repository: {
            findPacingGuideById: async () => ({
                _id: 'guide-1',
                title: 'Guide',
                status: 'published',
                classId: 'class-2',
                subject: 'subject-2',
                overridePolicy: { allowTeacherOverride: true },
                entries: [{ _id: 'entry-1' }]
            }),
            getTeacherScope: async () => ({ classIds: ['class-1'], subjectIds: ['subject-1'] })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.createOverrideRequest({
            req: makeReq({
                body: {
                    pacingGuideId: 'guide-1',
                    pacingEntryId: 'entry-1',
                    reason: 'Need adjustment',
                    requestPayload: { weekNumber: 1 }
                }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 403);
            return true;
        }
    );
});

test('approveOverrideRequest applies payload to pacing entry', async () => {
    const guide = {
        _id: 'guide-1',
        department: null,
        syncStatus: 'in_sync',
        entries: [
            {
                _id: 'entry-1',
                focus: 'Old',
                objectives: [],
                assessment: '',
                notes: ''
            }
        ]
    };
    const override = {
        _id: 'override-1',
        status: 'pending',
        requestedBy: 'teacher-1',
        pacingGuide: 'guide-1',
        pacingEntryId: 'entry-1',
        requestPayload: { focus: 'Updated', objectives: ['Obj'], assessment: 'Quiz', notes: 'Adjusted' },
        decision: {}
    };

    const service = createPacingOverrideService({
        repository: {
            findOverrideRequestById: async () => override,
            findPacingGuideById: async () => guide,
            savePacingGuide: async () => guide,
            saveOverrideRequest: async () => override
        },
        notificationService: { notifyUsers: async () => ({ sent: 1 }) }
    });

    const data = await service.approveOverrideRequest({
        req: makeReq({
            user: { _id: 'approver-1', role: 'department_principal', permissions: [] },
            params: { overrideId: 'override-1' },
            body: { note: 'Looks good' }
        })
    });

    assert.equal(data.status, 'approved');
    assert.equal(guide.entries[0].focus, 'Updated');
});

test('rejectOverrideRequest marks request rejected', async () => {
    const override = {
        _id: 'override-1',
        status: 'pending',
        requestedBy: 'teacher-1',
        decision: {}
    };

    const service = createPacingOverrideService({
        repository: {
            findOverrideRequestById: async () => override,
            saveOverrideRequest: async () => override
        },
        notificationService: { notifyUsers: async () => ({ sent: 1 }) }
    });

    const data = await service.rejectOverrideRequest({
        req: makeReq({
            user: { _id: 'approver-1', role: 'department_principal', permissions: [] },
            params: { overrideId: 'override-1' },
            body: { note: 'Not aligned' }
        })
    });

    assert.equal(data.status, 'rejected');
    assert.equal(data.decision.note, 'Not aligned');
});
