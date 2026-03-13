import { asyncHandler } from '../middleware/errorHandler.js';
import { pacingOverrideService } from '../services/curriculum/pacingOverrideService.js';

export const createPacingOverrideController = ({ overrideService = pacingOverrideService } = {}) => ({
    createPacingOverrideController: asyncHandler(async (req, res) => {
        const data = await overrideService.createOverrideRequest({ req });
        return res.status(201).json({ success: true, data });
    }),

    listPacingOverridesController: asyncHandler(async (req, res) => {
        const data = await overrideService.listOverrideRequests({ req });
        return res.status(200).json({ success: true, data });
    }),

    approvePacingOverrideController: asyncHandler(async (req, res) => {
        const data = await overrideService.approveOverrideRequest({ req });
        return res.status(200).json({ success: true, data });
    }),

    rejectPacingOverrideController: asyncHandler(async (req, res) => {
        const data = await overrideService.rejectOverrideRequest({ req });
        return res.status(200).json({ success: true, data });
    })
});

const pacingOverrideController = createPacingOverrideController();

export const {
    createPacingOverrideController: createPacingOverride,
    listPacingOverridesController: listPacingOverrides,
    approvePacingOverrideController: approvePacingOverride,
    rejectPacingOverrideController: rejectPacingOverride
} = pacingOverrideController;
