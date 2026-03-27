import { asyncHandler } from '../middleware/errorHandler.js';
import studentGroupingService from '../services/studentGroupingService.js';
import School from '../models/School.js';
import Class from '../models/Class.js';
import Standard from '../models/Standard.js';
import Subject from '../models/Subject.js';
import GroupingReport from '../models/GroupingReport.js';
import {
    generateStudentGroupingStandardPdf,
    generateStudentGroupingOverviewPdf
} from '../services/studentGroupingPdfService.js';
import { uploadPrivateFile, downloadFile } from '../services/firebaseStorageService.js';
import logger from '../utils/logger.js';
import { normalizeStudentGroupingReportSettings } from '../utils/studentGroupingReportSettings.js';

const REPORT_LEVELS = studentGroupingService.LEVELS_ORDERED;

const toSlug = (value, fallback = 'report') => {
    const normalized = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || fallback;
};

const resolveLanguage = ({ requestedLanguage, schoolDefaultLanguage }) => {
    const explicit = String(requestedLanguage || '').trim().toLowerCase();
    if (explicit === 'ar' || explicit === 'en') return explicit;

    const schoolLanguage = String(schoolDefaultLanguage || '').trim().toLowerCase();
    if (schoolLanguage === 'arabic') return 'ar';
    return 'en';
};

const resolveTeacherName = (user) => {
    const composed = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    if (composed) return composed;

    const directName = String(user?.name || '').trim();
    if (directName) return directName;

    return 'Teacher';
};

const GROUPING_REPORT_TYPES = new Set(['per-standard', 'class-overview']);

const getYearToken = (value) => String(value || 'unknown-year').replace(/[^0-9-]/g, '') || 'unknown-year';

const parsePagination = (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    return { page, limit };
};

const resolveReporterName = (user) => {
    const composed = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    if (composed) return composed;
    const directName = String(user?.name || '').trim();
    if (directName) return directName;
    return String(user?.email || '').trim() || 'Teacher';
};

const buildGroupingStoragePath = ({ schoolId, academicYear, classId, reportType, fileName }) => {
    const yearToken = getYearToken(academicYear);
    const classToken = toSlug(classId, 'class');
    const typeToken = toSlug(reportType, 'report');
    return `schools/${schoolId}/student-grouping/${yearToken}/${classToken}/${typeToken}/${fileName}`;
};

const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const buildStandardReportMetadata = (reportPayload) => {
    const groups = Array.isArray(reportPayload?.groups) ? reportPayload.groups : [];
    const notStarted = Array.isArray(reportPayload?.notStarted) ? reportPayload.notStarted : [];

    const levelCounts = {
        advanced: groups.find((item) => item.level === 'advanced')?.students?.length || 0,
        proficient: groups.find((item) => item.level === 'proficient')?.students?.length || 0,
        approaching: groups.find((item) => item.level === 'approaching')?.students?.length || 0,
        below: groups.find((item) => item.level === 'below')?.students?.length || 0,
        notStarted: notStarted.length
    };

    const masteryValues = groups.flatMap((group) =>
        (Array.isArray(group?.students) ? group.students : []).map((student) => toFiniteNumber(student?.masteryPercentage))
    );

    const totalStudents = Object.values(levelCounts).reduce((acc, count) => acc + toFiniteNumber(count), 0);
    const averageMastery = masteryValues.length > 0
        ? Math.round(masteryValues.reduce((acc, value) => acc + value, 0) / masteryValues.length)
        : 0;

    return {
        totalStudents,
        totalStandards: 1,
        levelCounts,
        averageMastery
    };
};

const buildOverviewReportMetadata = (reportPayload) => {
    const rows = Array.isArray(reportPayload?.overviewRows) ? reportPayload.overviewRows : [];
    const totalStudents = toFiniteNumber(reportPayload?.totalStudents);
    const totalStandards = rows.length;

    const levelCounts = rows.reduce(
        (acc, row) => {
            acc.advanced += toFiniteNumber(row?.counts?.advanced);
            acc.proficient += toFiniteNumber(row?.counts?.proficient);
            acc.approaching += toFiniteNumber(row?.counts?.approaching);
            acc.below += toFiniteNumber(row?.counts?.below);
            acc.notStarted += toFiniteNumber(row?.counts?.notStarted);
            return acc;
        },
        {
            advanced: 0,
            proficient: 0,
            approaching: 0,
            below: 0,
            notStarted: 0
        }
    );

    const averageMastery = toFiniteNumber(reportPayload?.averageMastery);

    return {
        totalStudents,
        totalStandards,
        levelCounts,
        averageMastery
    };
};

