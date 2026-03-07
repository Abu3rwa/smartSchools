import { asyncHandler } from '../middleware/errorHandler.js';
import ImportRun from '../models/ImportRun.js';
import { normalizeEntityType } from '../services/import/importSchemas.js';
import { buildImportErrorReportCsv } from '../services/import/importErrorReport.js';
import { runImportPipeline } from '../services/import/importPipeline.js';

const buildContext = (req) => ({
    schoolId: req.schoolId,
    school: req.school,
    userId: req.user?._id,
    academicYear: req.academicYear
});

const toUnifiedResponse = (result) => ({
    success: result.success,
    message: result.message,
    summary: result.summary,
    errors: result.errors,
    warnings: result.warnings,
    sample: result.sample,
    importRunId: result.importRunId,
    errorReportUrl: result.errorReportUrl,
    strictMode: result.strictMode,
    duplicatePolicy: result.duplicatePolicy,
    idempotent: result.idempotent
});

export const previewImport = asyncHandler(async (req, res) => {
    const result = await runImportPipeline({
        entityType: req.params.entityType,
        mode: 'preview',
        payload: req.body,
        context: buildContext(req)
    });

    res.status(result.statusCode).json(toUnifiedResponse(result));
});

export const commitImport = asyncHandler(async (req, res) => {
    const result = await runImportPipeline({
        entityType: req.params.entityType,
        mode: 'commit',
        payload: req.body,
        context: buildContext(req)
    });

    res.status(result.statusCode).json(toUnifiedResponse(result));
});

export const listImportRuns = asyncHandler(async (req, res) => {
    const rawEntityType = typeof req.query.entityType === 'string' ? req.query.entityType : '';
    const entityType = rawEntityType ? normalizeEntityType(rawEntityType) : null;
    if (rawEntityType && !entityType) {
        return res.status(400).json({
            success: false,
            message: `Unsupported entityType "${rawEntityType}"`
        });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const query = {};
    if (entityType) query.entityType = entityType;

    const runs = await ImportRun.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('entityType uploadedBy fileName totalRows validRows importedRows failedRows skippedRows status startedAt completedAt durationMs errorReportUrl metadata.strictMode metadata.duplicatePolicy metadata.createdRows metadata.updatedRows createdAt')
        .populate('uploadedBy', 'firstName lastName email');

    res.json({
        success: true,
        data: { runs }
    });
});

export const downloadImportErrorReport = asyncHandler(async (req, res) => {
    const run = await ImportRun.findById(req.params.id).lean();
    if (!run) {
        return res.status(404).json({
            success: false,
            message: 'Import run not found'
        });
    }

    const errors = Array.isArray(run.errors) ? run.errors : [];
    if (errors.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'No error report available for this import run'
        });
    }

    const rows = Array.isArray(run.metadata?.sourceRows) ? run.metadata.sourceRows : [];
    const fromMetadata = typeof run.metadata?.errorReportCsv === 'string' ? run.metadata.errorReportCsv : null;
    const csv = fromMetadata || buildImportErrorReportCsv({ rows, errors });
    if (!csv) {
        return res.status(404).json({
            success: false,
            message: 'No error report available for this import run'
        });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${run._id}.csv"`);
    res.status(200).send(csv);
});
