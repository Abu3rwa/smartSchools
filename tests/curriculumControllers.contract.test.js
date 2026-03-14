import assert from 'node:assert/strict';
import test from 'node:test';

import { createCurriculumMapController } from '../controllers/curriculumMapController.js';

const runController = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(key, value) {
            this.headers[key] = value;
            return this;
        },
        json(payload) {
            resolve({ statusCode: this.statusCode, payload, error: null });
            return this;
        },
        send(payload) {
            resolve({ statusCode: this.statusCode, payload, error: null });
            return this;
        }
    };

    handler(req, res, (error) => {
        resolve({ statusCode: res.statusCode, payload: null, error });
    });
});

const buildReq = (overrides = {}) => ({
    body: {},
    query: {},
    params: {},
    schoolId: 'school-1',
    user: { _id: 'actor-1', role: 'admin' },
    ...overrides
});

test('POST /curriculum-maps controller returns success contract', async () => {
    const controller = createCurriculumMapController({
        mapService: {
            createCurriculumMap: async () => ({ _id: 'map-1', status: 'draft' })
        }
    });

    const result = await runController(controller.createCurriculumMapController, buildReq());
    assert.equal(result.error, null);
    assert.equal(result.statusCode, 201);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data._id, 'map-1');
});

test('curriculum export controller sets attachment headers and sends payload', async () => {
    const controller = createCurriculumMapController({
        mapService: {
            exportCurriculumMap: async () => ({
                contentType: 'text/csv; charset=utf-8',
                filename: 'map.csv',
                text: 'a,b'
            })
        }
    });

    const result = await runController(controller.exportCurriculumMapController, buildReq());
    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload, 'a,b');
});

test('curriculum import upload controller returns creation contract', async () => {
    const controller = createCurriculumMapController({
        mapService: {
            uploadCurriculumImportSource: async () => ({
                sourceDocument: { _id: 'source-1' },
                job: { _id: 'job-1', status: 'queued' }
            })
        }
    });

    const result = await runController(controller.uploadCurriculumImportSourceController, buildReq());
    assert.equal(result.error, null);
    assert.equal(result.statusCode, 201);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.job.status, 'queued');
});

test('curriculum import apply controller returns updated map payload', async () => {
    const controller = createCurriculumMapController({
        mapService: {
            applyCurriculumImportJob: async () => ({
                map: { _id: 'map-1', status: 'draft' },
                job: { _id: 'job-1', status: 'completed' }
            })
        }
    });

    const result = await runController(controller.applyCurriculumImportJobController, buildReq());
    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.map._id, 'map-1');
});

test('curriculum delete controller returns success contract', async () => {
    const controller = createCurriculumMapController({
        mapService: {
            deleteCurriculumMap: async () => ({
                deleted: true,
                mapId: 'map-1'
            })
        }
    });

    const result = await runController(controller.deleteCurriculumMapController, buildReq());
    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.deleted, true);
});
