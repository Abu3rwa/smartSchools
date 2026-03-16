import SBRReportCard from '../models/SBRReportCard.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    buildSBRReportData,
    buildClassSBRReports,
    normalizePeriod
} from '../services/sbrService.js';
import {
    generateSBRPdf,
    generateBulkSBRPdf,
    renderSBRHtml
} from '../services/sbrPdfService.js';
import {
    uploadPrivateFile,
    getSignedUrl,
    downloadFile
} from '../services/firebaseStorageService.js';
import gmailOAuthService from '../services/gmailOAuthService.js';

const REPORT_STATUSES = new Set(['draft', 'published', 'archived']);

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    return String(value);
};

const normalizeEmails = (values = []) => {
    const seen = new Set();

    for (const value of values) {
        const email = String(value || '').trim().toLowerCase();
        if (!email) continue;
        seen.add(email);
    }

    return [...seen];
};

const getReportStoragePath = ({ schoolId, academicYear, reportCardId }) => {
    const year = String(academicYear || 'unknown-year').replace(/[^0-9-]/g, '');
    return `schools/${schoolId}/sbr-reports/${year}/${reportCardId}.pdf`;
};

const parsePagination = (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(query.limit) || 25));
    return { page, limit };
};

const getNormalizedParentEmail = (req) => String(req.user?.email || '').trim().toLowerCase();

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value?._id) return String(value._id);
    return String(value);
};

const getParentLinkedStudentIds = async (schoolId, parentEmail) => {
    if (!parentEmail) return [];

    const parentEmailPattern = new RegExp(`^${escapeRegex(parentEmail)}$`, 'i');

    const students = await Student.find({
        school: schoolId,
        $or: [
            { 'parentInfo.fatherEmail': parentEmailPattern },
            { 'parentInfo.motherEmail': parentEmailPattern },
            { 'parentInfo.guardianEmail': parentEmailPattern }
        ]
    })
        .select('_id')
        .lean();

    return students.map((student) => String(student._id));
};

const ensureParentHasReportAccess = async ({ req, reportCard }) => {
    if (req.user?.role !== 'parent') return true;

    const reportStudentId = toObjectIdString(reportCard?.student);
    if (!reportStudentId) return false;

    const student = await Student.findOne({
        _id: reportStudentId,
        school: req.schoolId
    })
        .select('parentInfo')
        .lean();

    if (!student) return false;

    const parentEmail = getNormalizedParentEmail(req);
    const linkedEmails = [
        student.parentInfo?.fatherEmail,
        student.parentInfo?.motherEmail,
        student.parentInfo?.guardianEmail
    ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);

    return linkedEmails.includes(parentEmail);
};

const findSenderUserId = async (schoolId, preferredUserId) => {
    if (preferredUserId && await gmailOAuthService.hasValidTokens(preferredUserId)) {
        return preferredUserId;
    }

    const admin = await User.findOne({
        school: schoolId,
        role: 'admin',
        isActive: true,
        'gmailTokens.refreshToken': { $exists: true, $ne: null }
    })
        .select('_id')
        .setOptions({ skipTenantFilter: true })
        .lean();

    return admin?._id ? String(admin._id) : null;
};

const toReportListItem = (report) => ({
    id: report._id,
    reportCardId: report.reportCardId,
    student: report.student,
    class: report.class,
    academicYear: report.academicYear,
    period: report.period,
    status: report.status,
    generatedAt: report.generatedAt,
    emailedAt: report.emailedAt,
    emailedTo: Array.isArray(report.emailedTo) ? report.emailedTo : [],
    pdfUrl: report.pdfUrl || null
});

const getBrandingFromReportData = (reportData) => ({
    schoolName: reportData.schoolMeta?.schoolName || '',
    primaryColor: reportData.schoolMeta?.primaryColor || '#1f3c88',
    secondaryColor: reportData.schoolMeta?.secondaryColor || '#37517e',
    schoolLogo: reportData.schoolMeta?.logoUrl || '',
    schoolPhone: reportData.schoolMeta?.phone || '',
    schoolEmail: reportData.schoolMeta?.email || '',
    schoolWebsite: reportData.schoolMeta?.website || '',
    domain: process.env.CLIENT_URL || ''
});

const validateGenerateInput = ({ classId, period, academicYear }) => {
    if (!classId) return 'classId is required';
    if (!period) return 'period is required';
    if (!academicYear) return 'academicYear is required';
    if (!normalizePeriod(period)) return 'Invalid period. Use semester_1, semester_2, or full_year';
    return null;
};

