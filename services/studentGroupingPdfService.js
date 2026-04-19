import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import { normalizeStudentGroupingReportSettings } from '../utils/studentGroupingReportSettings.js';
import { resolvePuppeteerExecutablePath } from '../utils/resolvePuppeteerExecutablePath.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATHS = {
    standard: path.resolve(__dirname, '../templates/student-grouping-standard-report.html'),
    overview: path.resolve(__dirname, '../templates/student-grouping-overview-report.html'),
    worksheetPack: path.resolve(__dirname, '../templates/student-grouping-worksheet-pack.html')
};

let browserPromise = null;
const compiledTemplatePromises = new Map();

const getBrowser = async () => {
    if (!browserPromise) {
        browserPromise = (async () => {
            const executablePath = await resolvePuppeteerExecutablePath();

            if (!executablePath) {
                throw new Error('No compatible Chromium executable found for Puppeteer. Ensure the deployment build runs "npx puppeteer browsers install chrome".');
            }

            return puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                executablePath
            });
        })().catch((error) => {
            browserPromise = null;
            throw error;
        });
    }

    return browserPromise;
};

const getTemplate = async (templateType = 'standard') => {
    const templatePath = TEMPLATE_PATHS[templateType] || TEMPLATE_PATHS.standard;

    if (!compiledTemplatePromises.has(templateType)) {
        compiledTemplatePromises.set(
            templateType,
            fs.readFile(templatePath, 'utf8').then((raw) => Handlebars.compile(raw))
        );
    }

    return compiledTemplatePromises.get(templateType);
};

const getLabels = (isArabic) => {
    if (!isArabic) {
        return {
            reportTitle: 'Student Grouping Report',
            reportSubtitle: 'Per-Standard Performance Snapshot',
            generatedAt: 'Generated At',
            academicYear: 'Academic Year',
            classLabel: 'Class',
            standardLabel: 'Standard',
            subjectLabel: 'Subject',
            gradeLevelLabel: 'Grade Level',
            teacherLabel: 'Teacher',
            distributionLabel: 'Distribution',
            studentName: 'Student',
            masteryPercentage: 'Mastery %',
            trend: 'Trend',
            totalAttempts: 'Attempts',
            overrideStatus: 'Override',
            noOverride: 'No',
            overridden: 'Yes',
            staleOverride: 'Stale',
            activitiesLabel: 'Suggested Activities',
            noStudents: 'No students in this group.',
            notStartedLabel: 'Not Started Students',
            noNotStarted: 'No students in not started status.',
            noActivities: 'No activities available.',
            trendImproving: 'Improving',
            trendDeclining: 'Declining',
            trendStable: 'Stable',
            totalStudents: 'Total Students',
            startedStudents: 'Started',
            totalStandards: 'Total Standards',
            averageMastery: 'Average Mastery',
            notStarted: 'Not Started',
            heatmapTitle: 'Standards Distribution Overview',
            topNeedIntervention: 'Top Standards Needing Intervention',
            topStrongStandards: 'Top Strong Standards',
            advanced: 'Advanced',
            proficient: 'Proficient',
            approaching: 'Approaching',
            below: 'Below Grade Level',
            studentsHiddenBySettings: 'Student rows are hidden by school report settings.'
        };
    }

    return {
        reportTitle: 'تقرير تجميع الطلاب',
        reportSubtitle: 'لقطة أداء حسب المعيار',
        generatedAt: 'تاريخ الإصدار',
        academicYear: 'العام الدراسي',
        classLabel: 'الفصل',
        standardLabel: 'المعيار',
        subjectLabel: 'المادة',
        gradeLevelLabel: 'الصف',
        teacherLabel: 'المعلم',
        distributionLabel: 'التوزيع',
        studentName: 'الطالب',
        masteryPercentage: 'نسبة الإتقان',
        trend: 'الاتجاه',
        totalAttempts: 'المحاولات',
        overrideStatus: 'تعديل المعلم',
        noOverride: 'لا',
        overridden: 'نعم',
        staleOverride: 'بحاجة لمراجعة',
        activitiesLabel: 'أنشطة مقترحة',
        noStudents: 'لا يوجد طلاب في هذا المستوى.',
        notStartedLabel: 'طلاب لم يبدأوا',
        noNotStarted: 'لا يوجد طلاب في حالة لم يبدأ.',
        noActivities: 'لا توجد أنشطة متاحة.',
        trendImproving: 'تحسن',
        trendDeclining: 'تراجع',
        trendStable: 'مستقر',
        totalStudents: 'إجمالي الطلاب',
        startedStudents: 'الطلاب الذين بدأوا',
        totalStandards: 'إجمالي المعايير',
        averageMastery: 'متوسط الإتقان',
        notStarted: 'لم يبدأ',
        heatmapTitle: 'نظرة عامة على توزيع المعايير',
        topNeedIntervention: 'أعلى المعايير التي تحتاج تدخلاً',
        topStrongStandards: 'أقوى المعايير',
        advanced: 'متقدم',
        proficient: 'متقن',
        approaching: 'قريب من الإتقان',
        below: 'أقل من المتوقع',
        studentsHiddenBySettings: 'صفوف الطلاب مخفية وفق إعدادات تقارير المدرسة.'
    };
};

