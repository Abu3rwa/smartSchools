import Department from '../models/Department.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * @desc    Get all departments for the school
 * @route   GET /api/departments
 * @access  Private (Admin, Department Principal)
 */
export const getDepartments = asyncHandler(async (req, res) => {
    const { type, isActive } = req.query;
    const query = {};

    if (type) query.type = type;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const departments = await Department.find(query)
        .sort({ type: 1, name: 1 });

    res.json({
        success: true,
        data: { departments }
    });
});

/**
 * @desc    Get single department
 * @route   GET /api/departments/:id
 * @access  Private (Admin, Department Principal if own department)
 */
export const getDepartment = asyncHandler(async (req, res) => {
    const department = await Department.findById(req.params.id);

    if (!department) {
        return res.status(404).json({
            success: false,
            message: 'Department not found'
        });
    }

    res.json({
        success: true,
        data: { department }
    });
});

/**
 * @desc    Create department
 * @route   POST /api/departments
 * @access  Private (Admin only)
 */
export const createDepartment = asyncHandler(async (req, res) => {
    const { name, type, description } = req.body;

    const existing = await Department.findOne({ school: req.schoolId, name: name?.trim() });
    if (existing) {
        return res.status(400).json({
            success: false,
            message: 'A department with this name already exists'
        });
    }

    const department = await Department.create({
        school: req.schoolId,
        name: name?.trim(),
        type: type || 'academic',
        description: description?.trim()
    });

    res.status(201).json({
        success: true,
        message: 'Department created successfully',
        data: { department }
    });
});

/**
 * @desc    Update department
 * @route   PUT /api/departments/:id
 * @access  Private (Admin only)
 */
export const updateDepartment = asyncHandler(async (req, res) => {
    const { name, type, description, isActive } = req.body;

    const department = await Department.findById(req.params.id);
    if (!department) {
        return res.status(404).json({
            success: false,
            message: 'Department not found'
        });
    }

    if (name !== undefined) department.name = name.trim();
    if (type !== undefined) department.type = type;
    if (description !== undefined) department.description = description?.trim();
    if (isActive !== undefined) department.isActive = isActive;

    if (department.isModified('name')) {
        const duplicate = await Department.findOne({
            school: req.schoolId,
            name: department.name,
            _id: { $ne: department._id }
        });
        if (duplicate) {
            return res.status(400).json({
                success: false,
                message: 'A department with this name already exists'
            });
        }
        department.slug = department.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    await department.save();

    res.json({
        success: true,
        message: 'Department updated successfully',
        data: { department }
    });
});

/**
 * @desc    Delete department
 * @route   DELETE /api/departments/:id
 * @access  Private (Admin only)
 */
export const deleteDepartment = asyncHandler(async (req, res) => {
    const department = await Department.findById(req.params.id);
    if (!department) {
        return res.status(404).json({
            success: false,
            message: 'Department not found'
        });
    }

    await department.deleteOne();

    res.json({
        success: true,
        message: 'Department deleted successfully'
    });
});
