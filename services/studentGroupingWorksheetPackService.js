import Class from '../models/Class.js';
import Standard from '../models/Standard.js';
import GroupingWorksheetPack from '../models/GroupingWorksheetPack.js';
import studentGroupingService from './studentGroupingService.js';

const REPORT_LEVELS = studentGroupingService.LEVELS_ORDERED;

const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const throwHttpError = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
};

const buildWorksheetPrompt = ({ activity, levelLabel }) => {
    const type = String(activity?.type || 'activity').trim();
    const title = String(activity?.title || '').trim();
    const description = String(activity?.description || '').trim();

    return [
        `${title || 'Activity'} (${type})`,
        `Level focus: ${levelLabel}`,
        description
    ]
        .filter(Boolean)
        .join(' - ');
};

const buildTeacherInstructions = ({ standardMeta, sections }) => {
    const facilitationSteps = [];
    const differentiation = [];

    for (const section of sections) {
        facilitationSteps.push(
            `Introduce ${section.levelLabel} group goal and model one example before independent work.`
        );

        differentiation.push(
            `${section.levelLabel}: Use ${Math.max(1, section.activities.length)} activity prompt(s) with scaffolding based on student readiness.`
        );
    }

    return {
        objective: `Students practice ${standardMeta.code || 'target standard'} through differentiated tasks by mastery level.`,
        materials: 'Worksheet handouts, pencils, whiteboard, optional manipulative supports.',
        timeEstimateMinutes: 35,
        facilitationSteps,
        differentiation,
        closure: 'Use exit ticket reflection to identify remaining misconceptions before next lesson.'
    };
};

const buildAnswerKey = ({ sections }) => {
    const sampleAnswers = [];

    for (const section of sections) {
        for (const activity of section.activities) {
            sampleAnswers.push({
                level: section.level,
                activityTitle: activity.title,
                successCriteria: [
                    'Uses the target skill correctly in context.',
                    'Explains reasoning with at least one complete sentence.',
                    'Completes task requirements with accurate vocabulary.'
                ]
            });
        }
    }

    return {
        rubricNotes: [
            'Award full credit when student response demonstrates target skill and clear reasoning.',
            'Award partial credit when reasoning is present but contains one conceptual or language error.',
            'Use re-teach prompts for below-level misconceptions before reassessment.'
        ],
        sampleAnswers
    };
};

const buildPackMetadata = ({ groups, notStarted }) => {
    const levelCounts = {
        advanced: groups.find((item) => item.level === 'advanced')?.students?.length || 0,
        proficient: groups.find((item) => item.level === 'proficient')?.students?.length || 0,
        approaching: groups.find((item) => item.level === 'approaching')?.students?.length || 0,
        below: groups.find((item) => item.level === 'below')?.students?.length || 0,
        notStarted: notStarted.length
    };

    const totalActivities = groups.reduce(
        (acc, item) => acc + (Array.isArray(item?.suggestedActivities) ? item.suggestedActivities.length : 0),
        0
    );

    const totalStudents = Object.values(levelCounts).reduce((acc, value) => acc + toFiniteNumber(value), 0);

    return {
        totalStudents,
        totalActivities,
        levelCounts
    };
};

const buildSections = ({ groups, notStarted, levelLabels }) => {
    const sections = [];

    for (const level of REPORT_LEVELS) {
        const group = groups.find((item) => item.level === level);
        if (!group) continue;

        const students = Array.isArray(group.students) ? group.students : [];
        const activities = Array.isArray(group.suggestedActivities) ? group.suggestedActivities : [];
        const levelLabel = group.label || levelLabels?.[level] || studentGroupingService.LEVEL_LABELS[level] || level;

        if (students.length === 0 && activities.length === 0) {
            continue;
        }

        sections.push({
            level,
            levelLabel,
            studentCount: students.length,
            targetStudents: students.slice(0, 12).map((student) => student.name),
            activities: activities.map((activity, index) => ({
                id: `${level}-${index + 1}`,
                title: String(activity?.title || `Activity ${index + 1}`).trim(),
                type: String(activity?.type || 'activity').trim(),
                description: String(activity?.description || '').trim(),
                materials: String(activity?.materials || 'none').trim(),
                studentTask: buildWorksheetPrompt({ activity, levelLabel })
            }))
        });
    }

    if (notStarted.length > 0) {
        sections.push({
            level: 'notStarted',
            levelLabel: 'Not Started Support Group',
            studentCount: notStarted.length,
            targetStudents: notStarted.slice(0, 12).map((student) => student.name),
            activities: [
                {
                    id: 'not-started-1',
                    title: 'Diagnostic Warm-Up',
                    type: 'foundational',
                    description: 'Quick check prompts to identify prerequisite gaps before group work.',
                    materials: 'none',
                    studentTask: 'Complete the starter questions and discuss one strategy with your teacher.'
                }
            ]
        });
    }

    return sections;
};

