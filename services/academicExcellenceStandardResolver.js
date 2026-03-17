import Class from '../models/Class.js';
import Standard from '../models/Standard.js';
import { sanitizeObjectiveText } from '../utils/sanitizeObjectiveText.js';

const normalizeComparable = (value = '') =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

/**
 * Resolve Standard from AE objective metadata inside school scope.
 *
 * @param {object} opts
 * @param {string} opts.objectiveKey
 * @param {string} opts.objectiveName
 * @param {string} opts.schoolId
 * @param {string} opts.subjectId
 * @param {string} opts.classId
 * @returns {Promise<object|null>}
 */
export async function resolveStandardForObjective(opts = {}) {
    const {
        objectiveKey,
        objectiveName,
        schoolId,
        subjectId,
        classId,
    } = opts;

    const normalizedKey = String(objectiveKey || '').trim().toUpperCase();
    const cleanedObjectiveName = sanitizeObjectiveText(objectiveName);
    const normalizedName = normalizeComparable(cleanedObjectiveName);

    const classDoc = classId
        ? await Class.findOne({ _id: classId, school: schoolId }).select('grade').lean()
        : null;
    const gradeLevel = Number(classDoc?.grade) || null;

    if (normalizedKey) {
        const exactMatch = await Standard.findOne({
            school: schoolId,
            code: normalizedKey,
            ...(subjectId ? { subject: subjectId } : {}),
            ...(gradeLevel ? { gradeLevel } : {}),
            isActive: true,
        });
        if (exactMatch) return exactMatch;
    }

    if (normalizedName) {
        const candidates = await Standard.find({
            school: schoolId,
            ...(subjectId ? { subject: subjectId } : {}),
            ...(gradeLevel ? { gradeLevel } : {}),
            isActive: true,
        })
            .select('name code')
            .limit(200)
            .lean();

        const candidate = candidates.find((item) => normalizeComparable(item?.name) === normalizedName);
        if (!candidate?._id) return null;

        return Standard.findById(candidate._id);
    }

    return null;
}
