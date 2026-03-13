import assert from 'node:assert/strict';
import test from 'node:test';

import { createPacingGuideService } from '../services/curriculum/pacingGuideService.js';

const makeReq = (overrides = {}) => ({
    schoolId: 'school-1',
    departmentId: null,
    user: { _id: 'admin-1', role: 'admin', permissions: [] },
    params: {},
    query: {},
    body: {},
    ...overrides
});

test('createPacingGuide enforces guide class matching map class', async () => {
    const map = {
        _id: 'map-1',
        classId: 'class-2',
        grade: 8,
        academicYear: '2026-2027',
        subject: 'sub-1',
        units: []
    };
    const service = createPacingGuideService({
        repository: {
            findCurriculumMapById: async () => map,
            findClassById: async () => ({ _id: 'class-1', grade: 7 }),
            createPacingGuide: async () => null
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.createPacingGuide({
            req: makeReq({
                body: { mapId: 'map-1', classId: 'class-1', term: 'Term 1' }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 400);
            return true;
        }
    );
});

test('listPacingGuides returns pagination payload', async () => {
    const service = createPacingGuideService({
        repository: {
            listPacingGuides: async () => ([{ _id: 'guide-1' }]),
            countPacingGuides: async () => 1
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    const result = await service.listPacingGuides({ req: makeReq({ query: { page: 1, limit: 20 } }) });
    assert.equal(result.pagination.total, 1);
    assert.equal(result.items.length, 1);
});

test('updatePacingGuide rejects when status is not draft', async () => {
    const guide = { _id: 'guide-1', status: 'published', department: null };
    const service = createPacingGuideService({
        repository: {
            findPacingGuideById: async () => guide
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.updatePacingGuide({ req: makeReq({ params: { guideId: 'guide-1' }, body: { title: 'x' } }) }),
        (error) => {
            assert.equal(error.statusCode, 409);
            return true;
        }
    );
});

test('reconcilePacingGuide apply_map_diff updates map reference and sync status', async () => {
    const guide = {
        _id: 'guide-1',
        academicYear: '2026-2027',
        grade: 6,
        subject: 'sub-1',
        classId: 'class-1',
        department: null,
        entries: [{ weekNumber: 1, focus: 'Old', objectives: [], assessment: '', notes: '' }],
        mapRef: { mapId: 'map-old', mapVersion: 1 },
        syncStatus: 'out_of_sync',
        auditTrail: [],
        save: async function save() { return this; }
    };

    const service = createPacingGuideService({
        repository: {
            findPacingGuideById: async () => guide,
            findCurrentCurriculumMapByScope: async () => ({
                _id: 'map-new',
                version: 2,
                units: [{ _id: 'unit-1', title: 'New Unit', startWeek: 1, endWeek: 1 }]
            }),
            savePacingGuide: async (item) => item.save()
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    const updated = await service.reconcilePacingGuide({
        req: makeReq({ params: { guideId: 'guide-1' }, body: { strategy: 'apply_map_diff' } })
    });

    assert.equal(updated.mapRef.mapId, 'map-new');
    assert.equal(updated.mapRef.mapVersion, 2);
    assert.equal(updated.syncStatus, 'reconciled');
});
