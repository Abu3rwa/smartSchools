import { asyncHandler } from '../middleware/errorHandler.js';
import School from '../models/School.js';
import {
    generateStudentGroupingWorksheetPackPdf
} from '../services/studentGroupingPdfService.js';
import studentGroupingWorksheetPackService from '../services/studentGroupingWorksheetPackService.js';

const toSlug = (value, fallback = 'worksheet-pack') => {
    const normalized = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || fallback;
};

const resolveLanguage = ({ requestedLanguage, defaultLanguage }) => {
    const requested = String(requestedLanguage || '').trim().toLowerCase();
    if (requested === 'ar' || requested === 'en') return requested;

    const fallback = String(defaultLanguage || '').trim().toLowerCase();
    if (fallback === 'ar' || fallback === 'arabic') return 'ar';
    return 'en';
};

const resolveTeacherName = (user) => {
    const composed = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    if (composed) return composed;

    const direct = String(user?.name || '').trim();
    if (direct) return direct;

    return 'Teacher';
};

const buildPackPayload = (pack) => ({
    ...(pack?.snapshot || {}),
    title: pack?.title || pack?.snapshot?.title || '',
    language: pack?.language || pack?.snapshot?.language || 'en',
    academicYear: pack?.academicYear || pack?.snapshot?.academicYear || '',
    generatedAt: pack?.snapshot?.generatedAt || pack?.createdAt || new Date()
});

const toSuccessDetail = (pack) => ({
    success: true,
    data: studentGroupingWorksheetPackService.toWorksheetPackDetail(pack)
});

export const createGroupingWorksheetPackDraft = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const academicYear = req.body?.academicYear || req.query.academicYear || '';

    const draft = await studentGroupingWorksheetPackService.createWorksheetPackDraft({
        classId,
        standardId,
        academicYear,
        schoolId: req.schoolId,
        userId: req.user._id,
        title: req.body?.title,
        language: req.body?.language
    });

    const detail = await studentGroupingWorksheetPackService.getWorksheetPackById({
        packId: draft._id,
        schoolId: req.schoolId
    });

    res.status(201).json(toSuccessDetail(detail));
});

export const listGroupingWorksheetPacks = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;

    const { items, pagination } = await studentGroupingWorksheetPackService.listWorksheetPacks({
        classId,
        standardId,
        schoolId: req.schoolId,
        academicYear: req.query.academicYear || '',
        page: req.query.page,
        limit: req.query.limit
    });

    res.json({
        success: true,
        data: {
            items: items.map(studentGroupingWorksheetPackService.toWorksheetPackListItem),
            pagination
        }
    });
});

export const endGroupingWorksheetPackAuthoring = asyncHandler(async (req, res) => {
    const { packId } = req.params;

    await studentGroupingWorksheetPackService.endWorksheetPackAuthoring({
        packId,
        schoolId: req.schoolId,
        userId: req.user._id
    });

    const detail = await studentGroupingWorksheetPackService.getWorksheetPackById({
        packId,
        schoolId: req.schoolId
    });

    res.json(toSuccessDetail(detail));
});

export const publishGroupingWorksheetPack = asyncHandler(async (req, res) => {
    const { packId } = req.params;

    await studentGroupingWorksheetPackService.publishWorksheetPack({
        packId,
        schoolId: req.schoolId,
        userId: req.user._id
    });

    const detail = await studentGroupingWorksheetPackService.getWorksheetPackById({
        packId,
        schoolId: req.schoolId
    });

    res.json(toSuccessDetail(detail));
});

const sendWorksheetPackPdf = async ({ req, res, inline = false }) => {
    const { packId } = req.params;

    const pack = await studentGroupingWorksheetPackService.getWorksheetPackById({
        packId,
        schoolId: req.schoolId
    });

    studentGroupingWorksheetPackService.assertWorksheetPackDistributionAllowed(pack);

    const schoolDoc = await School.findById(req.schoolId)
        .select('name settings.branding reportSettings.defaultLanguage contact.phone')
        .lean();

    const language = resolveLanguage({
        requestedLanguage: req.query.language || pack?.language,
        defaultLanguage: schoolDoc?.reportSettings?.defaultLanguage
    });

    const branding = {
        schoolName: schoolDoc?.name || '',
        schoolLogo: schoolDoc?.settings?.branding?.logoUrl || '',
        primaryColor: schoolDoc?.settings?.branding?.primaryColor || '#1f3c88',
        secondaryColor: schoolDoc?.settings?.branding?.secondaryColor || '#37517e',
        schoolPhone: schoolDoc?.contact?.phone || '',
        teacherName: resolveTeacherName(req.user)
    };

    const pdfData = await generateStudentGroupingWorksheetPackPdf(
        buildPackPayload(pack),
        branding,
        { language }
    );
    const pdfBuffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

    const titleToken = toSlug(pack?.title || 'grouping-worksheet-pack', 'grouping-worksheet-pack');
    const versionToken = `v${pack?.version || 1}`;
    const filename = `${titleToken}-${versionToken}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
    );
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.send(pdfBuffer);
};

export const exportGroupingWorksheetPackPdf = asyncHandler(async (req, res) => {
    return sendWorksheetPackPdf({ req, res, inline: false });
});

export const printGroupingWorksheetPackPdf = asyncHandler(async (req, res) => {
    return sendWorksheetPackPdf({ req, res, inline: true });
});