const formatDate = (value, isArabic) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString(isArabic ? 'ar-SA' : 'en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
};

const toRoundedPercent = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed);
};

const normalizeColor = (value, fallback) => {
    const candidate = String(value || '').trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate) ? candidate : fallback;
};

const mapTrendLabel = (trend, labels) => {
    if (trend === 'improving') return labels.trendImproving;
    if (trend === 'declining') return labels.trendDeclining;
    return labels.trendStable;
};

const mapStandardReportForTemplate = ({ reportData, branding = {}, language = 'en' }) => {
    const isArabic = language === 'ar';
    const labels = getLabels(isArabic);
    const groups = Array.isArray(reportData.groups) ? reportData.groups : [];
    const notStarted = Array.isArray(reportData.notStarted) ? reportData.notStarted : [];
    const reportConfig = normalizeStudentGroupingReportSettings(reportData?.reportConfig || {});

    const providedLevelLabels = reportData?.levelLabels && typeof reportData.levelLabels === 'object'
        ? reportData.levelLabels
        : {};

    const levelDisplayLabels = {
        advanced:
            groups.find((item) => item.level === 'advanced')?.label ||
            providedLevelLabels.advanced ||
            labels.advanced,
        proficient:
            groups.find((item) => item.level === 'proficient')?.label ||
            providedLevelLabels.proficient ||
            labels.proficient,
        approaching:
            groups.find((item) => item.level === 'approaching')?.label ||
            providedLevelLabels.approaching ||
            labels.approaching,
        below:
            groups.find((item) => item.level === 'below')?.label ||
            providedLevelLabels.below ||
            labels.below
    };

    const totalInGroups = groups.reduce((acc, group) => acc + (group?.students?.length || 0), 0);
    const totalStudents = totalInGroups + notStarted.length;

    return {
        isArabic,
        direction: isArabic ? 'rtl' : 'ltr',
        languageCode: isArabic ? 'ar' : 'en',
        labels,
        generatedAt: formatDate(reportData.generatedAt, isArabic),
        academicYear: String(reportData.academicYear || ''),
        schoolName: String(branding.schoolName || ''),
        schoolLogo: String(branding.schoolLogo || ''),
        schoolPhone: String(branding.schoolPhone || ''),
        teacherName: String(branding.teacherName || (isArabic ? 'المعلم' : 'Teacher')),
        primaryColor: normalizeColor(branding.primaryColor, '#1f3c88'),
        secondaryColor: normalizeColor(branding.secondaryColor, '#37517e'),
        className: String(reportData.classMeta?.className || ''),
        classGrade: reportData.classMeta?.grade ?? '',
        classSection: String(reportData.classMeta?.section || ''),
        standardCode: String(reportData.standardMeta?.code || ''),
        standardName: String(reportData.standardMeta?.name || ''),
        standardDescription: String(reportData.standardMeta?.description || 'description not available'),
        subjectName: String(reportData.standardMeta?.subjectName || ''),
        gradeLevel: reportData.standardMeta?.gradeLevel ?? '',
        totalStudents,
        startedStudents: totalInGroups,
        levelCounts: {
            advanced: groups.find((item) => item.level === 'advanced')?.students?.length || 0,
            proficient: groups.find((item) => item.level === 'proficient')?.students?.length || 0,
            approaching: groups.find((item) => item.level === 'approaching')?.students?.length || 0,
            below: groups.find((item) => item.level === 'below')?.students?.length || 0,
            notStarted: notStarted.length
        },
        levelDisplayLabels,
        showSummaryMetrics: reportConfig.showSummaryMetrics,
        showStudentTable: reportConfig.showStudentTable,
        showSuggestedActivities: reportConfig.showSuggestedActivities,
        showNotStartedStudents: reportConfig.showNotStartedStudents,
        showTrendColumn: reportConfig.showTrendColumn,
        showAttemptsColumn: reportConfig.showAttemptsColumn,
        showOverrideColumn: reportConfig.showOverrideColumn,
        groups: groups.map((group) => {
            const students = Array.isArray(group?.students) ? group.students : [];
            const activities = Array.isArray(group?.suggestedActivities) ? group.suggestedActivities : [];
            const levelKey = String(group?.level || '').trim().toLowerCase();

            return {
                levelKey,
                levelLabel: group?.label || labels[levelKey] || '',
                count: students.length,
                students: students.map((student) => {
                    const isOverridden = Boolean(student?.isOverridden);
                    const overrideStale = Boolean(student?.overrideStale);
                    const overrideLabel = isOverridden
                        ? `${labels.overridden}${overrideStale ? ` (${labels.staleOverride})` : ''}`
                        : labels.noOverride;

                    return {
                        name: String(student?.name || ''),
                        masteryPercentage: toRoundedPercent(student?.masteryPercentage),
                        trendLabel: mapTrendLabel(student?.trend, labels),
                        totalAttempts: Number(student?.totalAttempts || 0),
                        overrideLabel
                    };
                }),
                activities: activities.map((activity) => ({
                    title: String(activity?.title || ''),
                    description: String(activity?.description || ''),
                    type: String(activity?.type || ''),
                    materials: String(activity?.materials || '')
                }))
            };
        }),
        notStarted: notStarted.map((student) => ({
            name: String(student?.name || '')
        }))
    };
};