const archiveGroupingReport = async ({
    schoolId,
    classDoc,
    standardDoc,
    subjectDoc,
    academicYear,
    reportType,
    reportPayload,
    pdfBuffer,
    generatedBy,
    fileName
}) => {
    const storagePath = buildGroupingStoragePath({
        schoolId,
        academicYear,
        classId: classDoc?._id,
        reportType,
        fileName
    });

    const uploaded = await uploadPrivateFile(pdfBuffer, 'application/pdf', storagePath);
    const metadata = reportType === 'class-overview'
        ? buildOverviewReportMetadata(reportPayload)
        : buildStandardReportMetadata(reportPayload);

    return GroupingReport.create({
        school: schoolId,
        class: classDoc?._id,
        standard: standardDoc?._id || null,
        subject: subjectDoc?._id || standardDoc?.subject?._id || null,
        academicYear: String(academicYear || ''),
        reportType,
        generatedBy,
        generatedAt: new Date(),
        snapshot: reportPayload,
        fileName,
        fileRef: uploaded.fileRef,
        fileSize: Buffer.byteLength(pdfBuffer),
        status: 'ready',
        isArchived: true,
        archivedBy: generatedBy,
        metadata
    });
};

const toGroupingReportListItem = (report) => ({
    id: report._id,
    reportType: report.reportType,
    classId: report.class?._id || report.class,
    className: report.class?.name || '',
    academicYear: report.academicYear,
    generatedAt: report.generatedAt,
    generatedBy: {
        id: report.generatedBy?._id || report.generatedBy,
        name: resolveReporterName(report.generatedBy),
        email: report.generatedBy?.email || ''
    },
    fileName: report.fileName || '',
    fileSize: toFiniteNumber(report.fileSize),
    standard: report.standard
        ? {
            id: report.standard?._id || report.standard,
            code: report.standard?.code || '',
            name: report.standard?.name || ''
        }
        : null,
    subject: report.subject
        ? {
            id: report.subject?._id || report.subject,
            name: report.subject?.name || '',
            code: report.subject?.code || ''
        }
        : null,
    metadata: report.metadata || {}
});

const buildOverviewPayload = ({ overviewRows, classDoc, academicYear, subjectName }) => {
    const rows = Array.isArray(overviewRows) ? overviewRows : [];
    const totalStandards = rows.length;
    const totalStudents = toFiniteNumber(rows[0]?.totalStudents);

    const aggregate = rows.reduce(
        (acc, row) => {
            acc.advanced += toFiniteNumber(row?.counts?.advanced);
            acc.proficient += toFiniteNumber(row?.counts?.proficient);
            acc.approaching += toFiniteNumber(row?.counts?.approaching);
            acc.below += toFiniteNumber(row?.counts?.below);
            acc.notStarted += toFiniteNumber(row?.counts?.notStarted);
            return acc;
        },
        {
            advanced: 0,
            proficient: 0,
            approaching: 0,
            below: 0,
            notStarted: 0
        }
    );

    const masteryRatios = rows
        .filter((row) => toFiniteNumber(row?.totalStudents) > 0)
        .map((row) => {
            const started = toFiniteNumber(row?.counts?.advanced)
                + toFiniteNumber(row?.counts?.proficient)
                + toFiniteNumber(row?.counts?.approaching)
                + toFiniteNumber(row?.counts?.below);
            if (started <= 0) return 0;

            const mastered = toFiniteNumber(row?.counts?.advanced) + toFiniteNumber(row?.counts?.proficient);
            return (mastered / started) * 100;
        });

    const averageMastery = masteryRatios.length > 0
        ? Math.round(masteryRatios.reduce((sum, value) => sum + value, 0) / masteryRatios.length)
        : 0;

    const rankedByNeed = [...rows].sort((a, b) => {
        const aScore = toFiniteNumber(a?.counts?.below) + toFiniteNumber(a?.counts?.notStarted);
        const bScore = toFiniteNumber(b?.counts?.below) + toFiniteNumber(b?.counts?.notStarted);
        return bScore - aScore;
    });

    const rankedByStrength = [...rows].sort((a, b) => {
        const aScore = toFiniteNumber(a?.counts?.advanced) + toFiniteNumber(a?.counts?.proficient);
        const bScore = toFiniteNumber(b?.counts?.advanced) + toFiniteNumber(b?.counts?.proficient);
        return bScore - aScore;
    });

    return {
        generatedAt: new Date(),
        academicYear: academicYear || classDoc?.academicYear || '',
        classMeta: {
            className: classDoc?.name || '',
            grade: classDoc?.grade,
            section: classDoc?.section || ''
        },
        subjectName: subjectName || '',
        levelLabels: rows[0]?.levelLabels || studentGroupingService.LEVEL_LABELS,
        totalStandards,
        totalStudents,
        totalNotStarted: aggregate.notStarted,
        averageMastery,
        overviewRows: rows,
        topIntervention: rankedByNeed.slice(0, 5),
        topStrong: rankedByStrength.slice(0, 5)
    };
};

