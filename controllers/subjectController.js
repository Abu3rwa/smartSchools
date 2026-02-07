import Subject from '../models/Subject.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherSubjectIds } from '../helpers/teacherScoping.js';

/**
 * @desc    Get all subjects
 * @route   GET /api/subjects
 * @access  Private
 */
export const getSubjects = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, search, type, grade, isActive } = req.query;

    const query = {};

    if (search) {
        query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { code: { $regex: search, $options: 'i' } }
        ];
    }

    if (type) query.type = type;
    if (grade) query.applicableGrades = parseInt(grade);
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Access Control: Teachers see only their assigned subjects
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (teacher) {
            const subjectIds = await getTeacherSubjectIds(teacher._id);
            query._id = { $in: subjectIds };
        }
    }

    const subjects = await Subject.find(query)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Subject.countDocuments(query);

    res.json({
        success: true,
        data: {
            subjects,
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
 * @desc    Get single subject
 * @route   GET /api/subjects/:id
 * @access  Private
 */
export const getSubject = asyncHandler(async (req, res) => {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
        return res.status(404).json({
            success: false,
            message: 'Subject not found'
        });
    }

    res.json({
        success: true,
        data: { subject }
    });
});

/**
 * @desc    Create subject
 * @route   POST /api/subjects
 * @access  Private (Admin)
 */
export const createSubject = asyncHandler(async (req, res) => {
    const {
        name,
        code,
        description,
        passingMarks,
        maxMarks,
        dailyMaxMarks,
        creditHours,
        type,
        applicableGrades
    } = req.body;

    // Check if subject code already exists in this school
    const existingSubject = await Subject.findOne({ school: req.schoolId, code: code.toUpperCase() });
    if (existingSubject) {
        return res.status(400).json({
            success: false,
            message: 'Subject with this code already exists'
        });
    }

    const subject = await Subject.create({
        school: req.schoolId,
        name,
        code: code.toUpperCase(),
        description,
        passingMarks: passingMarks || 40,
        maxMarks: maxMarks || 100,
        dailyMaxMarks: dailyMaxMarks || 10,
        creditHours: creditHours || 1,
        type: type || 'core',
        applicableGrades: applicableGrades || []
    });

    res.status(201).json({
        success: true,
        message: 'Subject created successfully',
        data: { subject }
    });
});

/**
 * @desc    Update subject
 * @route   PUT /api/subjects/:id
 * @access  Private (Admin)
 */
export const updateSubject = asyncHandler(async (req, res) => {
    let subject = await Subject.findById(req.params.id);

    if (!subject) {
        return res.status(404).json({
            success: false,
            message: 'Subject not found'
        });
    }

    // If updating code, check for duplicates
    if (req.body.code && req.body.code.toUpperCase() !== subject.code) {
        const existingSubject = await Subject.findOne({
            school: req.schoolId,
            code: req.body.code.toUpperCase(),
            _id: { $ne: req.params.id }
        });

        if (existingSubject) {
            return res.status(400).json({
                success: false,
                message: 'Subject with this code already exists'
            });
        }

        req.body.code = req.body.code.toUpperCase();
    }

    // Whitelist allowed fields to prevent privilege escalation
    const allowedFields = ['name', 'code', 'description', 'passingMarks', 'maxMarks', 'dailyMaxMarks', 'creditHours', 'type', 'applicableGrades', 'isActive'];
    const updates = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Handle code normalization separately
    if (updates.code) {
        updates.code = updates.code.toUpperCase();
    }

    subject = await Subject.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    });

    res.json({
        success: true,
        message: 'Subject updated successfully',
        data: { subject }
    });
});

/**
 * @desc    Delete subject
 * @route   DELETE /api/subjects/:id
 * @access  Private (Admin)
 */
export const deleteSubject = asyncHandler(async (req, res) => {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
        return res.status(404).json({
            success: false,
            message: 'Subject not found'
        });
    }

    // Soft delete
    subject.isActive = false;
    await subject.save();

    res.json({
        success: true,
        message: 'Subject deleted successfully'
    });
});

/**
 * @desc    Get subjects for a specific grade
 * @route   GET /api/subjects/grade/:grade
 * @access  Private
 */
export const getSubjectsByGrade = asyncHandler(async (req, res) => {
    const grade = parseInt(req.params.grade);

    const subjects = await Subject.find({
        $or: [
            { applicableGrades: grade },
            { applicableGrades: { $size: 0 } } // Subjects applicable to all grades
        ],
        isActive: true
    }).sort({ name: 1 });

    res.json({
        success: true,
        data: { subjects, count: subjects.length }
    });
});

/**
 * @desc    Bulk create subjects
 * @route   POST /api/subjects/bulk
 * @access  Private (Admin)
 */
export const bulkCreateSubjects = asyncHandler(async (req, res) => {
    const { subjects } = req.body;

    if (!Array.isArray(subjects) || subjects.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Please provide an array of subjects'
        });
    }

    // Prepare subjects with uppercase codes and school context
    const preparedSubjects = subjects.map(s => ({
        ...s,
        school: req.schoolId,
        code: s.code.toUpperCase()
    }));

    // Insert many, ignoring duplicates
    const result = await Subject.insertMany(preparedSubjects, {
        ordered: false,
        rawResult: true
    }).catch(err => {
        if (err.code === 11000) {
            return { insertedCount: err.result?.nInserted || 0 };
        }
        throw err;
    });

    res.status(201).json({
        success: true,
        message: `${result.insertedCount || preparedSubjects.length} subjects created successfully`
    });
});
