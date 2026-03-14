import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ImportTemplate from '../../models/ImportTemplate.js';
import {
    ENTITY_TYPES,
    getImportTemplateDefinition,
    buildFallbackSampleCsv,
    normalizeEntityType
} from './importSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'uploads', 'import-templates');
const MAX_TEMPLATE_FILE_SIZE = 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['text/csv', 'application/vnd.ms-excel']);

const toObjectIdString = (value) => (value ? value.toString() : null);

const ensureDirectory = async () => {
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
};

export const sanitizeCsvFilename = (filename, fallbackEntityType = 'template') => {
    const raw = String(filename || '').trim();
    const base = raw || `${fallbackEntityType}.csv`;
    const withoutPath = path.basename(base);
    const normalized = withoutPath.replace(/[^a-zA-Z0-9._-]/g, '_');
    const withExtension = normalized.toLowerCase().endsWith('.csv') ? normalized : `${normalized}.csv`;
    const compact = withExtension.replace(/_+/g, '_');
    return compact.slice(0, 120) || `${fallbackEntityType}.csv`;
};

export const validateTemplateUploadFile = (file = {}) => {
    const size = Number(file.size || 0);
    const mimeType = String(file.mimetype || '').toLowerCase();
    const originalname = String(file.originalname || '').toLowerCase();
    const extension = path.extname(originalname);

    if (!file || !file.buffer) {
        throw Object.assign(new Error('CSV file is required'), { statusCode: 400 });
    }
    if (size <= 0 || size > MAX_TEMPLATE_FILE_SIZE) {
        throw Object.assign(new Error(`CSV file must be between 1 byte and ${MAX_TEMPLATE_FILE_SIZE} bytes`), { statusCode: 400 });
    }
    if (extension !== '.csv') {
        throw Object.assign(new Error('Only .csv files are allowed'), { statusCode: 400 });
    }
    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
        throw Object.assign(new Error('Unsupported CSV mime type'), { statusCode: 400 });
    }
};

export const validateEntityType = (entityType) => {
    const normalized = normalizeEntityType(entityType);
    if (!normalized || !ENTITY_TYPES.includes(normalized)) {
        throw Object.assign(new Error(`Unsupported entityType "${entityType}"`), { statusCode: 400 });
    }
    return normalized;
};

const resolveStoredFilename = ({ entityType, originalname }) => {
    const safeOriginalName = sanitizeCsvFilename(originalname, entityType);
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    return `${entityType}-${stamp}-${safeOriginalName}`;
};

const removeFileSafe = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
};

const toTemplateResponse = (template, { includeFilePath = false } = {}) => ({
    id: toObjectIdString(template._id),
    entityType: template.entityType,
    filename: template.filename,
    mimeType: template.mimeType,
    status: template.status,
    version: template.version,
    notes: template.notes,
    changelog: template.changelog,
    fileUrl: template.fileUrl || null,
    ...(includeFilePath ? { filePath: template.filePath } : {}),
    createdBy: template.createdBy,
    updatedBy: template.updatedBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
});

export const listSupportedTemplateEntities = async () => {
    const activeTemplates = await ImportTemplate.find({ status: 'active' })
        .sort({ updatedAt: -1 })
        .select('entityType version updatedAt filename')
        .lean();

    const latestByEntity = new Map();
    for (const template of activeTemplates) {
        if (!latestByEntity.has(template.entityType)) {
            latestByEntity.set(template.entityType, template);
        }
    }

    return ENTITY_TYPES.map((entityType) => {
        const activeTemplate = latestByEntity.get(entityType) || null;
        const definition = getImportTemplateDefinition(entityType);
        return {
            entityType,
            displayName: definition?.displayName || entityType,
            hasActiveTemplate: Boolean(activeTemplate),
            activeTemplate: activeTemplate
                ? {
                    id: toObjectIdString(activeTemplate._id),
                    filename: activeTemplate.filename,
                    version: activeTemplate.version,
                    updatedAt: activeTemplate.updatedAt
                }
                : null,
            fallbackAvailable: Boolean(definition)
        };
    });
};

export const listTemplatesForAdmin = async () => {
    const templates = await ImportTemplate.find({})
        .sort({ entityType: 1, updatedAt: -1 })
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .lean();
    return templates.map((template) => toTemplateResponse(template));
};

export const createTemplate = async ({ entityType, file, actorUserId, version, notes, changelog, status = 'inactive' }) => {
    const normalizedEntityType = validateEntityType(entityType);
    validateTemplateUploadFile(file);
    await ensureDirectory();

    const storedFilename = resolveStoredFilename({
        entityType: normalizedEntityType,
        originalname: file.originalname
    });
    const filePath = path.join(TEMPLATES_DIR, storedFilename);
    await fs.writeFile(filePath, file.buffer);

    const template = await ImportTemplate.create({
        entityType: normalizedEntityType,
        filePath,
        fileUrl: null,
        filename: sanitizeCsvFilename(file.originalname, normalizedEntityType),
        mimeType: String(file.mimetype || 'text/csv'),
        status: status === 'active' ? 'active' : 'inactive',
        version: String(version || 'v1').trim() || 'v1',
        notes: String(notes || '').trim(),
        changelog: String(changelog || '').trim(),
        createdBy: actorUserId,
        updatedBy: actorUserId
    });

    if (template.status === 'active') {
        await ImportTemplate.updateMany(
            { _id: { $ne: template._id }, entityType: normalizedEntityType, status: 'active' },
            { $set: { status: 'inactive', updatedBy: actorUserId } }
        );
    }

    return toTemplateResponse(template.toObject());
};

