import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRequestSchema } from '../middleware/schemaValidator.js';
import {
    curriculumImportApplyBodySchema,
    curriculumImportGoogleDocBodySchema,
    curriculumImportJobParamsSchema,
    curriculumMapCreateBodySchema,
    curriculumMapReviewBodySchema,
    pacingGuideCreateBodySchema,
    pacingOverrideCreateBodySchema
} from '../validators/curriculumValidators.js';

test('curriculumMapCreateBodySchema accepts valid payload', () => {
    const parsed = curriculumMapCreateBodySchema.parse({
        academicYear: '2026-2027',
        classId: '507f1f77bcf86cd799439012',
        subjectId: '507f1f77bcf86cd799439011',
        title: 'Class 5A ELA Scope',
        units: [{ title: 'Numbers', startWeek: 1, endWeek: 3 }]
    });

    assert.equal(parsed.academicYear, '2026-2027');
    assert.equal(parsed.units.length, 1);
});

test('curriculumMapReviewBodySchema rejects unknown decision', () => {
    assert.throws(
        () => curriculumMapReviewBodySchema.parse({ decision: 'publish' }),
        /Invalid option/i
    );
});

test('pacingGuideCreateBodySchema validates required ids', () => {
    const parsed = pacingGuideCreateBodySchema.parse({
        mapId: '507f1f77bcf86cd799439011',
        classId: '507f1f77bcf86cd799439012',
        term: 'Term 1'
    });
    assert.equal(parsed.term, 'Term 1');

    assert.throws(
        () => pacingGuideCreateBodySchema.parse({ mapId: 'invalid', classId: '507f1f77bcf86cd799439012', term: 'Term 1' }),
        /Invalid id/i
    );
});

test('pacingOverrideCreateBodySchema enforces reason and request payload', () => {
    const parsed = pacingOverrideCreateBodySchema.parse({
        pacingGuideId: '507f1f77bcf86cd799439011',
        pacingEntryId: 'entry-1',
        reason: 'Need more review before assessment',
        requestPayload: {
            weekNumber: 4,
            focus: 'Review and consolidation'
        }
    });

    assert.equal(parsed.requestPayload.weekNumber, 4);
    assert.equal(parsed.reason.length > 0, true);
});

test('validateRequestSchema returns validation details for curriculum payload', async () => {
    const middleware = validateRequestSchema({ bodySchema: curriculumMapCreateBodySchema });
    const req = {
        body: {
            academicYear: 'bad',
            classId: 'bad',
            subjectId: 'bad',
            title: ''
        }
    };

    let nextError = null;
    await new Promise((resolve) => {
        middleware(req, {}, (error) => {
            nextError = error || null;
            resolve();
        });
    });

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.code, 'VALIDATION_ERROR');
    assert.equal(Array.isArray(nextError.details), true);
    assert.ok(nextError.details.length >= 3);
});

test('curriculumImportGoogleDocBodySchema requires docId or docUrl', () => {
    const parsed = curriculumImportGoogleDocBodySchema.parse({
        docUrl: 'https://docs.google.com/document/d/abc1234567890/edit'
    });
    assert.equal(typeof parsed.docUrl, 'string');

    assert.throws(
        () => curriculumImportGoogleDocBodySchema.parse({}),
        /docId or docUrl is required/i
    );
});

test('curriculumImportJobParamsSchema validates map and job ids', () => {
    const parsed = curriculumImportJobParamsSchema.parse({
        mapId: '507f1f77bcf86cd799439011',
        jobId: '507f1f77bcf86cd799439012'
    });
    assert.equal(parsed.mapId.length, 24);
});

test('curriculumImportApplyBodySchema validates apply mode payload', () => {
    const parsed = curriculumImportApplyBodySchema.parse({
        applyMode: 'selected',
        selectedSectionIds: ['section_1', 'section_3']
    });
    assert.equal(parsed.applyMode, 'selected');
    assert.equal(parsed.selectedSectionIds.length, 2);
});
