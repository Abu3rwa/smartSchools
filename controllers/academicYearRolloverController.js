import mongoose from 'mongoose';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import School from '../models/School.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveSchoolAcademicYear } from '../utils/academicYear.js';

/**
 * @desc    List academic years that have at least one class or student
 * @route   GET /api/schools/me/academic-years
 * @access  Private (all authenticated users — filtered by school policy)
 */
export const getAcademicYears = asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId)
        .select('settings.currentAcademicYear settings.academicYearStartMonth settings.academicYearAccess');
    const currentAcademicYear = resolveSchoolAcademicYear(school);
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const allowHistorical = school?.settings?.academicYearAccess?.allowHistoricalAccess === true;

    // Non-admins only see the current year when historical access is off
    if (!isAdmin && !allowHistorical) {
        return res.json({
            success: true,
            data: { academicYears: [currentAcademicYear], currentAcademicYear }
        });
    }

    const [classYears, studentYears] = await Promise.all([
        Class.distinct('academicYear', { school: req.schoolId }),
        Student.distinct('academicYear', { school: req.schoolId }),
    ]);
    const combined = [...new Set([...classYears, ...studentYears, currentAcademicYear])].filter(Boolean).sort();
    res.json({ success: true, data: { academicYears: combined, currentAcademicYear } });
});

/**
 * @desc    Create classes for new year by copying structure from previous year (no teachers)
 * @route   POST /api/schools/me/rollover/classes
 * @access  Private (Admin)
 */
export const copyClassesFromYear = asyncHandler(async (req, res) => {
    const { fromAcademicYear, toAcademicYear } = req.body;
    if (!fromAcademicYear || !toAcademicYear) {
        return res.status(400).json({
            success: false,
            message: 'fromAcademicYear and toAcademicYear are required'
        });
    }
    if (fromAcademicYear === toAcademicYear) {
        return res.status(400).json({
            success: false,
            message: 'From and to academic years must be different'
        });
    }

    const existing = await Class.find({ school: req.schoolId, academicYear: fromAcademicYear });
    if (existing.length === 0) {
        return res.status(400).json({
            success: false,
            message: `No classes found for ${fromAcademicYear}`
        });
    }

    const already = await Class.findOne({ school: req.schoolId, academicYear: toAcademicYear });
    if (already) {
        return res.status(400).json({
            success: false,
            message: `Classes already exist for ${toAcademicYear}. Create manually or use a different year.`
        });
    }

    const created = [];
    for (const cls of existing) {
        const newClass = await Class.create({
            school: req.schoolId,
            name: cls.name,
            grade: cls.grade,
            section: cls.section,
            academicYear: toAcademicYear,
            department: cls.department || undefined,
            room: cls.room,
            capacity: cls.capacity ?? 40,
            isActive: true
            // classTeacher and subjects left empty for admin to assign
        });
        created.push(newClass);
    }

    res.status(201).json({
        success: true,
        message: `Created ${created.length} classes for ${toAcademicYear}`,
        data: { classes: created, count: created.length }
    });
});

/**
 * @desc    Deactivate all classes for an academic year
 * @route   POST /api/schools/me/rollover/deactivate-year
 * @access  Private (Admin)
 */
export const deactivateYear = asyncHandler(async (req, res) => {
    const { academicYear } = req.body;
    const dryRun = req.query.dryRun === 'true';
    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'academicYear is required' });
    }

    if (dryRun) {
        const count = await Class.countDocuments({ school: req.schoolId, academicYear, isActive: true });
        return res.json({
            success: true,
            dryRun: true,
            message: `Would deactivate ${count} active classes for ${academicYear}`,
            data: { wouldDeactivate: count }
        });
    }

    const result = await Class.updateMany(
        { school: req.schoolId, academicYear },
        { isActive: false }
    );

    res.json({
        success: true,
        message: `Deactivated ${result.modifiedCount} classes for ${academicYear}`,
        data: { modifiedCount: result.modifiedCount }
    });
});

/**
 * @desc    Promote students to next grade for new academic year (append history, update currentClass)
 * @route   POST /api/schools/me/rollover/promote-students
 * @access  Private (Admin)
 */
