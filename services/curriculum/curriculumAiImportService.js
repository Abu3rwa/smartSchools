import path from 'path';
import { AITokenUsage } from '../../models/AITokenUsage.js';
import { downloadFile, uploadPrivateFile } from '../firebaseStorageService.js';
import aiService from '../aiservice.js';
import googleDriveOAuthService from '../googleDriveOAuthService.js';
import logger from '../../utils/logger.js';
import {
    buildLegacyUnitsFromSections,
    normalizeSections,
    resolveTemplateForRequest
} from './curriculumMapServiceHelpers.js';
import { assertCondition, createHttpError } from './curriculumErrors.js';
import { normalizeCurriculumSettings } from './curriculumTemplateDefaults.js';
import { buildAuditEntry } from './curriculumUtils.js';

const EDITABLE_STATUSES = new Set(['draft', 'revision_requested', 'rejected']);
const PROMPT_VERSION = 'curriculum_map_import_v1';
const MAX_EXTRACTED_TEXT_LENGTH = 300000;
const DEFAULT_ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
];
const EXTENSION_TO_MIME = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain'
};

const toComparableTime = (value) => new Date(value).getTime();

const safeTrim = (value = '') => String(value || '').trim();

const normalizeMimeType = (value = '') => safeTrim(value).toLowerCase();

const resolveMimeType = ({ file, allowedMimeTypes }) => {
    const mimeType = normalizeMimeType(file?.mimetype);
    if (allowedMimeTypes.has(mimeType)) {
        return mimeType;
    }

    const extension = safeTrim(path.extname(file?.originalname || '')).toLowerCase();
    const mappedMimeType = EXTENSION_TO_MIME[extension] || '';
    if (mappedMimeType && allowedMimeTypes.has(mappedMimeType)) {
        return mappedMimeType;
    }

    return mimeType;
};

const toStringList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => safeTrim(item)).filter(Boolean);
    }
    const text = safeTrim(value);
    if (!text) return [];
    return text
        .split(/[\n;|,]/g)
        .map((item) => safeTrim(item))
        .filter(Boolean);
};

const parsePdfText = async (buffer) => {
    const module = await import('pdf-parse');
    const parseFn = module?.default || module;
    const result = await parseFn(buffer);
    return safeTrim(result?.text || '');
};

const parseDocxText = async (buffer) => {
    const module = await import('mammoth');
    const result = await module.extractRawText({ buffer });
    return safeTrim(result?.value || '');
};

const parseSourceBufferToText = async ({ buffer, mimeType }) => {
    const normalizedMime = safeTrim(mimeType).toLowerCase();
    if (normalizedMime === 'text/plain') {
        return safeTrim(Buffer.from(buffer || '').toString('utf8'));
    }
    if (normalizedMime === 'application/pdf') {
        return parsePdfText(buffer);
    }
    if (normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return parseDocxText(buffer);
    }
    throw createHttpError(400, `Unsupported source mime type: ${normalizedMime}`);
};

const buildGoogleDocSnapshotPath = ({ schoolId, mapId, userId, docId }) => (
    `schools/${schoolId}/curriculum-import/${mapId}/${userId}/${Date.now()}-${docId}.txt`
);

const buildUploadedSourcePath = ({ schoolId, mapId, userId, originalName }) => {
    const ext = path.extname(String(originalName || '')).toLowerCase();
    const safeBaseName = String(path.basename(originalName || 'source', ext))
        .replace(/[^\w.\-() ]+/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 80) || 'source';
    const normalizedExt = ext || '.bin';
    return `schools/${schoolId}/curriculum-import/${mapId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBaseName}${normalizedExt}`;
};

const assertAiImportSettings = ({ settings, mode }) => {
    const aiSettings = settings?.ai || {};
    assertCondition(aiSettings.enabled !== false, 403, 'Curriculum AI import is disabled for this school');
    if (mode === 'file') {
        assertCondition(aiSettings.allowFileImport !== false, 403, 'File import is disabled for this school');
    }
    if (mode === 'google_doc') {
        assertCondition(aiSettings.allowGoogleDocsImport !== false, 403, 'Google Docs import is disabled for this school');
    }
};

const assertMapIsEditable = (map) => {
    assertCondition(Boolean(map), 404, 'Curriculum map not found');
    assertCondition(EDITABLE_STATUSES.has(map.status), 409, 'Map must be draft or revision-needed to apply AI import');
};

