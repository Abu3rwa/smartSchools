import AttendanceRequestType from '../models/AttendanceRequestType.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * @desc    List active request types (for form dropdown)
 * @route   GET /api/attendance-request-types
 * @access  Private (any authenticated user in school)
 */
export const getRequestTypes = asyncHandler(async (req, res) => {
    const types = await AttendanceRequestType.find({ isActive: true })
        .sort({ order: 1, labelEn: 1 });
    res.status(200).json({
        success: true,
        data: types
    });
});

/**
 * @desc    List all request types including inactive (admin management)
 * @route   GET /api/attendance-request-types/all
 * @access  Private (Admin)
 */
export const getAllRequestTypes = asyncHandler(async (req, res) => {
    const types = await AttendanceRequestType.find()
        .sort({ order: 1, labelEn: 1 });
    res.status(200).json({
        success: true,
        data: types
    });
});

/**
 * @desc    Get single request type
 * @route   GET /api/attendance-request-types/:id
 * @access  Private (Admin)
 */
export const getRequestType = asyncHandler(async (req, res) => {
    const type = await AttendanceRequestType.findById(req.params.id);
    if (!type) {
        return res.status(404).json({
            success: false,
            message: 'Request type not found'
        });
    }
    res.status(200).json({
        success: true,
        data: type
    });
});

/**
 * @desc    Create request type
 * @route   POST /api/attendance-request-types
 * @access  Private (Admin)
 */
export const createRequestType = asyncHandler(async (req, res) => {
    const { labelEn, labelAr, code, order, isActive, requiresProof, useDateRange } = req.body;
    const type = await AttendanceRequestType.create({
        school: req.schoolId,
        labelEn: labelEn || '',
        labelAr: labelAr || '',
        code: code || undefined,
        order: order != null ? Number(order) : 0,
        isActive: isActive !== false,
        requiresProof: requiresProof === true,
        useDateRange: useDateRange === true
    });
    res.status(201).json({
        success: true,
        message: 'Request type created',
        data: type
    });
});

/**
 * @desc    Update request type
 * @route   PUT /api/attendance-request-types/:id
 * @access  Private (Admin)
 */
export const updateRequestType = asyncHandler(async (req, res) => {
    const { labelEn, labelAr, code, order, isActive, requiresProof, useDateRange } = req.body;
    const type = await AttendanceRequestType.findById(req.params.id);
    if (!type) {
        return res.status(404).json({
            success: false,
            message: 'Request type not found'
        });
    }
    if (labelEn !== undefined) type.labelEn = labelEn;
    if (labelAr !== undefined) type.labelAr = labelAr;
    if (code !== undefined) type.code = code;
    if (order !== undefined) type.order = Number(order);
    if (isActive !== undefined) type.isActive = isActive;
    if (requiresProof !== undefined) type.requiresProof = requiresProof;
    if (useDateRange !== undefined) type.useDateRange = useDateRange;
    await type.save();
    res.status(200).json({
        success: true,
        message: 'Request type updated',
        data: type
    });
});

/**
 * @desc    Deactivate request type (soft delete)
 * @route   PATCH /api/attendance-request-types/:id/deactivate
 * @access  Private (Admin)
 */
export const deactivateRequestType = asyncHandler(async (req, res) => {
    const type = await AttendanceRequestType.findById(req.params.id);
    if (!type) {
        return res.status(404).json({
            success: false,
            message: 'Request type not found'
        });
    }
    type.isActive = false;
    await type.save();
    res.status(200).json({
        success: true,
        message: 'Request type deactivated',
        data: type
    });
});
