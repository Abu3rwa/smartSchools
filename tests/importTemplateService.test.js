import assert from 'node:assert/strict';
import test from 'node:test';

import ImportTemplate from '../models/ImportTemplate.js';
import { buildFallbackSampleCsv } from '../services/import/importSchemas.js';
import {
    sanitizeCsvFilename,
    validateTemplateUploadFile,
    validateEntityType,
    getTemplateDownloadForEntity,
    setTemplateStatus
} from '../services/import/importTemplateService.js';

test('sanitizeCsvFilename strips unsafe characters and preserves csv extension', () => {
    const sanitized = sanitizeCsvFilename('../../students sample?.csv', 'students');
    assert.equal(sanitized.includes('..'), false);
    assert.equal(sanitized.endsWith('.csv'), true);
});

test('validateTemplateUploadFile blocks invalid file type', () => {
    assert.throws(
        () => validateTemplateUploadFile({
            originalname: 'template.txt',
            mimetype: 'text/plain',
            size: 100,
            buffer: Buffer.from('a,b\n1,2\n')
        }),
        /Only \.csv files are allowed/
    );
});

test('validateEntityType rejects unsupported entities', () => {
    assert.throws(() => validateEntityType('unknown_entity'), /Unsupported entityType/);
});

test('buildFallbackSampleCsv returns schema-based csv for supported entity', () => {
    const csv = buildFallbackSampleCsv('students');
    assert.match(csv, /firstName/);
    assert.match(csv, /John/);
});

test('getTemplateDownloadForEntity returns fallback when no active template exists', async () => {
    const originalFindOne = ImportTemplate.findOne;
    ImportTemplate.findOne = () => ({
        sort: () => ({
            lean: async () => null
        })
    });

    try {
        const result = await getTemplateDownloadForEntity('classes');
        assert.equal(result.source, 'fallback');
        assert.match(result.csv, /grade/);
    } finally {
        ImportTemplate.findOne = originalFindOne;
    }
});

test('getTemplateDownloadForEntity returns custom source when active template exists', async () => {
    const originalFindOne = ImportTemplate.findOne;
    ImportTemplate.findOne = () => ({
        sort: () => ({
            lean: async () => ({
                _id: 'template-1',
                entityType: 'teachers',
                filename: 'teachers.csv',
                mimeType: 'text/csv',
                status: 'active',
                version: 'v2',
                notes: '',
                changelog: '',
                filePath: '/tmp/teachers.csv',
                createdBy: 'user-1',
                updatedBy: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date()
            })
        })
    });

    try {
        const result = await getTemplateDownloadForEntity('teachers');
        assert.equal(result.source, 'custom');
        assert.equal(result.template.filename, 'teachers.csv');
    } finally {
        ImportTemplate.findOne = originalFindOne;
    }
});

test('setTemplateStatus deactivates other templates when activated', async () => {
    const originalFindById = ImportTemplate.findById;
    const originalUpdateMany = ImportTemplate.updateMany;

    let updateManyCalls = 0;
    ImportTemplate.findById = async () => ({
        _id: 'template-1',
        entityType: 'subjects',
        status: 'inactive',
        filename: 'subjects.csv',
        mimeType: 'text/csv',
        version: 'v1',
        notes: '',
        changelog: '',
        filePath: '/tmp/subjects.csv',
        createdBy: 'u1',
        updatedBy: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function save() {
            this.updatedAt = new Date();
        },
        toObject() {
            return {
                _id: this._id,
                entityType: this.entityType,
                filename: this.filename,
                mimeType: this.mimeType,
                status: this.status,
                version: this.version,
                notes: this.notes,
                changelog: this.changelog,
                filePath: this.filePath,
                fileUrl: null,
                createdBy: this.createdBy,
                updatedBy: this.updatedBy,
                createdAt: this.createdAt,
                updatedAt: this.updatedAt
            };
        }
    });
    ImportTemplate.updateMany = async () => {
        updateManyCalls += 1;
    };

    try {
        const updated = await setTemplateStatus({
            templateId: 'template-1',
            status: 'active',
            actorUserId: 'user-99'
        });
        assert.equal(updated.status, 'active');
        assert.equal(updateManyCalls, 1);
    } finally {
        ImportTemplate.findById = originalFindById;
        ImportTemplate.updateMany = originalUpdateMany;
    }
});