const assertExpectedMapVersion = ({ expectedUpdatedAt, map }) => {
    if (!expectedUpdatedAt) return;
    const expected = toComparableTime(expectedUpdatedAt);
    const actual = toComparableTime(map.updatedAt);
    assertCondition(expected === actual, 409, 'Map has changed since last fetch', { code: 'VERSION_CONFLICT' });
};

const toSuggestionId = (prefix, index) => `${prefix}_${index + 1}`;

const normalizeSuggestedItems = (items = []) => items.map((rawItem, index) => ({
    suggestionId: safeTrim(rawItem?.suggestionId) || toSuggestionId('item', index),
    title: safeTrim(rawItem?.title) || `Instructional Block ${index + 1}`,
    type: safeTrim(rawItem?.type) || 'instructional_block',
    startWeek: Number.isFinite(Number(rawItem?.startWeek)) ? Number(rawItem.startWeek) : null,
    endWeek: Number.isFinite(Number(rawItem?.endWeek)) ? Number(rawItem.endWeek) : null,
    dateRange: {
        startDate: rawItem?.dateRange?.startDate || null,
        endDate: rawItem?.dateRange?.endDate || null
    },
    standards: (Array.isArray(rawItem?.standards) ? rawItem.standards : []).map((standard) => ({
        standardId: standard?.standardId || null,
        sourceType: standard?.sourceType || 'custom_entry',
        code: safeTrim(standard?.code),
        title: safeTrim(standard?.title),
        description: safeTrim(standard?.description),
        framework: safeTrim(standard?.framework)
    })),
    skills: toStringList(rawItem?.skills),
    learningObjectives: toStringList(rawItem?.learningObjectives || rawItem?.objectives),
    essentialQuestions: toStringList(rawItem?.essentialQuestions),
    activitiesResources: toStringList(rawItem?.activitiesResources || rawItem?.activities),
    performanceTasks: toStringList(rawItem?.performanceTasks || rawItem?.assessments),
    assessment: safeTrim(rawItem?.assessment),
    notes: safeTrim(rawItem?.notes)
}));

const normalizeSuggestedSections = (parsed = {}) => {
    const rawSections = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.sections) ? parsed.sections : []);
    const normalized = rawSections.map((section, index) => ({
        suggestionId: safeTrim(section?.suggestionId) || toSuggestionId('section', index),
        title: safeTrim(section?.title) || `Section ${index + 1}`,
        sectionType: safeTrim(section?.sectionType) || 'period',
        dateRange: {
            startDate: section?.dateRange?.startDate || null,
            endDate: section?.dateRange?.endDate || null
        },
        items: normalizeSuggestedItems(Array.isArray(section?.items) ? section.items : [])
    }));
    return normalized.filter((section) => section.items.length > 0 || safeTrim(section.title));
};

const toMapSectionPayload = (suggestedSection = {}, orderIndex = 0) => ({
    title: safeTrim(suggestedSection.title) || `Section ${orderIndex + 1}`,
    orderIndex,
    sectionType: safeTrim(suggestedSection.sectionType) || 'period',
    dateRange: {
        startDate: suggestedSection?.dateRange?.startDate || null,
        endDate: suggestedSection?.dateRange?.endDate || null
    },
    items: (suggestedSection.items || []).map((item, itemIndex) => ({
        title: safeTrim(item.title) || `Instructional Block ${itemIndex + 1}`,
        type: safeTrim(item.type) || 'instructional_block',
        orderIndex: itemIndex,
        dateRange: {
            startDate: item?.dateRange?.startDate || null,
            endDate: item?.dateRange?.endDate || null
        },
        startWeek: Number.isFinite(Number(item?.startWeek)) ? Number(item.startWeek) : null,
        endWeek: Number.isFinite(Number(item?.endWeek)) ? Number(item.endWeek) : null,
        standards: Array.isArray(item?.standards) ? item.standards : [],
        skills: toStringList(item?.skills),
        learningObjectives: toStringList(item?.learningObjectives),
        essentialQuestions: toStringList(item?.essentialQuestions),
        activitiesResources: toStringList(item?.activitiesResources),
        performanceTasks: toStringList(item?.performanceTasks),
        assessment: safeTrim(item?.assessment),
        notes: safeTrim(item?.notes),
        customFieldValues: []
    }))
});