const resolveGroupingReportConfig = (schoolDoc) =>
    normalizeStudentGroupingReportSettings(schoolDoc?.settings?.studentGroupingReports);

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

    const result = REPORT_LEVELS.map((level) => ({
        level,
        label: levelLabels?.[level] || studentGroupingService.LEVEL_LABELS[level],
        students: groups[level] || [],
        suggestedActivities: activitiesByLevel[level] || []
    }));

    return {
        groups: result,
        notStarted,
        levelLabels: levelLabels || studentGroupingService.LEVEL_LABELS
    };
};

/* ─── GET /api/student-grouping/:classId/:standardId ─────────────────── */

export const getStudentGroups = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const academicYear = req.query.academicYear || '';

    const { groups, notStarted, levelLabels } = await buildGroupingDetailData({
        classId,
        standardId,
        academicYear,
        schoolId: req.schoolId,
        userId: req.user._id
    });

    res.json({
        success: true,
        data: {
            groups,
            notStarted,
            levelLabels
        }
    });
});

/* ─── GET /api/student-grouping/:classId/:standardId/export-pdf ─────── */

export const exportStudentGroupingPdf = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const academicYear = req.query.academicYear || '';

    const [schoolDoc, classDoc, standardDoc] = await Promise.all([
        School.findById(req.schoolId)
            .select('name settings.branding settings.studentGroupingReports reportSettings.defaultLanguage contact.phone contact.adminEmail')
            .lean(),
        Class.findOne({ _id: classId, school: req.schoolId })
            .select('name grade section academicYear')
            .lean(),
        Standard.findOne({ _id: standardId, school: req.schoolId })
            .select('code name description gradeLevel subject')
            .populate('subject', 'name code')
            .lean()
    ]);

    if (!classDoc) {
        return res.status(404).json({ success: false, message: 'Class not found' });
    }

    if (!standardDoc) {
        return res.status(404).json({ success: false, message: 'Standard not found' });
    }

    const { groups, notStarted, levelLabels } = await buildGroupingDetailData({
        classId,
        standardId,
        academicYear,
        schoolId: req.schoolId,
        userId: req.user._id
    });

    const language = resolveLanguage({
        requestedLanguage: req.query.language,
        schoolDefaultLanguage: schoolDoc?.reportSettings?.defaultLanguage
    });
    const reportConfig = resolveGroupingReportConfig(schoolDoc);

    const reportPayload = {
        generatedAt: new Date(),
        academicYear: academicYear || classDoc.academicYear || '',
        classMeta: {
            className: classDoc.name || '',
            grade: classDoc.grade,
            section: classDoc.section || ''
        },
        standardMeta: {
            code: standardDoc.code || '',
            name: standardDoc.name || '',
            description: standardDoc.description || '',
            gradeLevel: standardDoc.gradeLevel,
            subjectName: standardDoc.subject?.name || '',
            subjectCode: standardDoc.subject?.code || ''
        },
        levelLabels,
        groups,
        notStarted
    };

    const branding = {
        schoolName: schoolDoc?.name || '',
        schoolLogo: schoolDoc?.settings?.branding?.logoUrl || '',
        primaryColor: schoolDoc?.settings?.branding?.primaryColor || '#1f3c88',
        secondaryColor: schoolDoc?.settings?.branding?.secondaryColor || '#37517e',
        schoolPhone: schoolDoc?.contact?.phone || '',
        teacherName: resolveTeacherName(req.user)
    };

    const pdfData = await generateStudentGroupingStandardPdf(reportPayload, branding, {
        language,
        reportConfig
    });
    const pdfBuffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

    const classToken = toSlug(classDoc.name || `grade-${classDoc.grade || 'class'}`, 'class');
    const standardToken = toSlug(standardDoc.code || standardDoc.name || 'standard', 'standard');
    const yearToken = toSlug(academicYear || classDoc.academicYear || 'year', 'year');
    const filename = `student-grouping-${classToken}-${standardToken}-${yearToken}.pdf`;

    try {
        await archiveGroupingReport({
            schoolId: req.schoolId,
            classDoc,
            standardDoc,
            subjectDoc: standardDoc?.subject || null,
            academicYear: academicYear || classDoc.academicYear || '',
            reportType: 'per-standard',
            reportPayload,
            pdfBuffer,
            generatedBy: req.user._id,
            fileName: filename
        });
    } catch (archiveError) {
        logger.warn('Failed to archive per-standard grouping report', {
            schoolId: req.schoolId,
            classId,
            standardId,
            error: archiveError?.message
        });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(pdfBuffer);
});