export const updateTemplate = async ({ templateId, actorUserId, file, version, notes, changelog, status }) => {
    const template = await ImportTemplate.findById(templateId);
    if (!template) {
        throw Object.assign(new Error('Import template not found'), { statusCode: 404 });
    }

    if (file) {
        validateTemplateUploadFile(file);
        await ensureDirectory();
        const storedFilename = resolveStoredFilename({
            entityType: template.entityType,
            originalname: file.originalname
        });
        const nextPath = path.join(TEMPLATES_DIR, storedFilename);
        await fs.writeFile(nextPath, file.buffer);
        await removeFileSafe(template.filePath);
        template.filePath = nextPath;
        template.filename = sanitizeCsvFilename(file.originalname, template.entityType);
        template.mimeType = String(file.mimetype || 'text/csv');
    }

    if (version !== undefined) template.version = String(version || '').trim() || template.version;
    if (notes !== undefined) template.notes = String(notes || '').trim();
    if (changelog !== undefined) template.changelog = String(changelog || '').trim();
    if (status !== undefined) template.status = status === 'active' ? 'active' : 'inactive';

    template.updatedBy = actorUserId;
    await template.save();

    if (template.status === 'active') {
        await ImportTemplate.updateMany(
            { _id: { $ne: template._id }, entityType: template.entityType, status: 'active' },
            { $set: { status: 'inactive', updatedBy: actorUserId } }
        );
    }

    return toTemplateResponse(template.toObject());
};

export const deleteTemplate = async ({ templateId }) => {
    const template = await ImportTemplate.findById(templateId);
    if (!template) {
        throw Object.assign(new Error('Import template not found'), { statusCode: 404 });
    }

    const asPlain = template.toObject();
    await removeFileSafe(template.filePath);
    await template.deleteOne();
    return toTemplateResponse(asPlain);
};

export const setTemplateStatus = async ({ templateId, status, actorUserId }) => {
    const template = await ImportTemplate.findById(templateId);
    if (!template) {
        throw Object.assign(new Error('Import template not found'), { statusCode: 404 });
    }

    const normalizedStatus = status === 'active' ? 'active' : 'inactive';
    template.status = normalizedStatus;
    template.updatedBy = actorUserId;
    await template.save();

    if (normalizedStatus === 'active') {
        await ImportTemplate.updateMany(
            { _id: { $ne: template._id }, entityType: template.entityType, status: 'active' },
            { $set: { status: 'inactive', updatedBy: actorUserId } }
        );
    }

    return toTemplateResponse(template.toObject());
};

export const getTemplateByIdForDownload = async (templateId) => {
    const template = await ImportTemplate.findById(templateId).lean();
    if (!template) {
        throw Object.assign(new Error('Import template not found'), { statusCode: 404 });
    }
    return {
        ...toTemplateResponse(template, { includeFilePath: true }),
        filePath: template.filePath
    };
};

export const getActiveTemplateForEntity = async (entityType) => {
    const normalizedEntityType = validateEntityType(entityType);
    const template = await ImportTemplate.findOne({ entityType: normalizedEntityType, status: 'active' })
        .sort({ updatedAt: -1 })
        .lean();
    if (!template) return null;
    return {
        ...toTemplateResponse(template, { includeFilePath: true }),
        filePath: template.filePath
    };
};

export const getTemplateDownloadForEntity = async (entityType) => {
    const normalizedEntityType = validateEntityType(entityType);
    const activeTemplate = await getActiveTemplateForEntity(normalizedEntityType);
    if (activeTemplate) {
        return {
            source: 'custom',
            entityType: normalizedEntityType,
            template: activeTemplate,
            csv: null
        };
    }

    const csv = buildFallbackSampleCsv(normalizedEntityType);
    return {
        source: 'fallback',
        entityType: normalizedEntityType,
        template: null,
        csv
    };
};

export const getTemplateMetadataForEntity = async (entityType) => {
    const normalizedEntityType = validateEntityType(entityType);
    const activeTemplate = await getActiveTemplateForEntity(normalizedEntityType);
    const definition = getImportTemplateDefinition(normalizedEntityType);

    return {
        entityType: normalizedEntityType,
        displayName: definition?.displayName || normalizedEntityType,
        hasActiveTemplate: Boolean(activeTemplate),
        activeTemplate: activeTemplate
            ? {
                id: activeTemplate.id,
                filename: activeTemplate.filename,
                mimeType: activeTemplate.mimeType,
                version: activeTemplate.version,
                notes: activeTemplate.notes,
                changelog: activeTemplate.changelog,
                updatedAt: activeTemplate.updatedAt
            }
            : null,
        fallbackAvailable: Boolean(definition)
    };
};

export const buildTemplateMetadataForImportResponse = async (entityType) => {
    const metadata = await getTemplateMetadataForEntity(entityType);
    return {
        ...metadata,
        downloadUrl: `/api/import/templates/${metadata.entityType}/download`
    };
};
