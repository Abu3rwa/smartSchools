import { asyncHandler } from '../middleware/errorHandler.js';
import {
    archivePackage,
    cancelPackagePurchase,
    addStudentNote,
    deleteStudentNote,
    generateChargesForSession,
    getBillingSettings,
    getFamilyStatement,
    getManualCharges,
    getManualEntryOptions,
    getStudentAccount,
    getStudentStatement,
    listBillingAudit,
    listIssues,
    listPackagePurchases,
    listPackages,
    recordBillingAdjustment,
    recordBillingPayment,
    recordBillingRefund,
    recordManualCharge,
    recordPackagePurchase,
    resolveIssue,
    saveBillingSettings,
    savePackage,
    voidBillingEntry,
    voidManualCharge
} from '../services/sessionBillingService.js';
import {
    BILLING_REPORTS,
    getBillingForecast,
    getBillingOverview,
    getBillingReport,
    getLessons,
    getPayments,
    getReminderCandidates,
    getStudentAccounts
} from '../services/sessionBillingReportService.js';
import {
    exportReportCsv,
    exportStatementCsv,
    exportStudentsCsv
} from '../services/sessionBillingExportService.js';
import {
    getStatementEmailPreview,
    getStatementEmailRoster,
    sendStatementEmail
} from '../services/sessionBillingEmailService.js';
import {
    getMessageCenter,
    getReceiptPreview,
    getReminderPreview,
    sendReceiptEmail,
    sendReminderEmail
} from '../services/sessionBillingMessageService.js';
import {
    generateBillingNarrative,
    generateMessageDraft,
    getBillingInsights
} from '../services/sessionBillingInsightsService.js';
import {
    renderReceiptDocument,
    renderReportDocument,
    renderStatementDocument
} from '../services/sessionBillingPrintService.js';

export const getSessionBillingSettings = asyncHandler(async (req, res) => {
    const settings = await getBillingSettings(req.schoolId);
    res.json({ success: true, data: { settings } });
});

export const updateSessionBillingSettings = asyncHandler(async (req, res) => {
    const settings = await saveBillingSettings(req.schoolId, req.body || {}, req.user);
    res.json({ success: true, data: { settings } });
});

export const getSessionBillingOverview = asyncHandler(async (req, res) => {
    const overview = await getBillingOverview(req.schoolId, req.query || {});
    res.json({ success: true, data: overview });
});

export const getSessionBillingStudents = asyncHandler(async (req, res) => {
    const accounts = await getStudentAccounts(req.schoolId, req.query || {});
    res.json({ success: true, data: accounts });
});

export const getSessionBillingStatement = asyncHandler(async (req, res) => {
    const statement = await getStudentStatement(req.schoolId, req.params.studentId);
    res.json({ success: true, data: statement });
});

export const getSessionBillingAccount = asyncHandler(async (req, res) => {
    const account = await getStudentAccount(req.schoolId, req.params.studentId);
    res.json({ success: true, data: account });
});