const mapOverviewReportForTemplate = ({ reportData, branding = {}, language = 'en' }) => {
    const isArabic = language === 'ar';
    const labels = {
        ...getLabels(isArabic),
        reportTitle: isArabic ? 'تقرير نظرة عامة لتجميع الطلاب' : 'Student Grouping Overview Report',
        reportSubtitle: isArabic
            ? 'ملخص أداء الصف عبر المعايير'
            : 'Class-level performance summary across standards'
    };
    const overviewRows = Array.isArray(reportData?.overviewRows) ? reportData.overviewRows : [];
    const topIntervention = Array.isArray(reportData?.topIntervention) ? reportData.topIntervention : [];
    const topStrong = Array.isArray(reportData?.topStrong) ? reportData.topStrong : [];
    const reportConfig = normalizeStudentGroupingReportSettings(reportData?.reportConfig || {});

    const providedLevelLabels = reportData?.levelLabels && typeof reportData.levelLabels === 'object'
        ? reportData.levelLabels
        : {};

    const levelDisplayLabels = {
        advanced: providedLevelLabels.advanced || labels.advanced,
        proficient: providedLevelLabels.proficient || labels.proficient,
        approaching: providedLevelLabels.approaching || labels.approaching,
        below: providedLevelLabels.below || labels.below
    };

    const mapRow = (row) => ({
        identifier: String(row?.identifier || ''),
        description: String(row?.description || ''),
        counts: {
            advanced: Number(row?.counts?.advanced || 0),
            proficient: Number(row?.counts?.proficient || 0),
            approaching: Number(row?.counts?.approaching || 0),
            below: Number(row?.counts?.below || 0),
            notStarted: Number(row?.counts?.notStarted || 0)
        },
        totalStudents: Number(row?.totalStudents || 0)
    });

    return {
        isArabic,
        direction: isArabic ? 'rtl' : 'ltr',
        languageCode: isArabic ? 'ar' : 'en',
        labels,
        generatedAt: formatDate(reportData.generatedAt, isArabic),
        academicYear: String(reportData.academicYear || ''),
        schoolName: String(branding.schoolName || ''),
        schoolLogo: String(branding.schoolLogo || ''),
        schoolPhone: String(branding.schoolPhone || ''),
        teacherName: String(branding.teacherName || (isArabic ? 'المعلم' : 'Teacher')),
        primaryColor: normalizeColor(branding.primaryColor, '#1f3c88'),
        secondaryColor: normalizeColor(branding.secondaryColor, '#37517e'),
        className: String(reportData.classMeta?.className || ''),
        gradeLevel: reportData.classMeta?.grade ?? '',
        subjectName: String(reportData.subjectName || ''),
        totalStandards: Number(reportData.totalStandards || 0),
        totalStudents: Number(reportData.totalStudents || 0),
        averageMastery: toRoundedPercent(reportData.averageMastery),
        totalNotStarted: Number(reportData.totalNotStarted || 0),
        showSummaryMetrics: reportConfig.showSummaryMetrics,
        showHeatmapTable: reportConfig.showHeatmapTable,
        showTopNeedIntervention: reportConfig.showTopNeedIntervention,
        showTopStrongStandards: reportConfig.showTopStrongStandards,
        levelDisplayLabels,
        overviewRows: overviewRows.map(mapRow),
        topIntervention: topIntervention.map(mapRow),
        topStrong: topStrong.map(mapRow)
    };
};

