import mongoose from 'mongoose';
import SBRScale from '../models/SBRScale.js';
import SBRReportCard from '../models/SBRReportCard.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import School from '../models/School.js';
import StandardAssignment from '../models/StandardAssignment.js';
import StandardsGradebookEntry from '../models/StandardsGradebookEntry.js';
import MasteryRecord from '../models/MasteryRecord.js';
import Grade from '../models/Grade.js';
import LessonPlan from '../models/LessonPlan.js';
import Subject from '../models/Subject.js';

const DEFAULT_SBR_LEVELS = [
    {
        value: 4,
        label: 'Exceeds Standard',
        labelAr: '',
        description: 'Student consistently demonstrates advanced proficiency.',
        minPercent: 90,
        maxPercent: 100,
        color: '#1a7a1a'
    },
    {
        value: 3,
        label: 'Meets Standard',
        labelAr: '',
        description: 'Student demonstrates expected proficiency.',
        minPercent: 75,
        maxPercent: 89,
        color: '#2f855a'
    },
    {
        value: 2,
        label: 'Approaching Standard',
        labelAr: '',
        description: 'Student is developing proficiency.',
        minPercent: 60,
        maxPercent: 74,
        color: '#b7791f'
    },
    {
        value: 1,
        label: 'Below Standard',
        labelAr: '',
        description: 'Student needs additional support.',
        minPercent: 0,
        maxPercent: 59,
        color: '#c53030'
    }
];

const DEFAULT_SBR_SPECIAL_CODES = [
    {
        code: 'NA',
        label: 'Not Assessed',
        labelAr: ''
    }
];

const PERIOD_TYPES = {
    semester_1: { type: 'semester_1', label: 'Semester 1', semester: 1 },
    semester_2: { type: 'semester_2', label: 'Semester 2', semester: 2 },
    full_year: { type: 'full_year', label: 'Full Year', semester: null }
};

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof mongoose.Types.ObjectId) return value.toString();
    if (value?._id) return String(value._id);
    return String(value);
};

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const round2 = (value) => {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
};

const mean = (values = []) => {
    const numeric = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (numeric.length === 0) return null;
    const total = numeric.reduce((sum, value) => sum + value, 0);
    return total / numeric.length;
};

export const normalizePeriod = (value) => {
    const raw = String(value || '').trim().toLowerCase();

    if (['semester_1', 'semester1', 'sem1', 's1', '1'].includes(raw)) {
        return PERIOD_TYPES.semester_1;
    }

    if (['semester_2', 'semester2', 'sem2', 's2', '2'].includes(raw)) {
        return PERIOD_TYPES.semester_2;
    }

    if (['full_year', 'fullyear', 'year', 'annual', 'all'].includes(raw)) {
        return PERIOD_TYPES.full_year;
    }

    return null;
};

const buildPeriodLabel = (academicYear, periodInfo) => {
    if (!periodInfo) return String(academicYear || '').trim();
    if (!academicYear) return periodInfo.label;
    return `${academicYear}, ${periodInfo.label}`;
};

const normalizeText = (value) => String(value || '').trim();

const eqText = (a, b) => normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();

const buildStandardDisplayName = (standard, mode = 'code_definition') => {
    const code = normalizeText(standard?.code);
    const name = normalizeText(standard?.name);
    const definition = normalizeText(standard?.description);

    if (mode === 'code_name') {
        return name || definition || code || 'Standard';
    }

    if (mode === 'code_name_definition') {
        if (name && definition && !eqText(name, definition)) {
            return `${name} - ${definition}`;
        }
        return name || definition || code || 'Standard';
    }

    // default: code_definition
    return definition || name || code || 'Standard';
};

const mapRawPercentageToLevel = (rawPercentage, scale) => {
    if (!Number.isFinite(rawPercentage)) {
        return { score: null, isNA: true };
    }

    const sortedLevels = [...(scale?.levels || [])].sort((a, b) => Number(b.value) - Number(a.value));
    if (sortedLevels.length === 0) {
        return { score: null, isNA: true };
    }

    const matching = sortedLevels.find((level) => {
        const minPercent = Number(level.minPercent);
        const maxPercent = Number(level.maxPercent);
        return rawPercentage >= minPercent && rawPercentage <= maxPercent;
    });

    const fallback = sortedLevels[sortedLevels.length - 1];
    return {
        score: Number((matching || fallback).value),
        isNA: false
    };
};

export const ensureDefaultSBRScale = async (schoolId, userId = null) => {
    const existing = await SBRScale.findOne({ school: schoolId }).select('_id').lean();
    if (existing) return;

    await SBRScale.create({
        school: schoolId,
        name: 'SBR 1-4 Scale',
        description: 'Default standards-based proficiency scale',
        isDefault: true,
        isActive: true,
        createdBy: userId,
        levels: DEFAULT_SBR_LEVELS,
        specialCodes: DEFAULT_SBR_SPECIAL_CODES
    });
};

