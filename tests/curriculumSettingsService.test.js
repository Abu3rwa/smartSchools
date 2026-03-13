import assert from 'node:assert/strict';
import test from 'node:test';

import { createCurriculumSettingsService } from '../services/curriculum/curriculumSettingsService.js';

const makeReq = (overrides = {}) => ({
    schoolId: 'school-1',
    body: {},
    ...overrides
});

test('getSettings returns stored curriculum settings', async () => {
    const service = createCurriculumSettingsService({
        repository: {
            findSchoolById: async () => ({
                settings: { curriculum: { enabled: true, weekStartDay: 'monday' } }
            })
        }
    });

    const result = await service.getSettings({ req: makeReq() });
    assert.equal(result.enabled, true);
    assert.equal(result.weekStartDay, 'monday');
});

test('updateSettings merges partial settings payload', async () => {
    const school = {
        settings: {
            curriculum: {
                enabled: true,
                exports: { allowCsv: true, allowPdf: true }
            }
        },
        save: async function save() { return this; }
    };

    const service = createCurriculumSettingsService({
        repository: {
            findSchoolById: async () => school
        }
    });

    const result = await service.updateSettings({
        req: makeReq({ body: { exports: { allowPdf: false } } })
    });

    assert.equal(result.enabled, true);
    assert.equal(result.exports.allowCsv, true);
    assert.equal(result.exports.allowPdf, false);
});
