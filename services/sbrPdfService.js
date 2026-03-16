import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../templates/sbr-report-card.html');

let browserPromise = null;
let compiledTemplatePromise = null;

const round2 = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100) / 100;
};

const formatDate = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
};

const getLabels = (isArabic) => {
    if (!isArabic) {
        return {
            studentName: 'Student Name',
            gradeLevel: 'Grade Level',
            studentId: 'Student ID',
            reportCardId: 'Report Card ID',
            academicYear: 'Academic Year',
            generatedAt: 'Generated At',
            scaleLegend: 'Scale Legend',
            overallScore: 'Overall',
            standard: 'Standard',
            rawPercentage: 'Raw %',
            score: 'Score'
        };
    }

    return {
        studentName: 'اسم الطالب',
        gradeLevel: 'الصف',
        studentId: 'رقم الطالب',
        reportCardId: 'رقم التقرير',
        academicYear: 'العام الدراسي',
        generatedAt: 'تاريخ الإصدار',
        scaleLegend: 'مفتاح مقياس التقييم',
        overallScore: 'المعدل',
        standard: 'المعيار',
        rawPercentage: 'النسبة',
        score: 'التقدير'
    };
};

const getBrowser = async () => {
    if (!browserPromise) {
        browserPromise = puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
    }

    return browserPromise;
};

const getTemplate = async () => {
    if (!compiledTemplatePromise) {
        compiledTemplatePromise = fs.readFile(TEMPLATE_PATH, 'utf8').then((raw) => Handlebars.compile(raw));
    }

    return compiledTemplatePromise;
};

const mapReportForTemplate = async (reportData, schoolBranding = {}) => {
    const schoolMeta = reportData.schoolMeta || {};
    const classMeta = reportData.classMeta || {};
    const studentMeta = reportData.studentMeta || {};
    const period = reportData.period || {};
    const levels = Array.isArray(reportData.scaleMeta?.levels) ? reportData.scaleMeta.levels : [];
    const specialCodes = Array.isArray(reportData.scaleMeta?.specialCodes) ? reportData.scaleMeta.specialCodes : [];
    const reportLanguage = String(schoolMeta.reportLanguage || '').toLowerCase();
    const isArabic = reportLanguage === 'arabic';

    const qrContent = schoolBranding.verifyUrl
        ? `${schoolBranding.verifyUrl.replace(/\/$/, '')}/${reportData.reportCardId}`
        : (schoolBranding.domain
            ? `https://${String(schoolBranding.domain).replace(/^https?:\/\//, '').replace(/\/$/, '')}/verify-report/${reportData.reportCardId}`
            : String(reportData.reportCardId));

    const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
        width: 164,
        margin: 1
    });

    return {
        isArabic,
        primaryColor: schoolBranding.primaryColor || schoolMeta.primaryColor || '#1f3c88',
        secondaryColor: schoolBranding.secondaryColor || schoolMeta.secondaryColor || '#37517e',
        schoolLogo: schoolBranding.schoolLogo || schoolMeta.logoUrl || '',
        ministryLogo: schoolBranding.ministryLogo || '',
        schoolName: schoolBranding.schoolName || schoolMeta.schoolName || '',
        schoolPhone: schoolBranding.schoolPhone || schoolMeta.phone || '',
        schoolEmail: schoolBranding.schoolEmail || schoolMeta.email || '',
        schoolWebsite: schoolBranding.schoolWebsite || schoolMeta.website || '',
        reportCardId: reportData.reportCardId,
        reportTitle: isArabic ? 'بطاقة تقييم قائمة على المعايير' : 'Standards-Based Report Card',
        reportSubtitle: period.label || '',
        periodLabel: period.label || '',
        academicYear: reportData.academicYear || '',
        studentName: studentMeta.studentName || '',
        studentId: studentMeta.studentId || '',
        gradeLevelLabel: classMeta.grade
            ? `Grade ${classMeta.grade}${classMeta.section ? `-${classMeta.section}` : ''}`
            : (classMeta.className || ''),
        generatedAtLabel: formatDate(reportData.generatedAt || new Date()),
        scaleLevels: levels,
        specialCodes,
        labels: getLabels(isArabic),
        qrCodeDataUrl,
        subjects: (reportData.subjects || []).map((subject) => ({
            ...subject,
            overallScore: round2(subject.overallScore),
            categories: (subject.categories || []).map((category) => ({
                ...category,
                standards: (category.standards || []).map((standard) => ({
                    ...standard,
                    rawPercentage: round2(standard.rawPercentage)
                }))
            }))
        }))
    };
};

export const renderSBRHtml = async (reportData, schoolBranding = {}) => {
    const template = await getTemplate();
    const payload = await mapReportForTemplate(reportData, schoolBranding);
    return template(payload);
};

const renderPdfFromHtml = async (html) => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'networkidle0' });

        return await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '10mm',
                bottom: '10mm',
                left: '10mm',
                right: '10mm'
            }
        });
    } finally {
        await page.close();
    }
};

export const generateSBRPdf = async (reportData, schoolBranding = {}) => {
    const html = await renderSBRHtml(reportData, schoolBranding);
    return renderPdfFromHtml(html);
};

export const generateBulkSBRPdf = async (reportsArray = [], schoolBranding = {}) => {
    const htmlBlocks = [];
    for (const report of reportsArray) {
        htmlBlocks.push(await renderSBRHtml(report, schoolBranding));
    }

    const html = htmlBlocks.join('\n<div style="page-break-before: always;"></div>\n');
    return renderPdfFromHtml(html);
};

export const closeSBRPdfBrowser = async () => {
    if (!browserPromise) return;

    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
};