const buildPrompt = ({ map, template, settings, extractedText }) => {
    const templateFields = (template?.fields || [])
        .filter((field) => field.enabled !== false)
        .map((field) => `${field.key} (${field.label || field.key})`)
        .join(', ');

    const sectionLabel = template?.structure?.sectionLabel || settings?.terminology?.section || 'Unit';
    const itemLabel = template?.structure?.itemLabel || settings?.terminology?.item || 'Week';
    const standardsLabel = template?.labels?.standards || settings?.terminology?.standards || 'Standards';
    const performanceLabel = template?.labels?.performanceTask || settings?.terminology?.performanceTask || 'Performance Task';

    return `You are a curriculum mapping assistant.
Return ONLY one valid JSON object and no markdown.

Context:
- Curriculum map title: ${map.title}
- Academic year: ${map.academicYear}
- Grade: ${map.grade}
- Granularity: ${map?.structure?.granularity || 'unit_week'}
- Section label: ${sectionLabel}
- Item label: ${itemLabel}
- Standards label: ${standardsLabel}
- Performance task label: ${performanceLabel}
- Enabled fields: ${templateFields || 'learningObjectives, standards, skills, performanceTasks'}

Source text:
"""${extractedText}"""

Required JSON output schema:
{
  "sections": [
    {
      "title": "string",
      "sectionType": "period",
      "dateRange": { "startDate": null, "endDate": null },
      "items": [
        {
          "title": "string",
          "type": "instructional_block",
          "startWeek": null,
          "endWeek": null,
          "standards": [{ "code": "string", "title": "string", "description": "string", "sourceType": "custom_entry" }],
          "skills": ["string"],
          "learningObjectives": ["string"],
          "essentialQuestions": ["string"],
          "activitiesResources": ["string"],
          "performanceTasks": ["string"],
          "assessment": "string",
          "notes": "string"
        }
      ]
    }
  ]
}

Rules:
- Build practical sections/items from the source text.
- Keep field values concise and school-ready.
- If week numbers are unknown, set startWeek/endWeek to null.
- Do not include keys outside schema.`;
};

const buildResultSummary = (sections = []) => ({
    sectionCount: sections.length,
    itemCount: sections.reduce((count, section) => count + (section.items?.length || 0), 0)
});

const toEntityId = (value) => value?._id || value;

const trackAiUsage = async ({ job, tokenUsage, modelName, feature, metadata = {} }) => {
    const input = Number(tokenUsage?.input || 0);
    const output = Number(tokenUsage?.output || 0);
    const total = Number(tokenUsage?.total || 0);
    if (total <= 0) return null;

    return AITokenUsage.create({
        model: modelName || 'gemini-2.5-flash-lite',
        feature,
        school: job.school,
        user: toEntityId(job.requestedBy),
        entityType: 'CurriculumImportJob',
        entityId: job._id,
        promptVersion: PROMPT_VERSION,
        metadata: {
            mapId: String(job.mapId),
            sourceDocumentId: String(job.sourceDocumentId),
            ...metadata
        },
        inputTokens: input,
        outputTokens: output,
        totalTokens: total,
        schoolId: String(job.school)
    });
};

const buildRefinePrompt = (sections = []) => `Refine the following curriculum sections JSON.
Return ONLY one JSON object with key "sections".
Keep same information, improve clarity, remove duplicates, and normalize list fields.
Do not invent content not implied by input.

Input JSON:
${JSON.stringify({ sections })}

Output schema:
{
  "sections": [
    {
      "title": "string",
      "sectionType": "period",
      "dateRange": { "startDate": null, "endDate": null },
      "items": [
        {
          "title": "string",
          "type": "instructional_block",
          "startWeek": null,
          "endWeek": null,
          "standards": [{ "code": "string", "title": "string", "description": "string", "sourceType": "custom_entry" }],
          "skills": ["string"],
          "learningObjectives": ["string"],
          "essentialQuestions": ["string"],
          "activitiesResources": ["string"],
          "performanceTasks": ["string"],
          "assessment": "string",
          "notes": "string"
        }
      ]
    }
  ]
}`;