const mapWorksheetPackForTemplate = ({ packData, branding = {}, language = 'en' }) => {
    const isArabic = language === 'ar';
    const studentWorksheet = packData?.studentWorksheet && typeof packData.studentWorksheet === 'object'
        ? packData.studentWorksheet
        : {};
    const headerFields = studentWorksheet?.headerFields && typeof studentWorksheet.headerFields === 'object'
        ? studentWorksheet.headerFields
        : {};
    const responseLineCount = Math.max(3, Math.min(12, Number(studentWorksheet?.responseLineCount || 6)));
    const labels = {
        packTitle: isArabic ? 'حزمة أوراق عمل التمايز' : 'Differentiated Worksheet Pack',
        generatedAt: isArabic ? 'تاريخ الإنشاء' : 'Generated At',
        academicYear: isArabic ? 'العام الدراسي' : 'Academic Year',
        classLabel: isArabic ? 'الفصل' : 'Class',
        standardLabel: isArabic ? 'المعيار' : 'Standard',
        subjectLabel: isArabic ? 'المادة' : 'Subject',
        directionsLabel: isArabic ? 'تعليمات الطالب' : 'Student Directions',
        nameLabel: isArabic ? 'الاسم' : 'Name',
        dateLabel: isArabic ? 'التاريخ' : 'Date',
        answerSpaceLabel: isArabic ? 'مساحة الإجابة' : 'Answer Space',
        workSpaceLabel: isArabic ? 'مساحة العمل' : 'Work Area',
        sectionsLabel: isArabic ? 'مجموعات الأنشطة' : 'Activity Groups',
        studentCount: isArabic ? 'عدد الطلاب' : 'Students',
        targetStudents: isArabic ? 'الطلاب المستهدفون' : 'Target Students',
        teacherGuide: isArabic ? 'دليل المعلم' : 'Teacher Guide',
        answerKey: isArabic ? 'إرشادات التصحيح' : 'Answer Key Guidance',
        materials: isArabic ? 'المواد' : 'Materials',
        closure: isArabic ? 'ختام الدرس' : 'Closure',
        facilitationSteps: isArabic ? 'خطوات التنفيذ' : 'Facilitation Steps',
        differentiation: isArabic ? 'التفريق' : 'Differentiation',
        rubricNotes: isArabic ? 'ملاحظات التقييم' : 'Rubric Notes',
        successCriteria: isArabic ? 'معايير النجاح' : 'Success Criteria',
        noStudents: isArabic ? 'لا يوجد طلاب محددون لهذا القسم.' : 'No specific students listed for this section.'
    };

    const sections = Array.isArray(packData?.sections) ? packData.sections : [];
    const teacherInstructions = packData?.teacherInstructions && typeof packData.teacherInstructions === 'object'
        ? packData.teacherInstructions
        : {};
    const answerKey = packData?.answerKey && typeof packData.answerKey === 'object'
        ? packData.answerKey
        : {};

    return {
        isArabic,
        direction: isArabic ? 'rtl' : 'ltr',
        labels,
        generatedAt: formatDate(packData?.generatedAt, isArabic),
        academicYear: String(packData?.academicYear || ''),
        className: String(packData?.classMeta?.className || ''),
        standardCode: String(packData?.standardMeta?.code || ''),
        standardName: String(packData?.standardMeta?.name || ''),
        subjectName: String(packData?.standardMeta?.subjectName || ''),
        packTitle: String(packData?.title || labels.packTitle),
        schoolName: String(branding.schoolName || ''),
        schoolLogo: String(branding.schoolLogo || ''),
        teacherName: String(branding.teacherName || (isArabic ? 'المعلم' : 'Teacher')),
        primaryColor: normalizeColor(branding.primaryColor, '#1f3c88'),
        secondaryColor: normalizeColor(branding.secondaryColor, '#37517e'),
        directions: String(studentWorksheet?.directions || ''),
        studentWorksheet: {
            headerFields: {
                showNameLine: Boolean(headerFields?.showNameLine ?? true),
                showDateLine: Boolean(headerFields?.showDateLine ?? true),
                showClassLine: Boolean(headerFields?.showClassLine ?? true)
            },
            responseLines: Array.from({ length: responseLineCount }, (_, index) => index),
            includeWorkBox: studentWorksheet?.includeWorkBox !== false
        },
        sections: sections.map((section) => ({
            levelLabel: String(section?.levelLabel || section?.level || ''),
            studentCount: Number(section?.studentCount || 0),
            targetStudents: Array.isArray(section?.targetStudents) ? section.targetStudents : [],
            activities: Array.isArray(section?.activities)
                ? section.activities.map((activity) => ({
                    title: String(activity?.title || ''),
                    type: String(activity?.type || ''),
                    description: String(activity?.description || ''),
                    materials: String(activity?.materials || ''),
                    studentTask: String(activity?.studentTask || '')
                }))
                : []
        })),
        teacherInstructions: {
            objective: String(teacherInstructions?.objective || ''),
            materials: String(teacherInstructions?.materials || ''),
            timeEstimateMinutes: Number(teacherInstructions?.timeEstimateMinutes || 0),
            facilitationSteps: Array.isArray(teacherInstructions?.facilitationSteps)
                ? teacherInstructions.facilitationSteps
                : [],
            differentiation: Array.isArray(teacherInstructions?.differentiation)
                ? teacherInstructions.differentiation
                : [],
            closure: String(teacherInstructions?.closure || '')
        },
        answerKey: {
            rubricNotes: Array.isArray(answerKey?.rubricNotes) ? answerKey.rubricNotes : [],
            sampleAnswers: Array.isArray(answerKey?.sampleAnswers)
                ? answerKey.sampleAnswers.map((entry) => ({
                    level: String(entry?.level || ''),
                    activityTitle: String(entry?.activityTitle || ''),
                    successCriteria: Array.isArray(entry?.successCriteria) ? entry.successCriteria : []
                }))
                : []
        }
    };
};

