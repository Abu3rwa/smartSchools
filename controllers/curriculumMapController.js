import { asyncHandler } from '../middleware/errorHandler.js';
import { curriculumMapService } from '../services/curriculum/curriculumMapService.js';

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

export const createCurriculumMapController = ({ mapService = curriculumMapService } = {}) => ({
    createCurriculumMapController: createJsonHandler(201, fromService(mapService, 'createCurriculumMap')),
    listCurriculumMapsController: createJsonHandler(200, fromService(mapService, 'listCurriculumMaps')),
    listCurriculumOptionsController: createJsonHandler(200, fromService(mapService, 'listCurriculumOptions')),
    getCurriculumMapByIdController: createJsonHandler(200, fromService(mapService, 'getCurriculumMapById')),
    updateCurriculumMapController: createJsonHandler(200, fromService(mapService, 'updateCurriculumMap')),
    deleteCurriculumMapController: createJsonHandler(200, fromService(mapService, 'deleteCurriculumMap')),
    submitCurriculumMapController: createJsonHandler(200, fromService(mapService, 'submitCurriculumMapForReview')),
    reviewCurriculumMapController: createJsonHandler(200, fromService(mapService, 'reviewCurriculumMap')),
    publishCurriculumMapController: createJsonHandler(200, fromService(mapService, 'publishCurriculumMap')),
    transitionCurriculumMapController: createJsonHandler(200, fromService(mapService, 'transitionCurriculumMap')),
    addCurriculumMapCommentController: createJsonHandler(201, fromService(mapService, 'addCurriculumMapComment')),
    getCurriculumMapHistoryController: createJsonHandler(200, fromService(mapService, 'getCurriculumMapHistory')),
    createCurriculumMapVersionController: createJsonHandler(201, fromService(mapService, 'createMapVersion')),
    cloneCurriculumMapToYearController: createJsonHandler(201, fromService(mapService, 'cloneCurriculumMapToYear')),
    exportCurriculumMapController: createExportHandler(fromService(mapService, 'exportCurriculumMap')),
    uploadCurriculumImportSourceController: createJsonHandler(201, fromService(mapService, 'uploadCurriculumImportSource')),
    importCurriculumSourceFromGoogleDocController: createJsonHandler(201, fromService(mapService, 'importCurriculumSourceFromGoogleDoc')),
    listCurriculumImportSourcesController: createJsonHandler(200, fromService(mapService, 'listCurriculumImportSources')),
    getCurriculumImportJobController: createJsonHandler(200, fromService(mapService, 'getCurriculumImportJob')),
    applyCurriculumImportJobController: createJsonHandler(200, fromService(mapService, 'applyCurriculumImportJob'))
});

const curriculumMapController = createCurriculumMapController();

export const {
    createCurriculumMapController: createCurriculumMap,
    listCurriculumMapsController: listCurriculumMaps,
    listCurriculumOptionsController: listCurriculumOptions,
    getCurriculumMapByIdController: getCurriculumMapById,
    updateCurriculumMapController: updateCurriculumMap,
    deleteCurriculumMapController: deleteCurriculumMap,
    submitCurriculumMapController: submitCurriculumMap,
    reviewCurriculumMapController: reviewCurriculumMap,
    publishCurriculumMapController: publishCurriculumMap,
    transitionCurriculumMapController: transitionCurriculumMap,
    addCurriculumMapCommentController: addCurriculumMapComment,
    getCurriculumMapHistoryController: getCurriculumMapHistory,
    createCurriculumMapVersionController: createCurriculumMapVersion,
    cloneCurriculumMapToYearController: cloneCurriculumMapToYear,
    exportCurriculumMapController: exportCurriculumMap,
    uploadCurriculumImportSourceController: uploadCurriculumImportSource,
    importCurriculumSourceFromGoogleDocController: importCurriculumSourceFromGoogleDoc,
    listCurriculumImportSourcesController: listCurriculumImportSources,
    getCurriculumImportJobController: getCurriculumImportJob,
    applyCurriculumImportJobController: applyCurriculumImportJob
} = curriculumMapController;