export const promoteStudents = asyncHandler(async (req, res) => {
    const { fromAcademicYear, toAcademicYear, options = {} } = req.body;
    const dryRun = req.query.dryRun === 'true';
    const graduateGrade = Math.max(1, Math.min(12, Number(options.graduateGrade) || 12));
    const defaultSection = String(options.defaultSection || 'A').substring(0, 10);
    const scope = ['all', 'grade', 'selected'].includes(options.scope) ? options.scope : 'all';
    const sourceGrade = Number(options.sourceGrade);
    const selectedStudentIds = Array.isArray(options.studentIds)
        ? Array.from(new Set(options.studentIds.map((value) => String(value || '').trim()).filter(Boolean)))
        : [];

    if (!fromAcademicYear || !toAcademicYear) {
        return res.status(400).json({
            success: false,
            message: 'fromAcademicYear and toAcademicYear are required'
        });
    }
    if (fromAcademicYear === toAcademicYear) {
        return res.status(400).json({
            success: false,
            message: 'From and to academic years must be different'
        });
    }

    if (scope === 'grade' && (!Number.isInteger(sourceGrade) || sourceGrade < 1 || sourceGrade > 12)) {
        return res.status(400).json({
            success: false,
            message: 'A grade between 1 and 12 is required when promotion scope is grade'
        });
    }
    if (scope === 'selected' && selectedStudentIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Select at least one student when promotion scope is selected'
        });
    }
    if (scope === 'selected' && selectedStudentIds.some((id) => !mongoose.isValidObjectId(id))) {
        return res.status(400).json({
            success: false,
            message: 'One or more selected student IDs are invalid'
        });
    }

    const studentQuery = {
        school: req.schoolId,
        academicYear: fromAcademicYear,
        status: 'active',
        currentClass: { $exists: true, $ne: null }
    };

    if (scope === 'grade') {
        const sourceClasses = await Class.find({
            school: req.schoolId,
            academicYear: fromAcademicYear,
            grade: sourceGrade
        }).select('_id').lean();
        studentQuery.currentClass = { $in: sourceClasses.map((item) => item._id) };
    }
    if (scope === 'selected') {
        studentQuery._id = { $in: selectedStudentIds };
    }

    const students = await Student.find(studentQuery).populate('currentClass', 'grade section');

    if (scope === 'selected' && students.length !== selectedStudentIds.length) {
        return res.status(400).json({
            success: false,
            message: 'One or more selected students are not active in the chosen academic year'
        });
    }

    if (dryRun) {
        const preview = {
            scope,
            candidateCount: students.length,
            wouldPromote: 0,
            wouldGraduate: 0,
            wouldSkip: 0,
            issues: []
        };
        for (const student of students) {
            const currentClass = student.currentClass;
            if (!currentClass) { preview.wouldSkip++; continue; }
            if (currentClass.grade >= graduateGrade) { preview.wouldGraduate++; continue; }
            const nextGrade = currentClass.grade + 1;
            const section = currentClass.section || defaultSection;
            const nextClass = await Class.findOne({ school: req.schoolId, academicYear: toAcademicYear, grade: nextGrade, section }).lean();
            if (!nextClass) {
                const fallback = await Class.findOne({ school: req.schoolId, academicYear: toAcademicYear, grade: nextGrade, section: defaultSection }).lean();
                if (fallback) { preview.wouldPromote++; } else {
                    preview.wouldSkip++;
                    preview.issues.push(`${student.studentId}: No class for Grade ${nextGrade}`);
                }
            } else {
                preview.wouldPromote++;
            }
        }
        return res.json({
            success: true,
            dryRun: true,
            message: `Preview: ${preview.wouldPromote} promote, ${preview.wouldGraduate} graduate, ${preview.wouldSkip} skip`,
            data: preview
        });
    }

    const result = { scope, candidateCount: students.length, promoted: 0, graduated: 0, skipped: 0, errors: [] };
    const leftAt = new Date();

    for (const student of students) {
        try {
            const currentClass = student.currentClass;
            if (!currentClass) {
                result.skipped++;
                continue;
            }
            const currentGrade = currentClass.grade;
            const section = currentClass.section || defaultSection;

            const historyEntry = {
                academicYear: fromAcademicYear,
                class: student.currentClass._id,
                leftAt
            };

            if (currentGrade >= graduateGrade) {
                await Student.findByIdAndUpdate(student._id, {
                    $push: {
                        classEnrollmentHistory: {
                            $each: [historyEntry],
                            $position: 0
                        }
                    },
                    status: 'graduated',
                    academicYear: toAcademicYear
                });
                result.graduated++;
                continue;
            }

            const nextGrade = currentGrade + 1;
            const nextClass = await Class.findOne({
                school: req.schoolId,
                academicYear: toAcademicYear,
                grade: nextGrade,
                section: section
            });
            if (!nextClass) {
                const fallback = await Class.findOne({
                    school: req.schoolId,
                    academicYear: toAcademicYear,
                    grade: nextGrade,
                    section: defaultSection
                });
                if (fallback) {
                    await Student.findByIdAndUpdate(student._id, {
                        $push: {
                            classEnrollmentHistory: {
                                $each: [historyEntry],
                                $position: 0
                            }
                        },
                        currentClass: fallback._id,
                        academicYear: toAcademicYear,
                        $addToSet: { enrolledClasses: fallback._id }
                    });
                    result.promoted++;
                } else {
                    result.skipped++;
                    result.errors.push(`${student.studentId}: No class for Grade ${nextGrade}`);
                }
                continue;
            }

            await Student.findByIdAndUpdate(student._id, {
                $push: {
                    classEnrollmentHistory: {
                        $each: [historyEntry],
                        $position: 0
                    }
                },
                currentClass: nextClass._id,
                academicYear: toAcademicYear,
                $addToSet: { enrolledClasses: nextClass._id }
            });
            result.promoted++;
        } catch (err) {
            result.errors.push(`${student.studentId}: ${err.message}`);
        }
    }

    res.json({
        success: true,
        message: `Promotion complete. Promoted: ${result.promoted}, Graduated: ${result.graduated}, Skipped: ${result.skipped}`,
        data: result
    });
});