const buildGroupingDetailData = async ({ classId, standardId, academicYear, schoolId, userId }) => {
    const { groups, notStarted, levelLabels } = await studentGroupingService.computeGroups({
        classId,
        standardId,
        academicYear,
        schoolId
    });

    const activitiesByLevel = {};
    for (const level of REPORT_LEVELS) {
        activitiesByLevel[level] = await studentGroupingService.getActivitiesForLevel({
            standardId,
            level,
            schoolId,
            userId
        });
    }

    const grouped = REPORT_LEVELS.map((level) => ({
        level,
        label: levelLabels?.[level] || studentGroupingService.LEVEL_LABELS[level],
        students: groups[level] || [],
        suggestedActivities: activitiesByLevel[level] || []
    }));

    return {
        groups: grouped,
        notStarted,
        levelLabels: levelLabels || studentGroupingService.LEVEL_LABELS
    };
};

export const createWorksheetPackDraft = async ({
    classId,
    standardId,
    academicYear,
    schoolId,
    userId,
    title,
    language = 'en'
}) => {
    const [classDoc, standardDoc] = await Promise.all([
        Class.findOne({ _id: classId, school: schoolId })
            .select('name grade section academicYear')
            .lean(),
        Standard.findOne({ _id: standardId, school: schoolId })
            .select('code name description gradeLevel subject')
            .populate('subject', 'name code')
            .lean()
    ]);

    if (!classDoc) {
        throwHttpError('Class not found', 404);
    }

    if (!standardDoc) {
        throwHttpError('Standard not found', 404);
    }

    const resolvedAcademicYear = String(academicYear || classDoc.academicYear || '').trim();

    const { groups, notStarted, levelLabels } = await buildGroupingDetailData({
        classId,
        standardId,
        academicYear: resolvedAcademicYear,
        schoolId,
        userId
    });

    const sections = buildSections({ groups, notStarted, levelLabels });
    const standardMeta = {
        code: standardDoc.code || '',
        name: standardDoc.name || '',
        description: standardDoc.description || '',
        gradeLevel: standardDoc.gradeLevel,
        subjectName: standardDoc.subject?.name || '',
        subjectCode: standardDoc.subject?.code || ''
    };

    const snapshot = {
        generatedAt: new Date(),
        language: language === 'ar' ? 'ar' : 'en',
        classMeta: {
            className: classDoc.name || '',
            grade: classDoc.grade,
            section: classDoc.section || ''
        },
        academicYear: resolvedAcademicYear,
        standardMeta,
        title: String(title || '').trim(),
        sections,
        notStarted: notStarted.map((student) => ({
            studentId: student.studentId,
            name: student.name,
            masteryPercentage: toFiniteNumber(student.masteryPercentage),
            totalAttempts: toFiniteNumber(student.totalAttempts)
        })),
        studentWorksheet: {
            headerFields: {
                showNameLine: true,
                showDateLine: true,
                showClassLine: true
            },
            directions: 'Complete the level activities assigned by your teacher. Show reasoning and use complete sentences where required.',
            responseLineCount: 6,
            includeWorkBox: true
        },
        teacherInstructions: buildTeacherInstructions({ standardMeta, sections }),
        answerKey: buildAnswerKey({ sections })
    };

    const metadata = buildPackMetadata({ groups, notStarted });

    const resolvedTitle = String(title || '').trim()
        || `Grouping Activities Pack - ${standardMeta.code || standardMeta.name || 'Standard'}`;

    return GroupingWorksheetPack.create({
        school: schoolId,
        class: classId,
        standard: standardId,
        subject: standardDoc.subject?._id || null,
        academicYear: resolvedAcademicYear,
        title: resolvedTitle,
        language: snapshot.language,
        status: 'draft',
        version: 1,
        snapshot,
        metadata,
        generatedBy: userId
    });
};

export const listWorksheetPacks = async ({
    classId,
    standardId,
    schoolId,
    academicYear,
    page = 1,
    limit = 10
}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));

    const query = {
        school: schoolId,
        class: classId,
        standard: standardId
    };

    const year = String(academicYear || '').trim();
    if (year) {
        query.academicYear = year;
    }

    const [items, total] = await Promise.all([
        GroupingWorksheetPack.find(query)
            .sort({ createdAt: -1 })
            .skip((safePage - 1) * safeLimit)
            .limit(safeLimit)
            .populate('generatedBy', 'firstName lastName name email')
            .lean(),
        GroupingWorksheetPack.countDocuments(query)
    ]);

    return {
        items,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit)
        }
    };
};

