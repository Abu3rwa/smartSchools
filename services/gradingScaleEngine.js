import GradingScale from '../models/GradingScale.js';

const DEFAULT_BANDS = [
    { grade: 'A+', min: 97, max: 100, color: '#14532d' },
    { grade: 'A', min: 93, max: 96, color: '#166534' },
    { grade: 'A-', min: 90, max: 92, color: '#15803d' },
    { grade: 'B+', min: 87, max: 89, color: '#059669' },
    { grade: 'B', min: 83, max: 86, color: '#0d9488' },
    { grade: 'B-', min: 80, max: 82, color: '#0284c7' },
    { grade: 'C+', min: 77, max: 79, color: '#2563eb' },
    { grade: 'C', min: 73, max: 76, color: '#4f46e5' },
    { grade: 'C-', min: 70, max: 72, color: '#7c3aed' },
    { grade: 'D+', min: 67, max: 69, color: '#c2410c' },
    { grade: 'D', min: 50, max: 66, color: '#ea580c' },
    { grade: 'F', min: 0, max: 49, color: '#dc2626' }
];

const DEFAULT_SPECIAL_CODES = [
    { code: 'BLANK', label: 'Leave blank (not counted)', countsAsZero: false, excludeFromAverage: true },
    { code: 'E', label: 'Excused absence (not counted)', countsAsZero: false, excludeFromAverage: true },
    { code: 'U', label: 'Unexcused absence (counted as zero)', countsAsZero: true, excludeFromAverage: false },
    { code: 'I', label: 'Incomplete (not counted)', countsAsZero: false, excludeFromAverage: true },
    { code: 'NA', label: 'Not assessed (not counted)', countsAsZero: false, excludeFromAverage: true }
];

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeScaleBands = (bands = DEFAULT_BANDS) => {
    const source = Array.isArray(bands) && bands.length > 0 ? bands : DEFAULT_BANDS;
    return source
        .map((band) => ({
            grade: String(band?.grade || '').trim().toUpperCase(),
            min: toNumber(band?.min),
            max: toNumber(band?.max),
            color: String(band?.color || '#64748b').trim()
        }))
        .filter((band) => band.grade && band.min !== null && band.max !== null)
        .sort((a, b) => b.min - a.min || b.max - a.max);
};

const toPublicScale = (row) => {
    if (!row) {
        return {
            key: 'default-grading-scale',
            name: 'Default Grading Scale',
            bands: normalizeScaleBands(DEFAULT_BANDS),
            specialCodes: DEFAULT_SPECIAL_CODES
        };
    }

    return {
        id: row._id,
        key: row.key,
        name: row.name,
        isDefault: row.isDefault === true,
        bands: normalizeScaleBands(row.bands),
        specialCodes: Array.isArray(row.specialCodes) && row.specialCodes.length > 0
            ? row.specialCodes
            : DEFAULT_SPECIAL_CODES
    };
};

const buildSchoolScopedQuery = (schoolId, extra = {}) => {
    const query = { ...extra };
    if (schoolId) {
        query.school = schoolId;
    }
    return query;
};

export const getActiveGradingScale = async (schoolId = null) => {
    const defaultQuery = buildSchoolScopedQuery(schoolId, { isDefault: true, isActive: true });
    const activeQuery = buildSchoolScopedQuery(schoolId, { isActive: true });

    let scale = await GradingScale.findOne(defaultQuery)
        .select('key name isDefault bands specialCodes')
        .lean();

    if (!scale) {
        scale = await GradingScale.findOne(activeQuery)
            .sort({ sortOrder: 1, name: 1 })
            .select('key name isDefault bands specialCodes')
            .lean();
    }

    return toPublicScale(scale || null);
};

export const getScaleBandForPercentage = (percentage, scale) => {
    const numeric = toNumber(percentage);
    if (numeric === null) return null;

    const bands = normalizeScaleBands(scale?.bands);
    return bands.find((band) => numeric >= band.min && numeric <= band.max) || null;
};

const toPercentage = (marks, maxMarks) => {
    const safeMarks = toNumber(marks);
    const safeMax = toNumber(maxMarks);
    if (safeMarks === null || safeMax === null || safeMax <= 0) return null;
    return (safeMarks / safeMax) * 100;
};

export const decorateGradeWithScale = (grade, scale) => {
    const row = grade?.toObject ? grade.toObject() : { ...grade };
    const percentage = toPercentage(row?.marks, row?.maxMarks);
    const scaleBand = getScaleBandForPercentage(percentage, scale);

    return {
        ...row,
        percentageValue: percentage === null ? null : Number(percentage.toFixed(2)),
        letterGrade: scaleBand?.grade || null,
        scaleBand,
        scaleColor: scaleBand?.color || null
    };
};

export const decorateGradesWithScale = (grades = [], scale) => {
    if (!Array.isArray(grades) || grades.length === 0) return [];
    return grades.map((grade) => decorateGradeWithScale(grade, scale));
};

export const gradingScaleDefaults = {
    bands: DEFAULT_BANDS,
    specialCodes: DEFAULT_SPECIAL_CODES
};
