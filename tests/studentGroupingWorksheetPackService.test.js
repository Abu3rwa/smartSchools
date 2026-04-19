import assert from 'node:assert/strict';
import test from 'node:test';

import GroupingWorksheetPack from '../models/GroupingWorksheetPack.js';
import {
    assertWorksheetPackDistributionAllowed,
    endWorksheetPackAuthoring,
    publishWorksheetPack,
    toWorksheetPackDetail,
    toWorksheetPackListItem
} from '../services/studentGroupingWorksheetPackService.js';

const originalFindOne = GroupingWorksheetPack.findOne;

const restore = () => {
    GroupingWorksheetPack.findOne = originalFindOne;
};

test('assertWorksheetPackDistributionAllowed blocks missing or draft packs', () => {
    assert.throws(
        () => assertWorksheetPackDistributionAllowed(null),
        (error) => {
            assert.equal(error.statusCode, 404);
            return true;
        }
    );

    assert.throws(
        () => assertWorksheetPackDistributionAllowed({ status: 'draft' }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.match(error.message, /end authoring/i);
            return true;
        }
    );
});

test('assertWorksheetPackDistributionAllowed accepts ended and published packs', () => {
    assert.doesNotThrow(() => assertWorksheetPackDistributionAllowed({ status: 'ended' }));
    assert.doesNotThrow(() => assertWorksheetPackDistributionAllowed({ status: 'published' }));
});

test('endWorksheetPackAuthoring transitions draft pack to ended', async () => {
    let saveCalls = 0;
    const pack = {
        status: 'draft',
        authoringEndedAt: null,
        authoringEndedBy: null,
        save: async () => {
            saveCalls += 1;
        }
    };

    try {
        GroupingWorksheetPack.findOne = async (query) => {
            assert.deepEqual(query, { _id: 'pack-1', school: 'school-1' });
            return pack;
        };

        const result = await endWorksheetPackAuthoring({
            packId: 'pack-1',
            schoolId: 'school-1',
            userId: 'user-1'
        });

        assert.equal(result, pack);
        assert.equal(pack.status, 'ended');
        assert.equal(pack.authoringEndedBy, 'user-1');
        assert.equal(saveCalls, 1);
        assert.ok(pack.authoringEndedAt instanceof Date);
    } finally {
        restore();
    }
});

test('endWorksheetPackAuthoring rejects missing and non-draft packs', async () => {
    try {
        GroupingWorksheetPack.findOne = async () => null;

        await assert.rejects(
            () => endWorksheetPackAuthoring({ packId: 'missing', schoolId: 'school-1', userId: 'user-1' }),
            (error) => {
                assert.equal(error.statusCode, 404);
                return true;
            }
        );

        GroupingWorksheetPack.findOne = async () => ({
            status: 'published',
            save: async () => {}
        });

        await assert.rejects(
            () => endWorksheetPackAuthoring({ packId: 'pack-2', schoolId: 'school-1', userId: 'user-1' }),
            (error) => {
                assert.equal(error.statusCode, 409);
                assert.match(error.message, /only draft/i);
                return true;
            }
        );
    } finally {
        restore();
    }
});

test('publishWorksheetPack transitions ended pack to published', async () => {
    let saveCalls = 0;
    const pack = {
        status: 'ended',
        publishedAt: null,
        publishedBy: null,
        save: async () => {
            saveCalls += 1;
        }
    };

    try {
        GroupingWorksheetPack.findOne = async (query) => {
            assert.deepEqual(query, { _id: 'pack-3', school: 'school-1' });
            return pack;
        };

        const result = await publishWorksheetPack({
            packId: 'pack-3',
            schoolId: 'school-1',
            userId: 'user-2'
        });

        assert.equal(result, pack);
        assert.equal(pack.status, 'published');
        assert.equal(pack.publishedBy, 'user-2');
        assert.equal(saveCalls, 1);
        assert.ok(pack.publishedAt instanceof Date);
    } finally {
        restore();
    }
});

test('publishWorksheetPack rejects missing and non-ended packs', async () => {
    try {
        GroupingWorksheetPack.findOne = async () => null;

        await assert.rejects(
            () => publishWorksheetPack({ packId: 'missing', schoolId: 'school-1', userId: 'user-1' }),
            (error) => {
                assert.equal(error.statusCode, 404);
                return true;
            }
        );

        GroupingWorksheetPack.findOne = async () => ({
            status: 'draft',
            save: async () => {}
        });

        await assert.rejects(
            () => publishWorksheetPack({ packId: 'pack-4', schoolId: 'school-1', userId: 'user-1' }),
            (error) => {
                assert.equal(error.statusCode, 409);
                assert.match(error.message, /only ended/i);
                return true;
            }
        );
    } finally {
        restore();
    }
});

test('worksheet pack mappers normalize response payloads', () => {
    const now = new Date('2026-01-02T10:20:30.000Z');
    const pack = {
        _id: 'pack-5',
        title: 'Pack Title',
        status: 'ended',
        academicYear: '2025-2026',
        version: 'invalid-number',
        language: 'en',
        metadata: { totalActivities: 4 },
        snapshot: { sections: [] },
        class: { _id: 'class-1', name: '5A', grade: 5, section: 'A' },
        standard: { _id: 'std-1', code: 'ELA.5.R.1', name: 'Reading', description: 'Read closely', gradeLevel: 5 },
        subject: { _id: 'sub-1', name: 'English', code: 'ELA' },
        generatedBy: { _id: 'teacher-1', email: 'teacher@school.test' },
        createdAt: now,
        authoringEndedAt: now,
        publishedAt: null
    };

    const listItem = toWorksheetPackListItem(pack);
    assert.equal(listItem.id, 'pack-5');
    assert.equal(listItem.version, 1);
    assert.equal(listItem.generatedBy.name, 'teacher@school.test');

    const detail = toWorksheetPackDetail(pack);
    assert.equal(detail.id, 'pack-5');
    assert.equal(detail.class.id, 'class-1');
    assert.equal(detail.standard.code, 'ELA.5.R.1');
    assert.equal(detail.subject.name, 'English');

    assert.equal(toWorksheetPackDetail(null), null);
});