export const renderStudentGroupingStandardHtml = async (reportData, branding = {}, options = {}) => {
    const template = await getTemplate('standard');
    const payload = mapStandardReportForTemplate({
        reportData: {
            ...reportData,
            reportConfig: options.reportConfig
        },
        branding,
        language: options.language === 'ar' ? 'ar' : 'en'
    });
    return template(payload);
};

export const renderStudentGroupingOverviewHtml = async (reportData, branding = {}, options = {}) => {
    const template = await getTemplate('overview');
    const payload = mapOverviewReportForTemplate({
        reportData: {
            ...reportData,
            reportConfig: options.reportConfig
        },
        branding,
        language: options.language === 'ar' ? 'ar' : 'en'
    });
    return template(payload);
};

export const renderStudentGroupingWorksheetPackHtml = async (packData, branding = {}, options = {}) => {
    const template = await getTemplate('worksheetPack');
    const payload = mapWorksheetPackForTemplate({
        packData,
        branding,
        language: options.language === 'ar' ? 'ar' : 'en'
    });
    return template(payload);
};

export const generateStudentGroupingStandardPdf = async (reportData, branding = {}, options = {}) => {
    const html = await renderStudentGroupingStandardHtml(reportData, branding, options);
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfData = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                bottom: '10mm',
                left: '10mm',
                right: '10mm'
            }
        });

        // Puppeteer may return Uint8Array in newer versions; normalize for Express send().
        return Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);
    } finally {
        await page.close();
    }
};

export const generateStudentGroupingOverviewPdf = async (reportData, branding = {}, options = {}) => {
    const html = await renderStudentGroupingOverviewHtml(reportData, branding, options);
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfData = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                bottom: '10mm',
                left: '10mm',
                right: '10mm'
            }
        });

        return Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);
    } finally {
        await page.close();
    }
};

export const generateStudentGroupingWorksheetPackPdf = async (packData, branding = {}, options = {}) => {
    const html = await renderStudentGroupingWorksheetPackHtml(packData, branding, options);
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfData = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                bottom: '10mm',
                left: '10mm',
                right: '10mm'
            }
        });

        return Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);
    } finally {
        await page.close();
    }
};

export const closeStudentGroupingPdfBrowser = async () => {
    if (!browserPromise) return;
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
};
