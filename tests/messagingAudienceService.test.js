import assert from 'node:assert/strict';
import test from 'node:test';

import { createMessagingAudienceService } from '../services/messaging/messagingAudienceService.js';

test('resolveClassScopeForMessaging denies teacher request when teacher profile is missing', async () => {
    const service = createMessagingAudienceService({
        repository: {
            findClassIdsByQuery: async () => []
        },
        resolveTeacherProfileFn: async () => null,
        getTeacherClassIdsFn: async () => []
    });

    const scope = await service.resolveClassScopeForMessaging({
        req: {
            user: { role: 'teacher' },
            schoolId: 'school-1'
        },
        requestedClassIds: ['507f1f77bcf86cd799439011']
    });

    assert.deepEqual(scope.allowedClassIds, []);
    assert.deepEqual(scope.deniedClassIds, ['507f1f77bcf86cd799439011']);
});

test('resolveClassScopeForMessaging filters teacher classes to allowed assignments', async () => {
    const service = createMessagingAudienceService({
        repository: {
            findClassIdsByQuery: async () => []
        },
        resolveTeacherProfileFn: async () => ({ _id: 'teacher-profile-1' }),
        getTeacherClassIdsFn: async () => [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439012'
        ]
    });

    const scope = await service.resolveClassScopeForMessaging({
        req: {
            user: { role: 'teacher' },
            schoolId: 'school-1'
        },
        requestedClassIds: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439013'
        ]
    });

    assert.deepEqual(scope.allowedClassIds, ['507f1f77bcf86cd799439011']);
    assert.deepEqual(scope.deniedClassIds, ['507f1f77bcf86cd799439013']);
    assert.deepEqual(scope.allAccessibleClassIds.sort(), [
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012'
    ]);
});

test('resolveClassScopeForMessaging for admins returns requested class subset from repository', async () => {
    const service = createMessagingAudienceService({
        repository: {
            findClassIdsByQuery: async () => ['507f1f77bcf86cd799439011']
        },
        resolveTeacherProfileFn: async () => null,
        getTeacherClassIdsFn: async () => []
    });

    const scope = await service.resolveClassScopeForMessaging({
        req: {
            user: { role: 'admin' },
            schoolId: 'school-1',
            departmentId: 'dept-1'
        },
        requestedClassIds: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439014'
        ]
    });

    assert.deepEqual(scope.allowedClassIds, ['507f1f77bcf86cd799439011']);
    assert.deepEqual(scope.deniedClassIds, ['507f1f77bcf86cd799439014']);
});

test('resolveRecipientUsersForClasses resolves parent and student recipients with class stats', async () => {
    const service = createMessagingAudienceService({
        repository: {
            findStudentsForClassRecipients: async () => ([
                {
                    currentClass: '507f1f77bcf86cd799439011',
                    user: '507f1f77bcf86cd799439021',
                    email: 'student1@school.test',
                    studentEmail: null,
                    parentInfo: {
                        fatherEmail: 'parent1@school.test',
                        motherEmail: null,
                        guardianEmail: null
                    }
                },
                {
                    currentClass: '507f1f77bcf86cd799439012',
                    user: '507f1f77bcf86cd799439022',
                    email: 'student2@school.test',
                    studentEmail: null,
                    parentInfo: {
                        fatherEmail: 'parent2@school.test',
                        motherEmail: null,
                        guardianEmail: null
                    }
                }
            ]),
            findUsersByRoleAndIds: async ({ role }) => (
                role === 'student'
                    ? [{ _id: '507f1f77bcf86cd799439021', role: 'student', email: 'student1@school.test' }]
                    : []
            ),
            findUsersByRoleAndEmails: async ({ role, emails }) => {
                if (role === 'student') {
                    return emails.includes('student2@school.test')
                        ? [{ _id: '507f1f77bcf86cd799439022', role: 'student', email: 'student2@school.test' }]
                        : [];
                }
                if (role === 'parent') {
                    return [
                        { _id: '507f1f77bcf86cd799439031', role: 'parent', email: 'parent1@school.test' },
                        { _id: '507f1f77bcf86cd799439032', role: 'parent', email: 'parent2@school.test' }
                    ];
                }
                return [];
            }
        },
        resolveTeacherProfileFn: async () => null,
        getTeacherClassIdsFn: async () => []
    });

    const result = await service.resolveRecipientUsersForClasses({
        schoolId: 'school-1',
        classIds: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439012'
        ],
        includeParents: true,
        includeStudents: true
    });

    assert.equal(result.recipientUsers.length, 4);
    assert.equal(result.classStats.get('507f1f77bcf86cd799439011').studentCount, 1);
    assert.equal(result.classStats.get('507f1f77bcf86cd799439011').parentCount, 1);
    assert.equal(result.classStats.get('507f1f77bcf86cd799439011').studentRecipientCount, 1);
    assert.equal(result.classStats.get('507f1f77bcf86cd799439012').studentRecipientCount, 1);
});
