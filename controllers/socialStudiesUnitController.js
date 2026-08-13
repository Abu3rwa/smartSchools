import SocialStudiesUnit from '../models/SocialStudiesUnit.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import Class from '../models/Class.js';
import logger from '../utils/logger.js';

const normalizeSemester = (v) => {
    const n = Number(v);
    return [1, 2].includes(n) ? n : null;
};

// Resolve the grade levels this teacher teaches (unique set from their assigned classes)
const resolveTeacherGradeLevels = async (req) => {
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return null; // admin or non-teacher — no grade restriction

    const classIds = await getTeacherClassIds(teacher._id);
    if (!classIds.length) return [];

    const classes = await Class.find({ _id: { $in: classIds } }).select('grade').lean();
    const grades = [...new Set(classes.map(c => c.grade).filter(g => g != null))];
    return grades; // e.g. [5, 6]
};

// GET /api/social-studies/units
export const getUnits = asyncHandler(async (req, res) => {
    const { academicYear, semester, gradeLevel } = req.query;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);

    const filter = { school: req.schoolId, isActive: true };
    if (effectiveAcademicYear) filter.academicYear = effectiveAcademicYear;
    if (semester) filter.semester = normalizeSemester(semester);

    // Explicit grade filter from query (admin override)
    if (gradeLevel != null && gradeLevel !== '') {
        filter.gradeLevel = Number(gradeLevel);
    } else if (req.user.role === 'teacher') {
        // Auto-filter: teachers only see units whose grade matches their classes
        // Units with no gradeLevel set (null) are visible to all teachers
        const teacherGrades = await resolveTeacherGradeLevels(req);
        if (teacherGrades && teacherGrades.length > 0) {
            filter.$or = [
                { gradeLevel: { $in: teacherGrades } },
                { gradeLevel: null },
            ];
        }
    }

    const units = await SocialStudiesUnit.find(filter)
        .sort({ order: 1, createdAt: -1 })
        .lean();

    res.json({ success: true, data: units });
});

// GET /api/social-studies/units/:id
export const getUnit = asyncHandler(async (req, res) => {
    const unit = await SocialStudiesUnit.findById(req.params.id).lean();
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found' });
    res.json({ success: true, data: unit });
});

// POST /api/social-studies/units
export const createUnit = asyncHandler(async (req, res) => {
    const { title, description, gradeLevel, academicYear, semester, order } = req.body;

    if (!title?.trim()) {
        return res.status(400).json({ success: false, message: 'title is required' });
    }

    const teacher = await resolveTeacherProfile(req);
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);

    const unit = await SocialStudiesUnit.create({
        school: req.schoolId,
        teacher: teacher?._id || req.user._id,
        title: title.trim(),
        description: description?.trim() || '',
        gradeLevel: gradeLevel != null ? Number(gradeLevel) : null,
        academicYear: effectiveAcademicYear,
        semester: normalizeSemester(semester),
        order: order != null ? Number(order) : 0,
    });

    res.status(201).json({ success: true, data: unit });
});

// PUT /api/social-studies/units/:id
export const updateUnit = asyncHandler(async (req, res) => {
    const { title, description, gradeLevel, academicYear, semester, order, isPublished } = req.body;

    const unit = await SocialStudiesUnit.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found' });

    if (title != null) unit.title = title.trim();
    if (description != null) unit.description = description.trim();
    if (gradeLevel != null) unit.gradeLevel = Number(gradeLevel);
    if (academicYear != null) unit.academicYear = academicYear;
    if (semester != null) unit.semester = normalizeSemester(semester);
    if (order != null) unit.order = Number(order);
    if (typeof isPublished === 'boolean') unit.isPublished = isPublished;

    await unit.save();
    res.json({ success: true, data: unit });
});

// DELETE /api/social-studies/units/:id
export const deleteUnit = asyncHandler(async (req, res) => {
    const unit = await SocialStudiesUnit.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found' });

    unit.isActive = false;
    await unit.save();

    res.json({ success: true, message: 'Unit deleted' });
});
