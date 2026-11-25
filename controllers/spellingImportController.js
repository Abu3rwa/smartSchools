import { asyncHandler } from '../middleware/errorHandler.js';
import { domainError } from '../utils/spellingLibraryErrors.js';
import {
    identityMappingsSchema,
    importCommitBodySchema,
    importPreviewFieldsSchema,
    parseDomainInput
} from '../validators/spellingLibraryValidators.js';
import {
    commitSpellingImport,
    previewSpellingImport
} from '../services/spellingImportService.js';

const parseIdentityMappings = (raw) => {
    if (raw === undefined || raw === null || raw === '') return [];
    let value;
    try {
        value = JSON.parse(raw);
    } catch (error) {
        void error;
        throw domainError('INVALID_REQUEST', {
            details: [{ field: 'identityMappings', message: 'must be valid JSON' }]
        });
    }
    return parseDomainInput(identityMappingsSchema, value);
};

export const previewSpellingWords = asyncHandler(async (req, res) => {
    if (!req.file) throw domainError('FILE_REQUIRED');
    const fields = parseDomainInput(importPreviewFieldsSchema, req.body || {});
    const result = await previewSpellingImport({
        schoolId: req.schoolId,
        userId: req.user?._id,
        role: req.user?.role,
        fileName: req.file.originalname || 'spelling-words.csv',
        content: req.file.buffer?.toString('utf8'),
        mode: fields.mode || 'merge',
        identityMappings: parseIdentityMappings(fields.identityMappings)
    });
    return res.status(200).json({ success: true, data: result });
});

export const commitSpellingWords = asyncHandler(async (req, res) => {
    const input = parseDomainInput(importCommitBodySchema, req.body || {});
    const result = await commitSpellingImport({
        schoolId: req.schoolId,
        user: req.user,
        role: req.user?.role,
        importId: input.importId,
        input
    });
    return res.status(200).json({ success: true, data: result });
});
