import Class from '../models/Class.js';
import Student from '../models/Student.js';
import School from '../models/School.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveSchoolAcademicYear } from '../utils/academicYear.js';

/**
 * @desc    List academic years that have at least one class or student
 * @route   GET /api/schools/me/academic-years
 * @access  Private (Admin)
 */
export const getAcademicYears = asyncHandler(async (req, res) => {
    const [classYears, studentYears, school] = await Promise.all([
        Class.distinct('academicYear', { school: req.schoolId }),
        Student.distinct('academicYear', { school: req.schoolId }),
        School.findById(req.schoolId).select('settings.currentAcademicYear settings.academicYearStartMonth')
    ]);
    const currentAcademicYear = resolveSchoolAcademicYear(school);
    const combined = [...new Set([...classYears, ...studentYears, currentAcademicYear])].filter(Boolean).sort();
    res.json({ success: true, data: { academicYears: combined } });
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
    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'academicYear is required' });
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
    const graduateGrade = options.graduateGrade ?? 12;
    const defaultSection = options.defaultSection ?? 'A';

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

    const students = await Student.find({
        school: req.schoolId,
        academicYear: fromAcademicYear,
        status: 'active',
        currentClass: { $exists: true, $ne: null }
    }).populate('currentClass', 'grade section');

    const result = { promoted: 0, graduated: 0, skipped: 0, errors: [] };
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

            // Append current enrollment to history
            const historyEntry = {
                academicYear: fromAcademicYear,
                class: student.currentClass._id,
                leftAt
            };
            await Student.findByIdAndUpdate(student._id, {
                $push: {
                    classEnrollmentHistory: {
                        $each: [historyEntry],
                        $position: 0
                    }
                }
            });

            if (currentGrade >= graduateGrade) {
                await Student.findByIdAndUpdate(student._id, {
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