export const getActiveSBRScale = async (schoolId, userId = null) => {
    await ensureDefaultSBRScale(schoolId, userId);

    let scale = await SBRScale.findOne({ school: schoolId, isDefault: true, isActive: true }).lean();
    if (!scale) {
        scale = await SBRScale.findOne({ school: schoolId, isActive: true })
            .sort({ updatedAt: -1 })
            .lean();
    }
    if (!scale) {
        scale = await SBRScale.findOne({ school: schoolId })
            .sort({ updatedAt: -1 })
            .lean();
    }

    return scale;
};

export const generateReportCardId = async (schoolId) => {
    const lastReport = await SBRReportCard.findOne({ school: schoolId })
        .sort({ reportCardId: -1 })
        .select('reportCardId')
        .lean();

    const lastNum = lastReport?.reportCardId
        ? Number.parseInt(String(lastReport.reportCardId).replace('RC', ''), 10)
        : 63000;

    const nextNum = Number.isFinite(lastNum) ? lastNum + 1 : 63001;
    return `RC${String(nextNum).padStart(5, '0')}`;
};

const generateReportCardIds = async (schoolId, count) => {
    if (!Number.isFinite(count) || count <= 0) return [];

    const lastReport = await SBRReportCard.findOne({ school: schoolId })
        .sort({ reportCardId: -1 })
        .select('reportCardId')
        .lean();

    const start = lastReport?.reportCardId
        ? Number.parseInt(String(lastReport.reportCardId).replace('RC', ''), 10) + 1
        : 63001;

    return Array.from({ length: count }, (_, index) => `RC${String(start + index).padStart(5, '0')}`);
};

const getSubjectName = (subjectDoc) => {
    if (!subjectDoc) return 'Subject';
    return String(subjectDoc.name || subjectDoc.title || 'Subject').trim();
};

const buildStudentName = (student) => {
    const firstName = String(student?.firstName || '').trim();
    const lastName = String(student?.lastName || '').trim();
    return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Student';
};

const collectLessonStandardIds = (lesson) => {
    const directIds = Array.isArray(lesson?.standardIds) ? lesson.standardIds : [];
    const objectiveIds = Array.isArray(lesson?.objectives)
        ? lesson.objectives.flatMap((item) => (Array.isArray(item?.standardIds) ? item.standardIds : []))
        : [];

    const ids = [...directIds, ...objectiveIds]
        .map((value) => toIdString(value))
        .filter(Boolean);

    return [...new Set(ids)];
};