/* ─── PUT /api/student-grouping/:classId/:standardId/override ────────── */

export const saveGroupingOverride = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const { studentId, overrideLevel, reason } = req.body;
    const academicYear = req.body.academicYear || req.query.academicYear || '';

    if (!studentId || !overrideLevel) {
        const error = new Error('studentId and overrideLevel are required');
        error.statusCode = 400;
        throw error;
    }

    const validLevels = ['advanced', 'proficient', 'approaching', 'below'];
    if (!validLevels.includes(overrideLevel)) {
        const error = new Error('overrideLevel must be one of: advanced, proficient, approaching, below');
        error.statusCode = 400;
        throw error;
    }

    const override = await studentGroupingService.saveOverride({
        classId,
        standardId,
        studentId,
        overrideLevel,
        reason,
        teacherId: req.user._id,
        academicYear,
        schoolId: req.schoolId
    });

    res.json({
        success: true,
        data: { override }
    });
});

/* ─── GET /api/student-grouping/:classId/overview ────────────────────── */

export const getGroupingOverview = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const academicYear = req.query.academicYear || '';
    const subjectId = req.query.subjectId || '';

    const overview = await studentGroupingService.computeOverview({
        classId,
        academicYear,
        subjectId,
        schoolId: req.schoolId
    });

    res.json({
        success: true,
        data: { overview }
    });
});

/* ─── GET /api/student-grouping/:classId/export-overview-pdf ─────────── */

