import mongoose from 'mongoose';
import GradebookColumn from '../models/GradebookColumn.js';
import Grade from '../models/Grade.js';
import { generateAssessmentGroupId } from '../helpers/assessmentGrouping.js';

const toTitleCase = (value = '') => value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const getShortDate = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(5, 10).replace('-', '/');
};

const resolveLegacyColumnName = (grade) => {
    const explicitName = (grade.title || grade.examName || '').trim();
    if (explicitName) return explicitName;

    const baseName = toTitleCase(grade.gradeType || grade.category || 'assessment');
    const shortDate = getShortDate(grade.date);
    return shortDate ? `${baseName} ${shortDate}` : baseName;
};

/**
 * Get all columns for a class + subject + semester.
 */
export const getColumns = async (schoolId, { classId, subjectId, academicYear, semester }) => {
    const filter = { school: schoolId, class: classId, subject: subjectId, academicYear };
    if (semester) filter.semester = semester;
    return GradebookColumn.find(filter).sort({ sortOrder: 1, date: 1 }).lean();
};

/**
 * Get a single column by ID.
 */
export const getColumnById = async (columnId) => {
    return GradebookColumn.findById(columnId).lean();
};

/**
 * Create a new gradebook column.
 */
export const createColumn = async (data) => {
    const column = new GradebookColumn(data);
    return column.save();
};

/**
 * Bulk-create columns (for template application or import).
 */
export const createColumns = async (columnsData) => {
    return GradebookColumn.insertMany(columnsData, { ordered: false });
};

/**
 * Update a column. Prevents editing locked columns (except to unlock them).
 */
export const updateColumn = async (columnId, updates, force = false) => {
    const existing = await GradebookColumn.findById(columnId);
    if (!existing) return null;

    if (existing.isLocked && !force) {
        // Only allow unlocking
        if (updates.isLocked === false) {
            existing.isLocked = false;
            return existing.save();
        }
        throw new Error('Column is locked. Unlock it before editing.');
    }

    Object.assign(existing, updates);
    return existing.save();
};

/**
 * Delete a column and optionally its associated grades.
 * Returns { column, gradesUnlinked }.
 */
export const deleteColumn = async (columnId, deleteGrades = false) => {
    const column = await GradebookColumn.findById(columnId);
    if (!column) return null;

    if (column.isLocked) {
        throw new Error('Cannot delete a locked column. Unlock it first.');
    }

    let gradesUnlinked = 0;

    if (deleteGrades) {
        const result = await Grade.deleteMany({ columnId });
        gradesUnlinked = result.deletedCount;
    } else {
        // Unlink grades from the column but keep them
        const result = await Grade.updateMany(
            { columnId },
            { $set: { columnId: null } }
        );
        gradesUnlinked = result.modifiedCount;
    }

    await GradebookColumn.findByIdAndDelete(columnId);
    return { column, gradesUnlinked };
};

/**
 * Reorder columns by providing an array of { columnId, sortOrder }.
 */
export const reorderColumns = async (schoolId, orderUpdates) => {
    const bulkOps = orderUpdates.map(({ columnId, sortOrder }) => ({
        updateOne: {
            filter: { _id: columnId, school: schoolId },
            update: { $set: { sortOrder } }
        }
    }));
    return GradebookColumn.bulkWrite(bulkOps);
};

/**
 * Lock or unlock a column.
 */
export const toggleLock = async (columnId) => {
    const column = await GradebookColumn.findById(columnId);
    if (!column) return null;
    column.isLocked = !column.isLocked;
    return column.save();
};

/**
 * Lazy migration: Create GradebookColumn documents from existing legacy grades
 * that don't have a columnId. Groups by assessmentGroupId (or builds a composite key).
 *
 * Called automatically when a teacher opens the column-based gradebook for a
 * class + subject + semester for the first time.
 *
 * Returns the number of columns created.
 */
export const migrateColumnsFromLegacyGrades = async (schoolId, { classId, subjectId, academicYear, semester, userId }) => {
    // Check if any columns already exist for this scope — if so, migration was already done
    const existingCount = await GradebookColumn.countDocuments({
        school: schoolId,
        class: classId,
        subject: subjectId,
        academicYear,
        semester
    });
    if (existingCount > 0) return { created: 0, linked: 0, skipped: true };

    // Find legacy grades without a columnId in this scope
    const legacyGrades = await Grade.find({
        school: schoolId,
        class: classId,
        subject: subjectId,
        academicYear,
        semester,
        $or: [{ columnId: null }, { columnId: { $exists: false } }]
    }).lean();

    if (legacyGrades.length === 0) return { created: 0, linked: 0, skipped: false };

    // Group by assessmentGroupId (or build a fallback composite key)
    const groups = new Map();
    for (const grade of legacyGrades) {
        const key = grade.assessmentGroupId ||
            `${grade.category || 'classwork'}:${grade.title || grade.gradeType}:${(grade.date ? new Date(grade.date).toISOString().slice(0, 10) : 'unknown')}`;

        if (!groups.has(key)) {
            groups.set(key, {
                key,
                assessmentGroupId: grade.assessmentGroupId || '',
                name: resolveLegacyColumnName(grade),
                category: grade.category || 'classwork',
                date: grade.date,
                maxMarks: grade.maxMarks || 100,
                examPeriod: grade.examPeriod || null,
                lessonPlanIds: grade.lessonPlanIds || [],
                gradeIds: []
            });
        }
        groups.get(key).gradeIds.push(grade._id);
        // Use the highest maxMarks from the group
        if (grade.maxMarks > groups.get(key).maxMarks) {
            groups.get(key).maxMarks = grade.maxMarks;
        }
    }

    // Create columns and link grades
    let created = 0;
    let linked = 0;

    const sortedGroups = [...groups.values()].sort((a, b) => new Date(a.date) - new Date(b.date));

    for (let i = 0; i < sortedGroups.length; i++) {
        const group = sortedGroups[i];
        try {
            const column = await GradebookColumn.create({
                school: schoolId,
                class: classId,
                subject: subjectId,
                academicYear,
                semester,
                name: group.name,
                category: group.category,
                date: group.date,
                maxMarks: group.maxMarks,
                examPeriod: group.examPeriod,
                lessonPlanIds: group.lessonPlanIds,
                assessmentGroupId: group.assessmentGroupId,
                sortOrder: i + 1,
                createdBy: userId
            });

            // Link all grades in this group to the new column
            const linkResult = await Grade.updateMany(
                { _id: { $in: group.gradeIds } },
                { $set: { columnId: column._id } }
            );

            created++;
            linked += linkResult.modifiedCount;
        } catch (error) {
            // Duplicate key (parallel migration) — skip
            if (error.code === 11000) continue;
            throw error;
        }
    }

    return { created, linked, skipped: false };
};

/**
 * Get column stats (grade count, average, etc.) for a set of columns.
 */
export const getColumnStats = async (columnIds) => {
    const objectIds = columnIds.map(id => new mongoose.Types.ObjectId(id));
    const stats = await Grade.aggregate([
        { $match: { columnId: { $in: objectIds } } },
        {
            $group: {
                _id: '$columnId',
                count: { $sum: 1 },
                avgMarks: { $avg: '$marks' },
                avgMaxMarks: { $avg: '$maxMarks' },
                minMarks: { $min: '$marks' },
                maxMarksSeen: { $max: '$marks' }
            }
        }
    ]);
    return stats;
};