export const printSessionBillingStatement = asyncHandler(async (req, res) => {
    const html = await renderStatementDocument(req.schoolId, req.params.studentId, req.query || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

export const addSessionBillingNote = asyncHandler(async (req, res) => {
    const note = await addStudentNote(
        req.schoolId,
        req.params.studentId,
        req.body?.body,
        req.user
    );
    res.status(201).json({ success: true, data: { note } });
});

export const deleteSessionBillingNote = asyncHandler(async (req, res) => {
    await deleteStudentNote(req.schoolId, req.params.studentId, req.params.noteId);
    res.json({ success: true, data: { deleted: true } });
});

export const getSessionBillingLessons = asyncHandler(async (req, res) => {
    const lessons = await getLessons(req.schoolId, req.query || {});
    res.json({ success: true, data: lessons });
});

export const listSessionBillingIssues = asyncHandler(async (req, res) => {
    const issues = await listIssues(req.schoolId, req.query || {});
    res.json({ success: true, data: issues });
});

export const resolveSessionBillingIssue = asyncHandler(async (req, res) => {
    const issue = await resolveIssue(
        req.schoolId,
        req.params.id,
        { action: req.body?.action, note: req.body?.note },
        req.user
    );
    res.json({ success: true, data: { issue } });
});

export const getSessionBillingPayments = asyncHandler(async (req, res) => {
    const payments = await getPayments(req.schoolId, req.query || {});
    res.json({ success: true, data: payments });
});

export const createSessionBillingPayment = asyncHandler(async (req, res) => {
    const entry = await recordBillingPayment(req.schoolId, req.body || {}, req.user);
    res.status(201).json({ success: true, data: { entry } });
});

export const createSessionBillingRefund = asyncHandler(async (req, res) => {
    const entry = await recordBillingRefund(req.schoolId, req.body || {}, req.user);
    res.status(201).json({ success: true, data: { entry } });
});

export const createSessionBillingAdjustment = asyncHandler(async (req, res) => {
    const entry = await recordBillingAdjustment(req.schoolId, req.body || {}, req.user);
    res.status(201).json({ success: true, data: { entry } });
});

export const voidSessionBillingEntry = asyncHandler(async (req, res) => {
    const entry = await voidBillingEntry(req.schoolId, req.params.id, {
        reason: req.body?.reason,
        actor: req.user
    });
    res.json({ success: true, data: { entry } });
});

export const getSessionBillingReceiptPreview = asyncHandler(async (req, res) => {
    const preview = await getReceiptPreview(req.schoolId, req.params.id);
    res.json({ success: true, data: preview });
});

export const sendSessionBillingReceipt = asyncHandler(async (req, res) => {
    const results = await sendReceiptEmail(req.schoolId, req.params.id, req.body || {}, req.user);
    const allSent = results.every((result) => result.status === 'sent');
    res.status(allSent ? 200 : 207).json({ success: allSent, data: results });
});

export const printSessionBillingReceipt = asyncHandler(async (req, res) => {
    const html = await renderReceiptDocument(req.schoolId, req.params.id, req.query || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

export const listSessionBillingPackages = asyncHandler(async (req, res) => {
    const packages = await listPackages(req.schoolId);
    res.json({ success: true, data: packages });
});

export const saveSessionBillingPackage = asyncHandler(async (req, res) => {
    const payload = { ...(req.body || {}), ...(req.params.id ? { id: req.params.id } : {}) };
    const pkg = await savePackage(req.schoolId, payload, req.user);
    res.status(req.params.id ? 200 : 201).json({ success: true, data: { package: pkg } });
});

export const archiveSessionBillingPackage = asyncHandler(async (req, res) => {
    const pkg = await archivePackage(req.schoolId, req.params.id, req.user);
    res.json({ success: true, data: { package: pkg } });
});

export const listSessionBillingPackagePurchases = asyncHandler(async (req, res) => {
    const purchases = await listPackagePurchases(req.schoolId, req.query || {});
    res.json({ success: true, data: purchases });
});

export const createSessionBillingPackagePurchase = asyncHandler(async (req, res) => {
    const purchase = await recordPackagePurchase(req.schoolId, req.body || {}, req.user);
    res.status(201).json({ success: true, data: purchase });
});

export const cancelSessionBillingPackagePurchase = asyncHandler(async (req, res) => {
    const result = await cancelPackagePurchase(
        req.schoolId,
        req.params.id,
        { reason: req.body?.reason },
        req.user
    );
    res.json({ success: true, data: result });
});

export const getSessionBillingReports = asyncHandler(async (req, res) => {
    const report = await getBillingReport(req.schoolId, req.query || {});
    res.json({ success: true, data: { catalog: BILLING_REPORTS, report } });
});

export const getSessionBillingReportCatalog = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { catalog: BILLING_REPORTS } });
});

export const getSessionBillingForecast = asyncHandler(async (req, res) => {
    const forecast = await getBillingForecast(req.schoolId);
    res.json({ success: true, data: forecast });
});

export const getSessionBillingInsights = asyncHandler(async (req, res) => {
    const insights = await getBillingInsights(req.schoolId, req.query || {});
    res.json({ success: true, data: insights });
});

export const analyseSessionBilling = asyncHandler(async (req, res) => {
    const analysis = await generateBillingNarrative(req.schoolId, req.body || {});
    res.json({ success: true, data: analysis });
});

export const getSessionBillingMessages = asyncHandler(async (req, res) => {
    const messages = await getMessageCenter(req.schoolId, req.query || {});
    res.json({ success: true, data: messages });
});

export const getSessionBillingReminderPreview = asyncHandler(async (req, res) => {
    const preview = await getReminderPreview(req.schoolId, req.params.studentId, req.query || {});
    res.json({ success: true, data: preview });
});

export const sendSessionBillingReminder = asyncHandler(async (req, res) => {
    const results = await sendReminderEmail(req.schoolId, req.params.studentId, req.body || {}, req.user);
    const allSent = results.every((result) => result.status === 'sent');
    res.status(allSent ? 200 : 207).json({ success: allSent, data: results });
});

export const getSessionBillingReminderCandidates = asyncHandler(async (req, res) => {
    const candidates = await getReminderCandidates(req.schoolId, req.query || {});
    res.json({ success: true, data: candidates });
});

export const draftSessionBillingMessage = asyncHandler(async (req, res) => {
    const draft = await generateMessageDraft(req.schoolId, req.params.studentId, req.body || {});
    res.json({ success: true, data: draft });
});

export const getSessionBillingAudit = asyncHandler(async (req, res) => {
    const audit = await listBillingAudit(req.schoolId, req.query || {});
    res.json({ success: true, data: audit });
});

export const getSessionBillingManualOptions = asyncHandler(async (req, res) => {
    const options = await getManualEntryOptions(req.schoolId, req.user);
    res.json({ success: true, data: options });
});

export const listSessionBillingManualEntries = asyncHandler(async (req, res) => {
    const result = await getManualCharges(req.schoolId, req.user, { limit: req.query?.limit });
    res.json({ success: true, data: result });
});

export const createSessionBillingManualEntry = asyncHandler(async (req, res) => {
    const entry = await recordManualCharge(req.schoolId, req.user, req.body || {});
    res.status(201).json({ success: true, data: { entry } });
});

export const voidSessionBillingManualEntry = asyncHandler(async (req, res) => {
    const entry = await voidManualCharge(req.schoolId, req.user, req.params.id, {
        reason: req.body?.reason
    });
    res.json({ success: true, data: { entry } });
});

export const generateSessionBillingCharges = asyncHandler(async (req, res) => {
    const result = await generateChargesForSession(req.params.sessionId, req.schoolId);
    res.json({ success: true, data: result });
});

export const getSessionBillingFamilyStatement = asyncHandler(async (req, res) => {
    const statement = await getFamilyStatement(req.schoolId, req.user);
    res.json({ success: true, data: statement });
});

export const printSessionBillingFamilyStatement = asyncHandler(async (req, res) => {
    const family = await getFamilyStatement(req.schoolId, req.user);
    const owns = family.students.some((student) => student.student.id === String(req.params.studentId));
    if (!owns) {
        throw Object.assign(new Error('No lesson account is linked to this sign-in.'), { statusCode: 404 });
    }
    const html = await renderStatementDocument(req.schoolId, req.params.studentId, req.query || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

const sendCsv = (res, { filename, csv }) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}\r\n`);
};

export const exportSessionBillingStudents = asyncHandler(async (req, res) => {
    sendCsv(res, await exportStudentsCsv(req.schoolId, req.query || {}));
});

export const exportSessionBillingStatement = asyncHandler(async (req, res) => {
    sendCsv(res, await exportStatementCsv(req.schoolId, req.params.studentId));
});

export const exportSessionBillingReport = asyncHandler(async (req, res) => {
    sendCsv(res, await exportReportCsv(req.schoolId, req.query || {}));
});

export const printSessionBillingReport = asyncHandler(async (req, res) => {
    const html = await renderReportDocument(req.schoolId, req.query || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

export const getSessionBillingStatementEmailPreview = asyncHandler(async (req, res) => {
    const preview = await getStatementEmailPreview(req.schoolId, req.params.studentId, req.query || {});
    res.json({ success: true, data: preview });
});

export const getSessionBillingStatementEmailRoster = asyncHandler(async (req, res) => {
    const roster = await getStatementEmailRoster(req.schoolId, req.query || {});
    res.json({ success: true, data: roster });
});

export const sendSessionBillingStatementEmail = asyncHandler(async (req, res) => {
    const results = await sendStatementEmail(req.schoolId, req.params.studentId, req.body || {}, req.user);
    const allSent = results.every((result) => result.status === 'sent');
    res.status(allSent ? 200 : 207).json({ success: allSent, data: results });
});
