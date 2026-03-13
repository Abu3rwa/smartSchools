import assert from 'node:assert/strict';
import test from 'node:test';

import { createCurriculumMapService } from '../services/curriculum/curriculumMapService.js';

const makeReq = (overrides = {}) => ({
    schoolId: 'school-1',
    departmentId: null,
    user: { _id: 'admin-1', role: 'admin', permissions: [] },
    params: {},
    query: {},
    body: {},
    ...overrides
});

test('createCurriculumMap rejects when current map already exists', async () => {
    const service = createCurriculumMapService({
        repository: {
            findClassById: async () => ({ _id: 'class-1', grade: 6, department: null }),
            findCurrentCurriculumMapByScope: async () => ({ _id: 'map-existing' })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.createCurriculumMap({
            req: makeReq({
                body: {
                    academicYear: '2026-2027',
                    classId: 'class-1',
                    subjectId: 'sub-1',
                    title: 'Map'
                }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 409);
            return true;
        }
    );
});

test('createCurriculumMap rejects teacher outside assigned class-subject scope', async () => {
    const service = createCurriculumMapService({
        repository: {
            findClassById: async () => ({ _id: 'class-1', grade: 6, department: null }),
            getTeacherScope: async () => ({ classSubjectKeys: ['class-2:sub-1'] })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.createCurriculumMap({
            req: makeReq({
                user: { _id: 'teacher-1', role: 'teacher', permissions: [] },
                body: {
                    academicYear: '2026-2027',
                    classId: 'class-1',
                    subjectId: 'sub-1',
                    title: 'Map'
                }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 403);
            return true;
        }
    );
});

test('listCurriculumMaps returns paginated data', async () => {
    const service = createCurriculumMapService({
        repository: {
            listCurriculumMaps: async () => ([{ _id: 'map-1', status: 'published' }]),
            countCurriculumMaps: async () => 1,
            findSchoolById: async () => ({ settings: { curriculum: {} } })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    const result = await service.listCurriculumMaps({ req: makeReq({ query: { page: 1, limit: 10 } }) });
    assert.equal(Array.isArray(result.items), true);
    assert.equal(result.pagination.total, 1);
});

test('submitCurriculumMapForReview transitions status and notifies approvers', async () => {
    const saved = [];
    const notifications = [];
    const map = {
        _id: 'map-1',
        title: 'Map',
        academicYear: '2026-2027',
        classId: { _id: 'class-1', name: 'Class 5A' },
        grade: 7,
        department: null,
        status: 'draft',
        workflow: {},
        createdBy: 'creator-1',
        auditTrail: [],
        workflowHistory: [],
        save: async function save() {
            saved.push(this.status);
            return this;
        }
    };

    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => map,
            saveCurriculumMap: async (item) => item.save(),
            listApprovers: async () => [{ _id: 'approver-1' }],
            findSchoolById: async () => ({ settings: { curriculum: {} } })
        },
        notificationService: {
            notifyUsers: async (payload) => {
                notifications.push(payload);
                return { sent: 1 };
            }
        }
    });

    await service.submitCurriculumMapForReview({ req: makeReq({ params: { mapId: 'map-1' } }) });
    assert.equal(saved.includes('submitted'), true);
    assert.equal(notifications.length, 1);
});

test('getCurriculumMapById blocks teacher from another teacher draft', async () => {
    const map = {
        _id: 'map-1',
        status: 'draft',
        classId: 'class-1',
        subject: 'sub-1',
        department: null,
        createdBy: 'teacher-a'
    };

    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => map,
            getTeacherScope: async () => ({ classSubjectKeys: ['class-1:sub-1'] }),
            findSchoolById: async () => ({ settings: { curriculum: {} } })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.getCurriculumMapById({ req: makeReq({ params: { mapId: 'map-1' }, user: { _id: 'teacher-b', role: 'teacher', permissions: [] } }) }),
        (error) => {
            assert.equal(error.statusCode, 403);
            return true;
        }
    );
});

test('publishCurriculumMap requires approved review decision', async () => {
    const map = {
        _id: 'map-1',
        status: 'submitted',
        workflow: { reviewDecision: 'changes_requested', currentState: 'submitted' },
        classId: 'class-1',
        subject: 'sub-1',
        academicYear: '2026-2027',
        version: 2,
        auditTrail: [],
        workflowHistory: []
    };

    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => map,
            findSchoolById: async () => ({ settings: { curriculum: {} } })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.publishCurriculumMap({ req: makeReq({ params: { mapId: 'map-1' } }) }),
        (error) => {
            assert.equal(error.statusCode, 409);
            return true;
        }
    );
});

test('exportCurriculumMap returns csv payload metadata', async () => {
    const map = {
        _id: 'map-1',
        status: 'published',
        grade: 6,
        subject: 'sub-1',
        classId: { _id: 'class-1', name: 'Class 6A' },
        title: 'Map',
        academicYear: '2026-2027',
        version: 1,
        units: []
    };

    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => map,
            findSchoolById: async () => ({ settings: { curriculum: {} } })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    const file = await service.exportCurriculumMap({
        req: makeReq({
            params: { mapId: 'map-1' },
            query: { format: 'csv' },
            user: { _id: 'admin-1', role: 'admin', permissions: [] }
        })
    });

    assert.equal(file.contentType.includes('text/csv'), true);
    assert.equal(typeof file.text, 'string');
});

test('uploadCurriculumImportSource queues file import job', async () => {
    const map = {
        _id: 'map-1',
        status: 'draft',
        department: null,
        createdBy: 'admin-1'
    };
    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => map,
            findSchoolById: async () => ({ settings: { curriculum: {} } })
        },
        aiImportService: {
            createUploadSourceAndJob: async () => ({
                sourceDocument: { _id: 'source-1' },
                job: { _id: 'job-1', status: 'queued' }
            })
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    const result = await service.uploadCurriculumImportSource({
        req: makeReq({
            params: { mapId: 'map-1' },
            file: { originalname: 'map.pdf', mimetype: 'application/pdf', size: 5000 }
        })
    });
    assert.equal(result.job.status, 'queued');
});

test('applyCurriculumImportJob returns hydrated map and job', async () => {
    const map = {
        _id: 'map-1',
        status: 'draft',
        department: null,
        createdBy: 'admin-1',
        templateKey: 'default-flex-template',
        structure: { granularity: 'unit_week' }
    };
    let jobFetchCount = 0;
    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => map,
            findSchoolById: async () => ({ settings: { curriculum: {} } })
        },
        aiImportService: {
            getJobByScope: async () => {
                jobFetchCount += 1;
                return { _id: 'job-1', status: 'completed' };
            },
            applyJobSuggestions: async () => true
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    const result = await service.applyCurriculumImportJob({
        req: makeReq({
            params: { mapId: 'map-1', jobId: 'job-1' },
            body: { applyMode: 'all' }
        })
    });

    assert.equal(result.map._id, 'map-1');
    assert.equal(result.job._id, 'job-1');
    assert.equal(jobFetchCount >= 2, true);
});

test('deleteCurriculumMap deletes map and import artifacts for authorized manager', async () => {
    const deleted = { map: false, jobs: false, sources: false };
    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => ({
                _id: 'map-1',
                department: null,
                createdBy: 'teacher-1'
            }),
            countPacingGuidesByMapId: async () => 0,
            deleteCurriculumImportJobsByMap: async () => {
                deleted.jobs = true;
            },
            deleteCurriculumSourceDocumentsByMap: async () => {
                deleted.sources = true;
            },
            deleteCurriculumMapById: async () => {
                deleted.map = true;
            }
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    const result = await service.deleteCurriculumMap({
        req: makeReq({
            params: { mapId: 'map-1' },
            user: { _id: 'admin-1', role: 'admin', permissions: [] }
        })
    });

    assert.equal(result.deleted, true);
    assert.equal(deleted.jobs, true);
    assert.equal(deleted.sources, true);
    assert.equal(deleted.map, true);
});

test('deleteCurriculumMap blocks deletion when pacing guides reference the map', async () => {
    const service = createCurriculumMapService({
        repository: {
            findCurriculumMapById: async () => ({
                _id: 'map-1',
                department: null,
                createdBy: 'teacher-1'
            }),
            countPacingGuidesByMapId: async () => 2
        },
        notificationService: { notifyUsers: async () => ({ sent: 0 }) }
    });

    await assert.rejects(
        () => service.deleteCurriculumMap({
            req: makeReq({
                params: { mapId: 'map-1' },
                user: { _id: 'admin-1', role: 'admin', permissions: [] }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 409);
            return true;
        }
    );
});
