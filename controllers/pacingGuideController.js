import { asyncHandler } from '../middleware/errorHandler.js';
import { pacingGuideService } from '../services/curriculum/pacingGuideService.js';

const createJsonHandler = (statusCode, action) => asyncHandler(async (req, res) => (
    res.status(statusCode).json({ success: true, data: await action({ req }) })
));

const fromService = (service, methodName) => (payload) => service[methodName](payload);

const createExportHandler = (action) => asyncHandler(async (req, res) => {
    const file = await action({ req });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    if (file.buffer) return res.status(200).send(file.buffer);
    return res.status(200).send(file.text || '');
});

export const createPacingGuideController = ({ guideService = pacingGuideService } = {}) => ({
    createPacingGuideController: createJsonHandler(201, fromService(guideService, 'createPacingGuide')),
    listPacingGuidesController: createJsonHandler(200, fromService(guideService, 'listPacingGuides')),
    getPacingGuideByIdController: createJsonHandler(200, fromService(guideService, 'getPacingGuideById')),
    updatePacingGuideController: createJsonHandler(200, fromService(guideService, 'updatePacingGuide')),
    submitPacingGuideController: createJsonHandler(200, fromService(guideService, 'submitPacingGuideForReview')),
    reviewPacingGuideController: createJsonHandler(200, fromService(guideService, 'reviewPacingGuide')),
    publishPacingGuideController: createJsonHandler(200, fromService(guideService, 'publishPacingGuide')),
    reconcilePacingGuideController: createJsonHandler(200, fromService(guideService, 'reconcilePacingGuide')),
    exportPacingGuideController: createExportHandler(fromService(guideService, 'exportPacingGuide'))
});

const pacingGuideController = createPacingGuideController();

export const {
    createPacingGuideController: createPacingGuide,
    listPacingGuidesController: listPacingGuides,
    getPacingGuideByIdController: getPacingGuideById,
    updatePacingGuideController: updatePacingGuide,
    submitPacingGuideController: submitPacingGuide,
    reviewPacingGuideController: reviewPacingGuide,
    publishPacingGuideController: publishPacingGuide,
    reconcilePacingGuideController: reconcilePacingGuide,
    exportPacingGuideController: exportPacingGuide
} = pacingGuideController;