export const getWorksheetPackById = async ({ packId, schoolId }) => {
    return GroupingWorksheetPack.findOne({ _id: packId, school: schoolId })
        .populate('generatedBy', 'firstName lastName name email')
        .populate('authoringEndedBy', 'firstName lastName name email')
        .populate('publishedBy', 'firstName lastName name email')
        .populate('class', 'name grade section')
        .populate('standard', 'code name description gradeLevel')
        .populate('subject', 'name code')
        .lean();
};

export const endWorksheetPackAuthoring = async ({ packId, schoolId, userId }) => {
    const pack = await GroupingWorksheetPack.findOne({ _id: packId, school: schoolId });
    if (!pack) {
        throwHttpError('Worksheet pack not found', 404);
    }

    if (pack.status !== 'draft') {
        throwHttpError('Only draft worksheet packs can be ended', 409);
    }

    pack.status = 'ended';
    pack.authoringEndedAt = new Date();
    pack.authoringEndedBy = userId;
    await pack.save();

    return pack;
};

export const publishWorksheetPack = async ({ packId, schoolId, userId }) => {
    const pack = await GroupingWorksheetPack.findOne({ _id: packId, school: schoolId });
    if (!pack) {
        throwHttpError('Worksheet pack not found', 404);
    }

    if (pack.status !== 'ended') {
        throwHttpError('Only ended worksheet packs can be published', 409);
    }

    pack.status = 'published';
    pack.publishedAt = new Date();
    pack.publishedBy = userId;
    await pack.save();

    return pack;
};

export const assertWorksheetPackDistributionAllowed = (pack) => {
    if (!pack) {
        throwHttpError('Worksheet pack not found', 404);
    }

    if (pack.status !== 'ended' && pack.status !== 'published') {
        throwHttpError('End authoring before downloading or printing this worksheet pack', 409);
    }
};

export const toWorksheetPackListItem = (pack) => {
    const generatedByName = `${pack?.generatedBy?.firstName || ''} ${pack?.generatedBy?.lastName || ''}`.trim()
        || String(pack?.generatedBy?.name || '').trim()
        || String(pack?.generatedBy?.email || '').trim()
        || '-';
    const responseLineCount = Math.max(3, Math.min(12, Number(pack?.snapshot?.studentWorksheet?.responseLineCount || 6)));
    const includeWorkBox = pack?.snapshot?.studentWorksheet?.includeWorkBox !== false;

    return {
        id: pack._id,
        title: pack.title || '',
        status: pack.status,
        academicYear: pack.academicYear || '',
        version: toFiniteNumber(pack.version, 1),
        language: pack.language || 'en',
        metadata: pack.metadata || {},
        generatedAt: pack.createdAt,
        generatedBy: {
            id: pack?.generatedBy?._id || pack?.generatedBy,
            name: generatedByName
        },
        worksheetLayout: {
            responseLineCount,
            includeWorkBox
        },
        authoringEndedAt: pack.authoringEndedAt || null,
        publishedAt: pack.publishedAt || null
    };
};

export const toWorksheetPackDetail = (pack) => {
    if (!pack) return null;

    return {
        id: pack._id,
        title: pack.title || '',
        status: pack.status,
        academicYear: pack.academicYear || '',
        version: toFiniteNumber(pack.version, 1),
        language: pack.language || 'en',
        metadata: pack.metadata || {},
        snapshot: pack.snapshot || {},
        class: pack.class
            ? {
                id: pack.class?._id || pack.class,
                name: pack.class?.name || '',
                grade: pack.class?.grade,
                section: pack.class?.section || ''
            }
            : null,
        standard: pack.standard
            ? {
                id: pack.standard?._id || pack.standard,
                code: pack.standard?.code || '',
                name: pack.standard?.name || '',
                description: pack.standard?.description || '',
                gradeLevel: pack.standard?.gradeLevel
            }
            : null,
        subject: pack.subject
            ? {
                id: pack.subject?._id || pack.subject,
                name: pack.subject?.name || '',
                code: pack.subject?.code || ''
            }
            : null,
        generatedAt: pack.createdAt,
        authoringEndedAt: pack.authoringEndedAt || null,
        publishedAt: pack.publishedAt || null
    };
};

export default {
    createWorksheetPackDraft,
    listWorksheetPacks,
    getWorksheetPackById,
    endWorksheetPackAuthoring,
    publishWorksheetPack,
    assertWorksheetPackDistributionAllowed,
    toWorksheetPackListItem,
    toWorksheetPackDetail
};