const upsertReportCard = async ({
    schoolId,
    studentId,
    classId,
    academicYear,
    periodType,
    reportData,
    pdfRef,
    pdfUrl
}) => {
    const existing = await SBRReportCard.findOne({
        school: schoolId,
        student: studentId,
        class: classId,
        academicYear,
        'period.type': periodType
    });

    const payload = {
        academicYear,
        period: reportData.period,
        scale: reportData.scale,
        subjects: reportData.subjects,
        generatedBy: reportData.generatedBy,
        generatedAt: reportData.generatedAt,
        pdfRef,
        pdfUrl,
        comments: reportData.comments || '',
        teacherNotes: reportData.teacherNotes || {}
    };

    if (existing) {
        existing.scale = payload.scale;
        existing.subjects = payload.subjects;
        existing.generatedBy = payload.generatedBy;
        existing.generatedAt = payload.generatedAt;
        existing.pdfRef = payload.pdfRef;
        existing.pdfUrl = payload.pdfUrl;
        existing.comments = payload.comments;
        existing.teacherNotes = payload.teacherNotes;
        existing.period = payload.period;
        await existing.save();
        return existing;
    }

    return SBRReportCard.create({
        school: schoolId,
        student: studentId,
        class: classId,
        academicYear,
        period: reportData.period,
        reportCardId: reportData.reportCardId,
        scale: reportData.scale,
        subjects: reportData.subjects,
        generatedBy: reportData.generatedBy,
        generatedAt: reportData.generatedAt,
        pdfRef,
        pdfUrl,
        comments: reportData.comments || '',
        teacherNotes: reportData.teacherNotes || {}
    });
};

export const generateSBR = asyncHandler(async (req, res) => {
    const studentId = req.body?.studentId;
    const classId = req.body?.classId;
    const period = req.body?.period;
    const academicYear = req.body?.academicYear;

    const validationError = validateGenerateInput({ classId, period, academicYear });
    if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
    }

    if (!studentId) {
        return res.status(400).json({ success: false, message: 'studentId is required' });
    }

    const periodInfo = normalizePeriod(period);

    const existing = await SBRReportCard.findOne({
        school: req.schoolId,
        student: studentId,
        class: classId,
        academicYear,
        'period.type': periodInfo.type
    })
        .select('reportCardId')
        .lean();

    const reportData = await buildSBRReportData({
        schoolId: req.schoolId,
        studentId,
        classId,
        period: periodInfo.type,
        academicYear,
        generatedBy: req.user._id,
        reportCardId: existing?.reportCardId || null,
        comments: req.body?.comments || '',
        teacherNotes: req.body?.teacherNotes || {}
    });

    const branding = getBrandingFromReportData(reportData);
    const pdfBuffer = await generateSBRPdf(reportData, branding);

    const storagePath = getReportStoragePath({
        schoolId: req.schoolId,
        academicYear,
        reportCardId: reportData.reportCardId
    });

    const uploaded = await uploadPrivateFile(pdfBuffer, 'application/pdf', storagePath);
    const signedUrl = await getSignedUrl(uploaded.fileRef);

    const reportCard = await upsertReportCard({
        schoolId: req.schoolId,
        studentId,
        classId,
        academicYear,
        periodType: periodInfo.type,
        reportData,
        pdfRef: uploaded.fileRef,
        pdfUrl: signedUrl
    });

    res.status(201).json({
        success: true,
        data: {
            reportCard,
            pdfUrl: signedUrl
        }
    });
});