export const createCurriculumAiImportService = ({
    repository,
    notificationService
}) => {
    void notificationService;

    return {
        async createUploadSourceAndJob({ req, map, settings, file }) {
            assertMapIsEditable(map);
            assertAiImportSettings({ settings, mode: 'file' });
            assertCondition(file, 400, 'Source file is required');

            const aiSettings = settings.ai || {};
            const maxFileSizeBytes = Number(aiSettings.maxFileSizeMb || 10) * 1024 * 1024;
            const configuredAllowedMimeTypes = Array.isArray(aiSettings.allowedMimeTypes)
                ? aiSettings.allowedMimeTypes
                : [];
            const normalizedConfiguredMimeTypes = configuredAllowedMimeTypes
                .map((item) => normalizeMimeType(item))
                .filter(Boolean);
            const fallbackAllowedMimeTypes = normalizedConfiguredMimeTypes.length > 0
                ? normalizedConfiguredMimeTypes
                : DEFAULT_ALLOWED_MIME_TYPES;
            const allowedMimeTypes = new Set(fallbackAllowedMimeTypes);
            const mimeType = resolveMimeType({ file, allowedMimeTypes });
            assertCondition(allowedMimeTypes.has(mimeType), 400, 'File type is not allowed by school curriculum AI settings');
            assertCondition(Number(file.size || 0) <= maxFileSizeBytes, 400, `File is too large. Maximum is ${aiSettings.maxFileSizeMb || 10} MB`);

            const storagePath = buildUploadedSourcePath({
                schoolId: req.schoolId,
                mapId: map._id,
                userId: req.user._id,
                originalName: file.originalname
            });
            const uploadResult = await uploadPrivateFile(file.buffer, mimeType, storagePath);

            const sourceDocument = await repository.createCurriculumSourceDocument({
                school: req.schoolId,
                mapId: map._id,
                uploadedBy: req.user._id,
                sourceType: 'upload',
                originalName: file.originalname,
                mimeType,
                size: Number(file.size || 0),
                fileRef: uploadResult.fileRef,
                storagePath: uploadResult.storagePath,
                parseStatus: 'pending',
                metadata: {}
            });

            const job = await repository.createCurriculumImportJob({
                school: req.schoolId,
                mapId: map._id,
                sourceDocumentId: sourceDocument._id,
                requestedBy: req.user._id,
                status: 'queued',
                stage: 'queued'
            });

            return {
                sourceDocument,
                job
            };
        },

        async createGoogleDocSourceAndJob({ req, map, settings, payload }) {
            assertMapIsEditable(map);
            assertAiImportSettings({ settings, mode: 'google_doc' });
            const rawDocReference = payload?.docId || payload?.docUrl;
            const docId = googleDriveOAuthService.parseGoogleDocId(rawDocReference);
            assertCondition(Boolean(docId), 400, 'Invalid Google Doc id or URL');
            assertCondition(await googleDriveOAuthService.hasValidTokens(req.user._id.toString()), 403, 'Google Drive is not connected');

            const sourceDocument = await repository.createCurriculumSourceDocument({
                school: req.schoolId,
                mapId: map._id,
                uploadedBy: req.user._id,
                sourceType: 'google_doc',
                originalName: 'Google Doc',
                mimeType: 'text/plain',
                size: 0,
                parseStatus: 'pending',
                metadata: {
                    docId,
                    docUrl: payload?.docUrl || ''
                }
            });

            const job = await repository.createCurriculumImportJob({
                school: req.schoolId,
                mapId: map._id,
                sourceDocumentId: sourceDocument._id,
                requestedBy: req.user._id,
                status: 'queued',
                stage: 'queued'
            });

            return {
                sourceDocument,
                job
            };
        },

        async listSourcesAndJobs({ schoolId, mapId }) {
            const [sources, jobs] = await Promise.all([
                repository.listCurriculumSourceDocumentsByMap({ schoolId, mapId }),
                repository.listCurriculumImportJobsByMap({ schoolId, mapId })
            ]);
            return {
                sources,
                jobs
            };
        },

        async getJobByScope({ schoolId, mapId, jobId }) {
            const job = await repository.findCurriculumImportJobByScope({ schoolId, mapId, jobId });
            assertCondition(Boolean(job), 404, 'Curriculum import job not found');
            return job;
        },

        async applyJobSuggestions({ req, map, job, body }) {
            assertMapIsEditable(map);
            assertCondition(Boolean(job), 404, 'Curriculum import job not found');
            assertCondition(job.status === 'completed', 409, 'Job must be completed before applying suggestions');
            assertExpectedMapVersion({ expectedUpdatedAt: body?.expectedUpdatedAt, map });

            const applyMode = body?.applyMode || 'all';
            const selectedIds = new Set(Array.isArray(body?.selectedSectionIds) ? body.selectedSectionIds : []);
            const sourceSections = Array.isArray(job.suggestedSections) ? job.suggestedSections : [];
            const sectionsToApply = applyMode === 'selected'
                ? sourceSections.filter((section) => selectedIds.has(section.suggestionId))
                : sourceSections;

            assertCondition(sectionsToApply.length > 0, 400, 'No suggested sections selected for apply');

            const existingSections = normalizeSections(map.sections || []);
            const startOrder = existingSections.length;
            const appendSections = sectionsToApply.map((section, index) => toMapSectionPayload(section, startOrder + index));
            const mergedSections = normalizeSections([...existingSections, ...appendSections]);

            map.sections = mergedSections;
            map.units = buildLegacyUnitsFromSections({ sections: mergedSections });
            map.updatedBy = req.user._id;
            map.status = 'draft';
            if (!map.workflow) map.workflow = {};
            map.workflow.currentState = 'draft';
            if (!Array.isArray(map.auditTrail)) map.auditTrail = [];
            map.auditTrail.push(buildAuditEntry({
                action: 'ai_import_applied',
                actor: req.user._id,
                message: `Applied AI import sections (${applyMode})`,
                meta: {
                    jobId: String(job._id),
                    sourceDocumentId: String(job.sourceDocumentId?._id || job.sourceDocumentId),
                    applyMode,
                    appliedSectionCount: appendSections.length
                }
            }));

            job.appliedAt = new Date();
            job.appliedBy = req.user._id;
            job.metadata = {
                ...(job.metadata || {}),
                lastApplyMode: applyMode,
                lastAppliedSectionCount: appendSections.length
            };

            await Promise.all([
                repository.saveCurriculumMap(map),
                repository.saveCurriculumImportJob(job)
            ]);
        },

        async processClaimedJob(job) {
            if (!job?._id) return null;

            let loadedJob = null;
            let sourceDocument = null;

            try {
                loadedJob = await repository.findCurriculumImportJobById(job._id);
                if (!loadedJob) return null;

                sourceDocument = loadedJob.sourceDocumentId;
                assertCondition(Boolean(sourceDocument), 404, 'Source document not found for import job');

                sourceDocument.parseStatus = 'processing';
                await repository.saveCurriculumSourceDocument(sourceDocument);

                loadedJob.stage = 'parse_source';
                await repository.saveCurriculumImportJob(loadedJob);

                let extractedText = '';

                if (sourceDocument.sourceType === 'upload') {
                    const filePayload = await downloadFile(sourceDocument.storagePath || sourceDocument.fileRef);
                    extractedText = await parseSourceBufferToText({
                        buffer: filePayload.buffer,
                        mimeType: sourceDocument.mimeType || filePayload.contentType
                    });
                } else if (sourceDocument.sourceType === 'google_doc') {
                    const exportResult = await googleDriveOAuthService.exportGoogleDocAsText({
                        userId: String(toEntityId(loadedJob.requestedBy)),
                        docId: sourceDocument?.metadata?.docId || ''
                    });
                    extractedText = safeTrim(exportResult.text || '');

                    const snapshotBuffer = Buffer.from(extractedText, 'utf8');
                    const snapshotPath = buildGoogleDocSnapshotPath({
                        schoolId: loadedJob.school,
                        mapId: loadedJob.mapId,
                        userId: toEntityId(loadedJob.requestedBy),
                        docId: exportResult.docId
                    });
                    const uploaded = await uploadPrivateFile(snapshotBuffer, 'text/plain', snapshotPath);
                    sourceDocument.fileRef = uploaded.fileRef;
                    sourceDocument.storagePath = uploaded.storagePath;
                    sourceDocument.originalName = `${exportResult.title || 'Google Doc'}.txt`;
                    sourceDocument.size = snapshotBuffer.length;
                    sourceDocument.mimeType = 'text/plain';
                    sourceDocument.metadata = {
                        ...(sourceDocument.metadata || {}),
                        docId: exportResult.docId,
                        docTitle: exportResult.title || ''
                    };
                } else {
                    throw createHttpError(400, 'Unsupported source document type');
                }

                assertCondition(Boolean(extractedText), 422, 'No readable text found in source document');
                const trimmedText = extractedText.length > MAX_EXTRACTED_TEXT_LENGTH
                    ? extractedText.slice(0, MAX_EXTRACTED_TEXT_LENGTH)
                    : extractedText;

                sourceDocument.extractedText = trimmedText;
                sourceDocument.parseStatus = 'parsed';
                sourceDocument.parseError = '';
                await repository.saveCurriculumSourceDocument(sourceDocument);

                loadedJob.stage = 'ai_extract';
                await repository.saveCurriculumImportJob(loadedJob);

                const map = await repository.findCurriculumMapById(loadedJob.mapId);
                assertCondition(Boolean(map), 404, 'Curriculum map not found');
                const school = await repository.findSchoolById(loadedJob.school);
                const settings = normalizeCurriculumSettings(school?.settings?.curriculum || {});
                const resolvedTemplate = resolveTemplateForRequest({
                    settings,
                    requestedTemplateKey: map.templateKey
                });

                const prompt = buildPrompt({
                    map,
                    template: resolvedTemplate.template,
                    settings: resolvedTemplate.settings,
                    extractedText: trimmedText
                });

                const aiResult = await aiService.generateStructuredJson({
                    prompt,
                    maxRetries: 1
                });

                let suggestedSections = normalizeSuggestedSections(aiResult.parsed);
                assertCondition(suggestedSections.length > 0, 422, 'AI could not derive curriculum sections from the provided source');

                const extractUsage = await trackAiUsage({
                    job: loadedJob,
                    tokenUsage: aiResult.tokenUsage,
                    modelName: aiResult.modelName,
                    feature: 'curriculum_map_import_extract'
                });

                let refineUsage = null;
                try {
                    const refineResult = await aiService.generateStructuredJson({
                        prompt: buildRefinePrompt(suggestedSections),
                        maxRetries: 0
                    });
                    const refinedSections = normalizeSuggestedSections(refineResult.parsed);
                    if (refinedSections.length > 0) {
                        suggestedSections = refinedSections;
                    }
                    refineUsage = await trackAiUsage({
                        job: loadedJob,
                        tokenUsage: refineResult.tokenUsage,
                        modelName: refineResult.modelName,
                        feature: 'curriculum_map_import_refine'
                    });
                } catch (refineError) {
                    logger.warn(`Curriculum AI import refine pass failed for job ${loadedJob._id}: ${refineError.message}`);
                }

                loadedJob.status = 'completed';
                loadedJob.stage = 'completed';
                loadedJob.error = '';
                loadedJob.completedAt = new Date();
                loadedJob.promptVersion = PROMPT_VERSION;
                loadedJob.tokenUsageRef = extractUsage?._id || null;
                loadedJob.suggestedSections = suggestedSections;
                loadedJob.resultSummary = buildResultSummary(suggestedSections);
                loadedJob.metadata = {
                    ...(loadedJob.metadata || {}),
                    extractTokenUsageRef: extractUsage?._id || null,
                    refineTokenUsageRef: refineUsage?._id || null
                };
                await repository.saveCurriculumImportJob(loadedJob);
                return loadedJob;
            } catch (error) {
                logger.error('Curriculum AI import job failed:', error);
                if (sourceDocument) {
                    sourceDocument.parseStatus = 'failed';
                    sourceDocument.parseError = safeTrim(error?.message || 'Source parse failed');
                    await repository.saveCurriculumSourceDocument(sourceDocument);
                }
                if (loadedJob) {
                    loadedJob.status = 'failed';
                    loadedJob.stage = 'failed';
                    loadedJob.error = safeTrim(error?.message || 'Import failed');
                    loadedJob.completedAt = new Date();
                    await repository.saveCurriculumImportJob(loadedJob);
                }
                return null;
            }
        },

        async runImportJobCycle() {
            const claimedJob = await repository.claimNextQueuedCurriculumImportJob();
            if (!claimedJob) return null;
            await this.processClaimedJob(claimedJob);
            return claimedJob;
        }
    };
};