export const exportGroupingOverviewPdf = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const academicYear = req.query.academicYear || '';
    const subjectId = req.query.subjectId || '';

    const [schoolDoc, classDoc, subjectDoc] = await Promise.all([
        School.findById(req.schoolId)
            .select('name settings.branding settings.studentGroupingReports reportSettings.defaultLanguage contact.phone contact.adminEmail')
            .lean(),
        Class.findOne({ _id: classId, school: req.schoolId })
            .select('name grade section academicYear')
            .lean(),
        subjectId
            ? Subject.findOne({ _id: subjectId, school: req.schoolId }).select('name code').lean()
            : Promise.resolve(null)
    ]);

    if (!classDoc) {
        return res.status(404).json({ success: false, message: 'Class not found' });
    }

    if (subjectId && !subjectDoc) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const overview = await studentGroupingService.computeOverview({
        classId,
        academicYear,
        subjectId,
        schoolId: req.schoolId
    });

    const reportPayload = buildOverviewPayload({
        overviewRows: overview,
        classDoc,
        academicYear,
        subjectName: subjectDoc?.name || 'All Subjects'
    });

    const language = resolveLanguage({
        requestedLanguage: req.query.language,
        schoolDefaultLanguage: schoolDoc?.reportSettings?.defaultLanguage
    });
    const reportConfig = resolveGroupingReportConfig(schoolDoc);

    const branding = {
        schoolName: schoolDoc?.name || '',
        schoolLogo: schoolDoc?.settings?.branding?.logoUrl || '',
        primaryColor: schoolDoc?.settings?.branding?.primaryColor || '#1f3c88',
        secondaryColor: schoolDoc?.settings?.branding?.secondaryColor || '#37517e',
        schoolPhone: schoolDoc?.contact?.phone || '',
        teacherName: resolveTeacherName(req.user)
    };

    const pdfData = await generateStudentGroupingOverviewPdf(reportPayload, branding, {
        language,
        reportConfig
    });
    const pdfBuffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

    const classToken = toSlug(classDoc.name || `grade-${classDoc.grade || 'class'}`, 'class');
    const subjectToken = toSlug(subjectDoc?.code || subjectDoc?.name || 'all-subjects', 'all-subjects');
    const yearToken = toSlug(academicYear || classDoc.academicYear || 'year', 'year');
    const filename = `student-grouping-overview-${classToken}-${subjectToken}-${yearToken}.pdf`;

    try {
        await archiveGroupingReport({
            schoolId: req.schoolId,
            classDoc,
            standardDoc: null,
            subjectDoc,
            academicYear: academicYear || classDoc.academicYear || '',
            reportType: 'class-overview',
            reportPayload,
            pdfBuffer,
            generatedBy: req.user._id,
            fileName: filename
        });
    } catch (archiveError) {
        logger.warn('Failed to archive grouping overview report', {
            schoolId: req.schoolId,
            classId,
            subjectId,
            error: archiveError?.message
        });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(pdfBuffer);
});

/* ─── GET /api/student-grouping/:classId/reports ─────────────────────── */

export const getGroupingReports = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { page, limit } = parsePagination(req.query);
    const reportType = String(req.query.reportType || '').trim();

    const query = {
        school: req.schoolId,
        class: classId,
        isArchived: true,
        status: 'ready'
    };

    if (req.query.academicYear) {
        query.academicYear = String(req.query.academicYear || '').trim();
    }

    if (reportType) {
        if (!GROUPING_REPORT_TYPES.has(reportType)) {
            return res.status(400).json({
                success: false,
                message: `reportType must be one of: ${[...GROUPING_REPORT_TYPES].join(', ')}`
            });
        }
        query.reportType = reportType;
    }

    if (req.query.subjectId) {
        query.subject = req.query.subjectId;
    }

    const [items, total] = await Promise.all([
        GroupingReport.find(query)
            .sort({ generatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('generatedBy', 'firstName lastName name email')
            .populate('class', 'name grade section')
            .populate('standard', 'code name')
            .populate('subject', 'name code')
            .lean(),
        GroupingReport.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: {
            items: items.map(toGroupingReportListItem),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

/* ─── GET /api/student-grouping/reports/:reportId/download ───────────── */

export const downloadGroupingReport = asyncHandler(async (req, res) => {
    const { reportId } = req.params;

    const report = await GroupingReport.findOne({
        _id: reportId,
        school: req.schoolId,
        isArchived: true
    }).lean();

    if (!report) {
        return res.status(404).json({ success: false, message: 'Grouping report not found' });
    }

    if (!report.fileRef) {
        return res.status(404).json({ success: false, message: 'Archived report file is not available' });
    }

    const file = await downloadFile(report.fileRef);
    const pdfBuffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
    const filename = report.fileName || `student-grouping-${toSlug(report.reportType || 'report', 'report')}.pdf`;

    res.setHeader('Content-Type', file.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(pdfBuffer);
});

/* ─── POST /api/student-grouping/:classId/:standardId/refresh-activities  */

export const refreshGroupActivities = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const level = req.body.level || req.query.level;

    const validLevels = ['advanced', 'proficient', 'approaching', 'below'];
    const levelsToRefresh = level && validLevels.includes(level) ? [level] : validLevels;

    const activitiesByLevel = {};
    for (const lvl of levelsToRefresh) {
        activitiesByLevel[lvl] = await studentGroupingService.getActivitiesForLevel({
            standardId,
            level: lvl,
            schoolId: req.schoolId,
            userId: req.user._id,
            forceRefresh: true
        });
    }

    res.json({
        success: true,
        data: { activities: activitiesByLevel }
    });
});