export const generateBulkSBR = asyncHandler(async (req, res) => {
    const classId = req.body?.classId;
    const period = req.body?.period;
    const academicYear = req.body?.academicYear;

    const validationError = validateGenerateInput({ classId, period, academicYear });
    if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
    }

    const reportsData = await buildClassSBRReports({
        schoolId: req.schoolId,
        classId,
        period,
        academicYear,
        generatedBy: req.user._id
    });

    const savedReports = [];

    for (const reportData of reportsData) {
        const periodType = reportData.period?.type;
        const studentId = toIdString(reportData.student);
        const branding = getBrandingFromReportData(reportData);
        const pdfBuffer = await generateSBRPdf(reportData, branding);

        const storagePath = getReportStoragePath({
            schoolId: req.schoolId,
            academicYear,
            reportCardId: reportData.reportCardId
        });

        const uploaded = await uploadPrivateFile(pdfBuffer, 'application/pdf', storagePath);
        const signedUrl = await getSignedUrl(uploaded.fileRef);

        const reportCard = await upsertReportCard({
            schoolId: req.schoolId,
            studentId,
            classId,
            academicYear,
            periodType,
            reportData,
            pdfRef: uploaded.fileRef,
            pdfUrl: signedUrl
        });

        savedReports.push(reportCard);
    }

    let bulkPdfUrl = null;
    if (reportsData.length > 0) {
        const branding = getBrandingFromReportData(reportsData[0]);
        const bulkBuffer = await generateBulkSBRPdf(reportsData, branding);
        const normalizedPeriod = normalizePeriod(period)?.type || 'full_year';

        const bulkPath = `schools/${req.schoolId}/sbr-reports/${String(academicYear).replace(/[^0-9-]/g, '')}/bulk/${normalizedPeriod}-${Date.now()}.pdf`;
        const bulkUploaded = await uploadPrivateFile(bulkBuffer, 'application/pdf', bulkPath);
        bulkPdfUrl = await getSignedUrl(bulkUploaded.fileRef);
    }

    res.status(201).json({
        success: true,
        data: {
            reportCards: savedReports,
            bulkPdfUrl
        }
    });
});

