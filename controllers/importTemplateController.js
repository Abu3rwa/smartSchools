import fs from 'fs/promises';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import {
    listSupportedTemplateEntities,
    listTemplatesForAdmin,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    setTemplateStatus,
    getTemplateByIdForDownload,
    getTemplateMetadataForEntity,
    getTemplateDownloadForEntity,
    validateEntityType
} from '../services/import/importTemplateService.js';

const safeActor = (req) => ({
    actorUserId: req.user?._id,
    actorEmail: req.user?.email,
    role: req.user?.role
});

export const listImportTemplateEntities = asyncHandler(async (req, res) => {
    void req;
    const entities = await listSupportedTemplateEntities();
    res.json({
        success: true,
        data: { entities }
    });
});

export const listImportTemplatesAdmin = asyncHandler(async (req, res) => {
    void req;
    const templates = await listTemplatesForAdmin();
    res.json({
        success: true,
        data: { templates }
    });
});

export const createImportTemplateAdmin = asyncHandler(async (req, res) => {
    const entityType = validateEntityType(req.body.entityType || req.params.entityType);
    const template = await createTemplate({
        entityType,
        file: req.file,
        actorUserId: req.user?._id,
        version: req.body.version,
        notes: req.body.notes,
        changelog: req.body.changelog,
        status: req.body.status
    });

    logger.info('import_template_created', {
        ...safeActor(req),
        templateId: template.id,
        entityType: template.entityType,
        version: template.version,
        status: template.status
    });

    res.status(201).json({
        success: true,
        message: 'Import template created successfully',
        data: { template }
    });
});

export const updateImportTemplateAdmin = asyncHandler(async (req, res) => {
    const template = await updateTemplate({
        templateId: req.params.id,
        actorUserId: req.user?._id,
        file: req.file,
        version: req.body.version,
        notes: req.body.notes,
        changelog: req.body.changelog,
        status: req.body.status
    });

    logger.info('import_template_updated', {
        ...safeActor(req),
        templateId: template.id,
        entityType: template.entityType,
        version: template.version,
        status: template.status
    });

    res.json({
        success: true,
        message: 'Import template updated successfully',
        data: { template }
    });
});

export const setImportTemplateStatusAdmin = asyncHandler(async (req, res) => {
    const nextStatus = String(req.body.status || '').toLowerCase();
    if (!['active', 'inactive'].includes(nextStatus)) {
        return res.status(400).json({
            success: false,
            message: 'status must be one of: active, inactive'
        });
    }

    const template = await setTemplateStatus({
        templateId: req.params.id,
        status: nextStatus,
        actorUserId: req.user?._id
    });

    logger.info('import_template_status_changed', {
        ...safeActor(req),
        templateId: template.id,
        entityType: template.entityType,
        status: template.status
    });

    res.json({
        success: true,
        message: `Import template ${nextStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
        data: { template }
    });
});

export const deleteImportTemplateAdmin = asyncHandler(async (req, res) => {
    const template = await deleteTemplate({ templateId: req.params.id });

    logger.info('import_template_deleted', {
        ...safeActor(req),
        templateId: template.id,
        entityType: template.entityType,
        version: template.version
    });

    res.json({
        success: true,
        message: 'Import template deleted successfully',
        data: { template }
    });
});

export const downloadImportTemplateAdmin = asyncHandler(async (req, res) => {
    const template = await getTemplateByIdForDownload(req.params.id);
    const fileBuffer = await fs.readFile(template.filePath);

    res.setHeader('Content-Type', `${template.mimeType || 'text/csv'}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
    res.status(200).send(fileBuffer);
});

export const getEntityTemplateMetadata = asyncHandler(async (req, res) => {
    const metadata = await getTemplateMetadataForEntity(req.params.entityType);
    res.json({
        success: true,
        data: {
            template: {
                ...metadata,
                downloadUrl: `/api/import/templates/${metadata.entityType}/download`
            }
        }
    });
});

export const downloadEntityTemplate = asyncHandler(async (req, res) => {
    const result = await getTemplateDownloadForEntity(req.params.entityType);

    if (result.source === 'custom' && result.template?.filePath) {
        const fileBuffer = await fs.readFile(result.template.filePath);
        res.setHeader('Content-Type', `${result.template.mimeType || 'text/csv'}; charset=utf-8`);
        res.setHeader('Content-Disposition', `attachment; filename="${result.template.filename}"`);
        return res.status(200).send(fileBuffer);
    }

    const fallbackName = `${result.entityType}-sample-fallback.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fallbackName}"`);
    return res.status(200).send(result.csv || '');
});
