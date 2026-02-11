import Standard from '../models/Standard.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * @desc    Get all standards
 * @route   GET /api/standards
 * @access  Private
 */
export const getStandards = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, search, subject, gradeLevel, category, isActive } = req.query;

    const query = {};

    if (search) {
        query.$or = [
            { code: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }

    if (subject) query.subject = subject;
    if (gradeLevel) query.gradeLevel = parseInt(gradeLevel);
    if (category) query.category = { $regex: category, $options: 'i' };
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const standards = await Standard.find(query)
        .populate('subject', 'name code')
        .populate('createdBy', 'firstName lastName')
        .sort({ gradeLevel: 1, code: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Standard.countDocuments(query);

    res.json({
        success: true,
        data: {
            standards,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

/**
 * @desc    Get single standard
 * @route   GET /api/standards/:id
 * @access  Private
 */
export const getStandard = asyncHandler(async (req, res) => {
    const standard = await Standard.findById(req.params.id)
        .populate('subject', 'name code')
        .populate('createdBy', 'firstName lastName');

    if (!standard) {
        return res.status(404).json({
            success: false,
            message: 'Standard not found'
        });
    }

    res.json({
        success: true,
        data: { standard }
    });
});

/**
 * @desc    Create standard
 * @route   POST /api/standards
 * @access  Private (Admin)
 */
export const createStandard = asyncHandler(async (req, res) => {
    const {
        code, name, description, subject, gradeLevel,
        category, masteryThreshold, masteryMinQuestions
    } = req.body;

    // Check for duplicate code in this school
    const existing = await Standard.findOne({ school: req.schoolId, code: code.toUpperCase() });
    if (existing) {
        return res.status(400).json({
            success: false,
            message: 'A standard with this code already exists'
        });
    }

    const standard = await Standard.create({
        school: req.schoolId,
        code: code.toUpperCase(),
        name,
        description,
        subject,
        gradeLevel,
        category: category || '',
        masteryThreshold: masteryThreshold || 80,
        masteryMinQuestions: masteryMinQuestions || 5,
        createdBy: req.user._id
    });

    const populated = await Standard.findById(standard._id)
        .populate('subject', 'name code')
        .populate('createdBy', 'firstName lastName');

    res.status(201).json({
        success: true,
        message: 'Standard created successfully',
        data: { standard: populated }
    });
});

/**
 * @desc    Update standard
 * @route   PUT /api/standards/:id
 * @access  Private (Admin)
 */
export const updateStandard = asyncHandler(async (req, res) => {
    let standard = await Standard.findById(req.params.id);

    if (!standard) {
        return res.status(404).json({
            success: false,
            message: 'Standard not found'
        });
    }

    // If updating code, check for duplicates
    if (req.body.code && req.body.code.toUpperCase() !== standard.code) {
        const existing = await Standard.findOne({
            school: req.schoolId,
            code: req.body.code.toUpperCase(),
            _id: { $ne: req.params.id }
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'A standard with this code already exists'
            });
        }
    }

    const allowedFields = [
        'code', 'name', 'description', 'subject', 'gradeLevel',
        'category', 'masteryThreshold', 'masteryMinQuestions', 'isActive'
    ];
    const updates = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (updates.code) updates.code = updates.code.toUpperCase();

    standard = await Standard.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    })
        .populate('subject', 'name code')
        .populate('createdBy', 'firstName lastName');

    res.json({
        success: true,
        message: 'Standard updated successfully',
        data: { standard }
    });
});

/**
 * @desc    Delete standard (soft delete)
 * @route   DELETE /api/standards/:id
 * @access  Private (Admin)
 */
export const deleteStandard = asyncHandler(async (req, res) => {
    const standard = await Standard.findById(req.params.id);

    if (!standard) {
        return res.status(404).json({
            success: false,
            message: 'Standard not found'
        });
    }

    standard.isActive = false;
    await standard.save();

    res.json({
        success: true,
        message: 'Standard deleted successfully'
    });
});

/**
 * @desc    Bulk import standards
 * @route   POST /api/standards/import
 * @access  Private (Admin)
 */
export const importStandards = asyncHandler(async (req, res) => {
    const { standards } = req.body;

    if (!Array.isArray(standards) || standards.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Please provide an array of standards'
        });
    }

    // Validate required fields
    const errors = [];
    const prepared = standards.map((s, index) => {
        if (!s.code || !s.name || !s.description || !s.subject || !s.gradeLevel) {
            errors.push(`Row ${index + 1}: Missing required fields (code, name, description, subject, gradeLevel)`);
            return null;
        }
        return {
            school: req.schoolId,
            code: s.code.toUpperCase(),
            name: s.name,
            description: s.description,
            subject: s.subject,
            gradeLevel: s.gradeLevel,
            category: s.category || '',
            masteryThreshold: s.masteryThreshold || 80,
            masteryMinQuestions: s.masteryMinQuestions || 5,
            createdBy: req.user._id,
            isActive: true
        };
    }).filter(Boolean);

    if (errors.length > 0 && prepared.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'All rows have errors',
            errors
        });
    }

    let insertedCount = 0;
    let skippedCount = 0;
    const insertErrors = [];

    // Insert one by one to handle duplicates gracefully
    for (const std of prepared) {
        try {
            const existing = await Standard.findOne({ school: req.schoolId, code: std.code });
            if (existing) {
                skippedCount++;
                continue;
            }
            await Standard.create(std);
            insertedCount++;
        } catch (err) {
            if (err.code === 11000) {
                skippedCount++;
            } else {
                insertErrors.push(`${std.code}: ${err.message}`);
            }
        }
    }

    res.status(201).json({
        success: true,
        message: `Imported ${insertedCount} standards. Skipped ${skippedCount} duplicates.`,
        data: {
            insertedCount,
            skippedCount,
            validationErrors: errors,
            insertErrors
        }
    });
});

/**
 * @desc    Get standards grouped by subject
 * @route   GET /api/standards/by-subject
 * @access  Private
 */
export const getStandardsBySubject = asyncHandler(async (req, res) => {
    const { gradeLevel } = req.query;

    const match = { isActive: true };
    if (gradeLevel) match.gradeLevel = parseInt(gradeLevel);

    const result = await Standard.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$subject',
                standards: {
                    $push: {
                        _id: '$_id',
                        code: '$code',
                        name: '$name',
                        description: '$description',
                        gradeLevel: '$gradeLevel',
                        category: '$category'
                    }
                },
                count: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'subjects',
                localField: '_id',
                foreignField: '_id',
                as: 'subjectInfo'
            }
        },
        { $unwind: '$subjectInfo' },
        {
            $project: {
                subject: '$subjectInfo',
                standards: 1,
                count: 1
            }
        },
        { $sort: { 'subject.name': 1 } }
    ]);

    res.json({
        success: true,
        data: { groups: result }
    });
});