export const previewSBR = asyncHandler(async (req, res) => {
    const studentId = req.params.studentId;
    const classId = req.query.classId || req.body?.classId;
    const period = req.query.period || req.body?.period;
    const academicYear = req.query.academicYear || req.body?.academicYear;

    const validationError = validateGenerateInput({ classId, period, academicYear });
    if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
    }

    const reportData = await buildSBRReportData({
        schoolId: req.schoolId,
        studentId,
        classId,
        period,
        academicYear,
        generatedBy: req.user._id,
        comments: req.body?.comments || '',
        teacherNotes: req.body?.teacherNotes || {}
    });

    const html = await renderSBRHtml(reportData, getBrandingFromReportData(reportData));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

export const getReportCards = asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const query = { school: req.schoolId };

    if (req.user?.role === 'parent') {
        const parentEmail = getNormalizedParentEmail(req);
        const linkedStudentIds = await getParentLinkedStudentIds(req.schoolId, parentEmail);
        if (linkedStudentIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    items: [],
                    pagination: {
                        page,
                        limit,
                        total: 0,
                        pages: 0
                    }
                }
            });
        }
        query.student = { $in: linkedStudentIds };
    }

    if (req.query.classId) query.class = req.query.classId;
    if (req.query.studentId) {
        if (req.user?.role === 'parent') {
            const existingStudentFilter = query.student?.$in || [];
            if (existingStudentFilter.length > 0 && !existingStudentFilter.includes(String(req.query.studentId))) {
                return res.json({
                    success: true,
                    data: {
                        items: [],
                        pagination: {
                            page,
                            limit,
                            total: 0,
                            pages: 0
                        }
                    }
                });
            }
            query.student = { $in: [String(req.query.studentId)] };
        } else {
            query.student = req.query.studentId;
        }
    }
    if (req.query.period) {
        const periodInfo = normalizePeriod(req.query.period);
        if (periodInfo) query['period.type'] = periodInfo.type;
    }
    if (req.query.academicYear) query.academicYear = String(req.query.academicYear).trim();
    if (req.query.status && REPORT_STATUSES.has(req.query.status)) query.status = req.query.status;

    const [items, total] = await Promise.all([
        SBRReportCard.find(query)
            .sort({ generatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('student', 'firstName lastName studentId')
            .populate('class', 'name grade section')
            .lean(),
        SBRReportCard.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: {
            items: items.map(toReportListItem),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

export const getReportCard = asyncHandler(async (req, res) => {
    const reportCard = await SBRReportCard.findOne({
        _id: req.params.id,
        school: req.schoolId
    })
        .populate('student', 'firstName lastName studentId parentInfo')
        .populate('class', 'name grade section')
        .populate('scale')
        .lean();

    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }

    const hasAccess = await ensureParentHasReportAccess({ req, reportCard });
    if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: { reportCard } });
});

export const downloadReportCardPdf = asyncHandler(async (req, res) => {
    const reportCard = await SBRReportCard.findOne({
        _id: req.params.id,
        school: req.schoolId
    });

    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }

    const hasAccess = await ensureParentHasReportAccess({ req, reportCard });
    if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (reportCard.pdfRef) {
        const signedUrl = await getSignedUrl(reportCard.pdfRef);
        return res.redirect(signedUrl);
    }

    const pdfBuffer = await generateSBRPdf(reportCard.toObject(), {
        schoolName: '',
        primaryColor: '#1f3c88',
        secondaryColor: '#37517e',
        domain: process.env.CLIENT_URL || ''
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${reportCard.reportCardId}.pdf"`);
    return res.send(pdfBuffer);
});

export const publishReportCard = asyncHandler(async (req, res) => {
    const reportCard = await SBRReportCard.findOne({ _id: req.params.id, school: req.schoolId });
    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }

    reportCard.status = 'published';
    await reportCard.save();

    res.json({ success: true, data: { reportCard } });
});

export const emailReportCard = asyncHandler(async (req, res) => {
    const reportCard = await SBRReportCard.findOne({ _id: req.params.id, school: req.schoolId })
        .populate('student', 'firstName lastName studentId parentInfo')
        .populate('class', 'name grade section')
        .populate('scale')
        .lean();

    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }

    const targetEmails = normalizeEmails([
        ...(Array.isArray(req.body?.emails) ? req.body.emails : []),
        reportCard.student?.parentInfo?.fatherEmail,
        reportCard.student?.parentInfo?.motherEmail,
        reportCard.student?.parentInfo?.guardianEmail
    ]);

    if (targetEmails.length === 0) {
        return res.status(400).json({ success: false, message: 'No recipient emails found for this student' });
    }

    let pdfAttachmentBuffer = null;
    if (reportCard.pdfRef) {
        const file = await downloadFile(reportCard.pdfRef);
        pdfAttachmentBuffer = file.buffer;
    } else {
        // Ensure email delivery always includes a PDF, even for legacy records without stored files.
        const generatedPdfBuffer = await generateSBRPdf(reportCard, {
            schoolName: '',
            primaryColor: '#1f3c88',
            secondaryColor: '#37517e',
            domain: process.env.CLIENT_URL || ''
        });

        const storagePath = getReportStoragePath({
            schoolId: req.schoolId,
            academicYear: reportCard.academicYear,
            reportCardId: reportCard.reportCardId
        });

        const uploaded = await uploadPrivateFile(generatedPdfBuffer, 'application/pdf', storagePath);
        const signedUrl = await getSignedUrl(uploaded.fileRef);

        await SBRReportCard.updateOne(
            { _id: reportCard._id, school: req.schoolId },
            {
                $set: {
                    pdfRef: uploaded.fileRef,
                    pdfUrl: signedUrl
                }
            }
        );

        reportCard.pdfRef = uploaded.fileRef;
        reportCard.pdfUrl = signedUrl;
        pdfAttachmentBuffer = generatedPdfBuffer;
    }

    const senderId = await findSenderUserId(req.schoolId, req.user._id?.toString?.() || null);
    if (!senderId) {
        return res.status(400).json({
            success: false,
            message: 'No Gmail sender available. Connect an admin Gmail account first.'
        });
    }

    const studentName = [
        reportCard.student?.firstName,
        reportCard.student?.lastName
    ].filter(Boolean).join(' ').trim() || 'Student';

    await gmailOAuthService.sendEmail(senderId, {
        to: targetEmails.join(','),
        subject: `SBR Report Card - ${reportCard.reportCardId}`,
        text: `Please find attached the Standards-Based Report Card for ${studentName}.`,
        html: `<p>Please find attached the Standards-Based Report Card for <strong>${studentName}</strong>.</p>`,
        attachments: pdfAttachmentBuffer
            ? [{
                filename: `${reportCard.reportCardId}.pdf`,
                content: pdfAttachmentBuffer,
                contentType: 'application/pdf'
            }]
            : []
    });

    await SBRReportCard.updateOne(
        { _id: reportCard._id, school: req.schoolId },
        {
            $set: { emailedAt: new Date() },
            $addToSet: { emailedTo: { $each: targetEmails } }
        }
    );

    res.json({
        success: true,
        data: {
            emailedTo: targetEmails,
            emailedAt: new Date().toISOString()
        }
    });
});

export const deleteReportCard = asyncHandler(async (req, res) => {
    const reportCard = await SBRReportCard.findOne({ _id: req.params.id, school: req.schoolId });

    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }

    if (reportCard.status !== 'draft') {
        return res.status(400).json({ success: false, message: 'Only draft report cards can be deleted' });
    }

    await reportCard.deleteOne();

    res.json({ success: true, message: 'Report card deleted successfully' });
});
