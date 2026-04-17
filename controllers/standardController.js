import Standard from '../models/Standard.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { runImportPipeline } from '../services/import/importPipeline.js';
import { resolveTeacherProfile, getTeacherSubjectIds } from '../helpers/teacherScoping.js';

const toStringId = (value) => (value ? String(value) : '');

const resolveTeacherScopedSubjectIds = async (req) => {
    if (req.user.role !== 'teacher') {
        return null;
    }

    const teacher = await resolveTeacherProfile(req);
    if (!teacher) {
        return { error: 'Teacher profile not found' };
    }

    const subjectIds = await getTeacherSubjectIds(teacher._id);
    return {
        teacher,
        subjectIds: (Array.isArray(subjectIds) ? subjectIds : []).map((id) => toStringId(id)).filter(Boolean)
    };
};

/**
 * @desc    Get all standards
 * @route   GET /api/standards
 * @access  Private
 */
export const getStandards = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, search, subject, gradeLevel, category, isActive } = req.query;

    const query = { school: req.schoolId };

    const teacherScope = await resolveTeacherScopedSubjectIds(req);
    if (teacherScope?.error) {
        return res.status(403).json({ success: false, message: teacherScope.error });
    }

    if (teacherScope) {
        if (teacherScope.subjectIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    standards: [],
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: 0,
                        pages: 0
                    }
                }
            });
        }

        if (subject) {
            const requestedSubject = toStringId(subject);
            if (!teacherScope.subjectIds.includes(requestedSubject)) {
                return res.json({
                    success: true,
                    data: {
                        standards: [],
                        pagination: {
                            page: parseInt(page),
                            limit: parseInt(limit),
                            total: 0,
                            pages: 0
                        }
                    }
                });
            }
            query.subject = requestedSubject;
        } else {
            query.subject = { $in: teacherScope.subjectIds };
        }
    }

    if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
            { code: { $regex: escapedSearch, $options: 'i' } },
            { name: { $regex: escapedSearch, $options: 'i' } },
            { description: { $regex: escapedSearch, $options: 'i' } }
        ];
    }

    if (subject && !teacherScope) query.subject = subject;
    if (gradeLevel) query.gradeLevel = parseInt(gradeLevel);
    if (category) {
        const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.category = { $regex: escapedCategory, $options: 'i' };
    }
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

    if (toStringId(standard.school) !== toStringId(req.schoolId)) {
        return res.status(404).json({
            success: false,
            message: 'Standard not found'
        });
    }

    const teacherScope = await resolveTeacherScopedSubjectIds(req);
    if (teacherScope?.error) {
        return res.status(403).json({ success: false, message: teacherScope.error });
    }
    if (teacherScope) {
        const standardSubjectId = toStringId(standard.subject?._id || standard.subject);
        if (!teacherScope.subjectIds.includes(standardSubjectId)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this standard'
            });
        }
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
    const result = await runImportPipeline({
        entityType: 'standards',
        mode: 'commit',
        payload: req.body,
        context: {
            schoolId: req.schoolId,
            school: req.school,
            userId: req.user?._id,
            academicYear: req.academicYear
        }
    });

    res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        data: {
            insertedCount: result.summary.createdRows + result.summary.updatedRows,
            skippedCount: result.summary.skippedRows,
            validationErrors: result.errors,
            insertErrors: [],
            importRunId: result.importRunId,
            errorReportUrl: result.errorReportUrl
        },
        summary: result.summary,
        errors: result.errors,
        warnings: result.warnings
    });
});

/**
 * @desc    Get standards grouped by subject
 * @route   GET /api/standards/by-subject
 * @access  Private
 */
export const getStandardsBySubject = asyncHandler(async (req, res) => {
    const { gradeLevel } = req.query;

    const match = { school: req.schoolId, isActive: true };

    const teacherScope = await resolveTeacherScopedSubjectIds(req);
    if (teacherScope?.error) {
        return res.status(403).json({ success: false, message: teacherScope.error });
    }
    if (teacherScope) {
        if (teacherScope.subjectIds.length === 0) {
            return res.json({
                success: true,
                data: { groups: [] }
            });
        }
        match.subject = { $in: teacherScope.subjectIds };
    }

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