export const aggregateStudentSBRScores = async ({
    schoolId,
    studentId,
    classId,
    subjectId,
    period,
    academicYear,
    scale,
    standardDisplayMode = 'code_definition'
}) => {
    const periodInfo = normalizePeriod(period);
    if (!periodInfo) {
        throw new Error('Invalid period. Expected semester_1, semester_2, or full_year.');
    }

    const assignmentFilter = {
        school: schoolId,
        class: classId,
        subject: subjectId,
        isActive: true
    };

    if (academicYear) {
        assignmentFilter.$or = [{ academicYear }, { academicYear: null }];
    }

    if (periodInfo.semester !== null) {
        assignmentFilter.$and = [
            {
                $or: [{ semester: periodInfo.semester }, { semester: null }]
            }
        ];
    }

    const assignments = await StandardAssignment.find(assignmentFilter)
        .populate('standard', 'code name description category masteryMinQuestions')
        .lean();

    const standardsMap = new Map();
    for (const assignment of assignments) {
        const standard = assignment?.standard;
        const standardId = toIdString(standard?._id);
        if (!standardId) continue;
        if (!standardsMap.has(standardId)) {
            standardsMap.set(standardId, standard);
        }
    }

    const standardIds = [...standardsMap.keys()];
    const subjectDoc = await Subject.findById(subjectId).select('name').lean();

    if (standardIds.length === 0) {
        return {
            subject: subjectId,
            subjectName: getSubjectName(subjectDoc),
            overallScore: null,
            categories: []
        };
    }

    const gradebookFilter = {
        school: schoolId,
        student: studentId,
        class: classId,
        subject: subjectId,
        standard: { $in: standardIds },
        status: 'released'
    };

    if (academicYear) gradebookFilter.academicYear = academicYear;
    if (periodInfo.semester !== null) gradebookFilter.semester = periodInfo.semester;

    const gradebookEntries = await StandardsGradebookEntry.find(gradebookFilter)
        .select('standard percentage')
        .lean();

    const gradebookByStandard = new Map();
    for (const entry of gradebookEntries) {
        const key = toIdString(entry?.standard);
        const percentage = toNumber(entry?.percentage);
        if (!key || percentage === null) continue;
        if (!gradebookByStandard.has(key)) {
            gradebookByStandard.set(key, []);
        }
        gradebookByStandard.get(key).push(percentage);
    }

    const masteryRecords = await MasteryRecord.find({
        school: schoolId,
        student: studentId,
        standard: { $in: standardIds }
    })
        .select('standard totalAttemptsAllTime totalCorrectAllTime')
        .lean();

    const masteryByStandard = new Map();
    for (const mastery of masteryRecords) {
        const key = toIdString(mastery?.standard);
        if (!key) continue;
        masteryByStandard.set(key, mastery);
    }

    const gradeFilter = {
        school: schoolId,
        student: studentId,
        class: classId,
        subject: subjectId
    };

    if (academicYear) gradeFilter.academicYear = academicYear;
    if (periodInfo.semester !== null) gradeFilter.semester = periodInfo.semester;

    const grades = await Grade.find(gradeFilter)
        .select('marks maxMarks lessonPlanIds')
        .lean();

    const lessonPlanIdSet = new Set();
    for (const grade of grades) {
        for (const lessonId of grade.lessonPlanIds || []) {
            const lessonKey = toIdString(lessonId);
            if (lessonKey) lessonPlanIdSet.add(lessonKey);
        }
    }

    const lessonPlans = lessonPlanIdSet.size > 0
        ? await LessonPlan.find({
            _id: { $in: [...lessonPlanIdSet] },
            school: schoolId
        })
            .select('standardIds objectives.standardIds')
            .lean()
        : [];

    const lessonStandardsMap = new Map();
    for (const lesson of lessonPlans) {
        lessonStandardsMap.set(toIdString(lesson?._id), collectLessonStandardIds(lesson));
    }

    const linkedGradePercentagesByStandard = new Map();
    for (const grade of grades) {
        const marks = toNumber(grade?.marks);
        const maxMarks = toNumber(grade?.maxMarks);
        if (marks === null || maxMarks === null || maxMarks <= 0) continue;

        const pct = (marks / maxMarks) * 100;
        const standardIdsForGrade = new Set();

        for (const lessonId of grade.lessonPlanIds || []) {
            const lessonKey = toIdString(lessonId);
            const linkedStandardIds = lessonStandardsMap.get(lessonKey) || [];
            for (const standardId of linkedStandardIds) {
                standardIdsForGrade.add(standardId);
            }
        }

        for (const standardId of standardIdsForGrade) {
            if (!linkedGradePercentagesByStandard.has(standardId)) {
                linkedGradePercentagesByStandard.set(standardId, []);
            }
            linkedGradePercentagesByStandard.get(standardId).push(pct);
        }
    }

    const categoriesMap = new Map();
    const subjectScores = [];

    for (const standardId of standardIds) {
        const standard = standardsMap.get(standardId);
        const categoryName = String(standard?.category || 'General').trim() || 'General';

        const directScores = gradebookByStandard.get(standardId) || [];
        const directAvg = mean(directScores);

        const mastery = masteryByStandard.get(standardId);
        const masteryAttempts = toNumber(mastery?.totalAttemptsAllTime) || 0;
        const masteryCorrect = toNumber(mastery?.totalCorrectAllTime) || 0;
        const masteryMinQuestions = toNumber(standard?.masteryMinQuestions) || 5;
        const masteryPct = masteryAttempts >= masteryMinQuestions && masteryAttempts > 0
            ? (masteryCorrect / masteryAttempts) * 100
            : null;

        const linkedScores = linkedGradePercentagesByStandard.get(standardId) || [];
        const linkedAvg = mean(linkedScores);

        let rawPercentage = null;
        let assessmentCount = 0;

        if (directAvg !== null) {
            rawPercentage = directAvg;
            assessmentCount = directScores.length;
        } else if (masteryPct !== null) {
            rawPercentage = masteryPct;
            assessmentCount = masteryAttempts;
        } else if (linkedAvg !== null) {
            rawPercentage = linkedAvg;
            assessmentCount = linkedScores.length;
        }

        const mapped = mapRawPercentageToLevel(rawPercentage, scale);

        if (!mapped.isNA && Number.isFinite(mapped.score)) {
            subjectScores.push(mapped.score);
        }

        if (!categoriesMap.has(categoryName)) {
            categoriesMap.set(categoryName, {
                categoryName,
                categoryNameAr: '',
                sortOrder: 0,
                standards: []
            });
        }

        categoriesMap.get(categoryName).standards.push({
            standard: standard?._id || null,
            standardCode: String(standard?.code || '').trim(),
            standardName: buildStandardDisplayName(standard, standardDisplayMode),
            score: mapped.score,
            rawPercentage: round2(rawPercentage),
            assessmentCount,
            isNA: mapped.isNA
        });
    }

    const categories = [...categoriesMap.values()]
        .map((category) => ({
            ...category,
            standards: category.standards.sort((a, b) => {
                return String(a.standardCode || a.standardName).localeCompare(String(b.standardCode || b.standardName));
            })
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.categoryName.localeCompare(b.categoryName));

    const overallScore = mean(subjectScores);

    return {
        subject: subjectDoc?._id || subjectId,
        subjectName: getSubjectName(subjectDoc),
        overallScore: round2(overallScore),
        categories
    };
};

const resolveClassSubjectIds = (classDoc) => {
    const rawSubjects = Array.isArray(classDoc?.subjects) ? classDoc.subjects : [];
    const ids = rawSubjects
        .map((item) => toIdString(item?.subject))
        .filter(Boolean);

    return [...new Set(ids)];
};

export const buildSBRReportData = async ({
    schoolId,
    studentId,
    classId,
    period,
    academicYear,
    generatedBy,
    reportCardId = null,
    comments = '',
    teacherNotes = {}
}) => {
    const periodInfo = normalizePeriod(period);
    if (!periodInfo) {
        throw new Error('Invalid period. Expected semester_1, semester_2, or full_year.');
    }

    const [student, classDoc, school, scale] = await Promise.all([
        Student.findOne({ _id: studentId, school: schoolId })
            .select('firstName lastName studentId')
            .lean(),
        Class.findOne({ _id: classId, school: schoolId })
            .populate('subjects.subject', 'name')
            .lean(),
        School.findById(schoolId)
            .select('name settings.branding reportSettings defaultAcademicYear contact')
            .lean(),
        getActiveSBRScale(schoolId, generatedBy)
    ]);

    if (!student) {
        throw new Error('Student not found for this school.');
    }

    if (!classDoc) {
        throw new Error('Class not found for this school.');
    }

    if (!scale) {
        throw new Error('No SBR scale available for this school.');
    }

    const selectedAcademicYear = String(
        academicYear
        || classDoc.academicYear
        || school?.settings?.currentAcademicYear
        || ''
    ).trim();

    const subjectIds = resolveClassSubjectIds(classDoc);
    const standardDisplayMode = String(school?.reportSettings?.sbrStandardDisplayMode || 'code_definition').trim();

    const subjects = [];
    for (const subjectId of subjectIds) {
        const subjectScores = await aggregateStudentSBRScores({
            schoolId,
            studentId,
            classId,
            subjectId,
            period: periodInfo.type,
            academicYear: selectedAcademicYear,
            scale,
            standardDisplayMode
        });
        subjects.push(subjectScores);
    }

    const nextReportCardId = reportCardId || (await generateReportCardId(schoolId));

    return {
        school: schoolId,
        student: student._id,
        class: classDoc._id,
        academicYear: selectedAcademicYear,
        period: {
            type: periodInfo.type,
            label: buildPeriodLabel(selectedAcademicYear, periodInfo)
        },
        reportCardId: nextReportCardId,
        scale: scale._id,
        subjects,
        generatedBy,
        generatedAt: new Date(),
        comments: String(comments || '').trim(),
        teacherNotes,
        studentMeta: {
            studentName: buildStudentName(student),
            studentId: String(student.studentId || '').trim()
        },
        classMeta: {
            grade: classDoc.grade,
            section: classDoc.section,
            className: classDoc.name
        },
        schoolMeta: {
            schoolName: String(school?.name || '').trim(),
            reportLanguage: school?.reportSettings?.defaultLanguage || 'english',
            logoUrl: school?.settings?.branding?.logoUrl || '',
            primaryColor: school?.settings?.branding?.primaryColor || '#1f3c88',
            secondaryColor: school?.settings?.branding?.secondaryColor || '#37517e',
            phone: school?.contact?.phone || '',
            email: school?.contact?.adminEmail || '',
            website: ''
        },
        scaleMeta: {
            name: scale.name,
            levels: scale.levels || [],
            specialCodes: scale.specialCodes || []
        }
    };
};

export const buildClassSBRReports = async ({
    schoolId,
    classId,
    period,
    academicYear,
    generatedBy
}) => {
    const students = await Student.find({
        school: schoolId,
        currentClass: classId,
        status: { $ne: 'inactive' }
    })
        .select('firstName lastName studentId')
        .sort({ firstName: 1, lastName: 1 })
        .lean();

    const preAllocatedIds = await generateReportCardIds(schoolId, students.length);
    const reports = [];

    for (let i = 0; i < students.length; i += 1) {
        const student = students[i];
        const report = await buildSBRReportData({
            schoolId,
            studentId: student._id,
            classId,
            period,
            academicYear,
            generatedBy,
            reportCardId: preAllocatedIds[i]
        });
        reports.push(report);
    }

    return reports;
};
