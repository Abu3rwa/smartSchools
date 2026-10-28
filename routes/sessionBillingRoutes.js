import express from 'express';
import { protect, requirePermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { requireFeature } from '../middleware/featureGate.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    addSessionBillingNote,
    analyseSessionBilling,
    archiveSessionBillingPackage,
    cancelSessionBillingPackagePurchase,
    createSessionBillingAdjustment,
    createSessionBillingManualEntry,
    createSessionBillingPackagePurchase,
    createSessionBillingPayment,
    createSessionBillingRefund,
    deleteSessionBillingNote,
    draftSessionBillingMessage,
    exportSessionBillingReport,
    exportSessionBillingStatement,
    exportSessionBillingStudents,
    generateSessionBillingCharges,
    getSessionBillingAccount,
    getSessionBillingAudit,
    getSessionBillingFamilyStatement,
    getSessionBillingForecast,
    getSessionBillingInsights,
    getSessionBillingLessons,
    getSessionBillingManualOptions,
    getSessionBillingMessages,
    getSessionBillingOverview,
    getSessionBillingPayments,
    getSessionBillingReceiptPreview,
    getSessionBillingReminderCandidates,
    getSessionBillingReminderPreview,
    getSessionBillingReportCatalog,
    getSessionBillingReports,
    getSessionBillingSettings,
    getSessionBillingStatement,
    getSessionBillingStatementEmailPreview,
    getSessionBillingStatementEmailRoster,
    getSessionBillingStudents,
    listSessionBillingIssues,
    listSessionBillingManualEntries,
    listSessionBillingPackagePurchases,
    listSessionBillingPackages,
    printSessionBillingReceipt,
    printSessionBillingReport,
    printSessionBillingStatement,
    printSessionBillingFamilyStatement,
    resolveSessionBillingIssue,
    saveSessionBillingPackage,
    sendSessionBillingReceipt,
    sendSessionBillingReminder,
    sendSessionBillingStatementEmail,
    updateSessionBillingSettings,
    voidSessionBillingEntry,
    voidSessionBillingManualEntry
} from '../controllers/sessionBillingController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('liveSessionBilling'));

const view = requirePermission(PERMISSIONS.VIEW_FINANCE_REPORTS);
const exportData = requirePermission(PERMISSIONS.EXPORT_FINANCE_DATA);
const emailFamilies = requirePermission(PERMISSIONS.EMAIL_FINANCE_STATEMENTS);
const manageRates = requirePermission(PERMISSIONS.MANAGE_FEE_STRUCTURES);
const recordPayments = requirePermission(PERMISSIONS.RECORD_PAYMENTS);
const voidPayments = requirePermission(PERMISSIONS.VOID_PAYMENTS);
const logMinutes = requirePermission(PERMISSIONS.LOG_SESSION_MINUTES);

/* Family self-service: the signed-in student or parent sees their own account. */
router.get('/family/statement', getSessionBillingFamilyStatement);
router.get('/family/statement/:studentId/print', printSessionBillingFamilyStatement);

/* Settings */
router.get('/settings', view, getSessionBillingSettings);
router.put('/settings', manageRates, updateSessionBillingSettings);

/* Overview, insights and forecast */
router.get('/overview', view, getSessionBillingOverview);
router.get('/insights', view, getSessionBillingInsights);
router.post('/insights/analysis', view, analyseSessionBilling);
router.get('/forecast', view, getSessionBillingForecast);

/* Student accounts */
router.get('/students', view, getSessionBillingStudents);
router.get('/students/:studentId', view, getSessionBillingAccount);
router.get('/students/:studentId/statement', view, getSessionBillingStatement);
router.get('/students/:studentId/print', view, printSessionBillingStatement);
router.get('/students/:studentId/export', exportData, exportSessionBillingStatement);
router.post('/students/:studentId/notes', manageRates, addSessionBillingNote);
router.delete('/students/:studentId/notes/:noteId', manageRates, deleteSessionBillingNote);

/* Lessons and unbilled queue */
router.get('/lessons', view, getSessionBillingLessons);
router.get('/issues', view, listSessionBillingIssues);
router.post('/issues/:id/resolve', manageRates, resolveSessionBillingIssue);
router.post('/sessions/:sessionId/generate', manageRates, generateSessionBillingCharges);

/* Payments, refunds and adjustments */
router.get('/payments', view, getSessionBillingPayments);
router.post('/payments', recordPayments, createSessionBillingPayment);
router.post('/refunds', recordPayments, createSessionBillingRefund);
router.post('/adjustments', recordPayments, createSessionBillingAdjustment);
router.post('/entries/:id/void', voidPayments, voidSessionBillingEntry);
router.get('/payments/:id/receipt/preview', emailFamilies, getSessionBillingReceiptPreview);
router.get('/payments/:id/receipt/print', view, printSessionBillingReceipt);
router.post('/payments/:id/receipt', emailFamilies, sendSessionBillingReceipt);

/* Packages */
router.get('/packages', view, listSessionBillingPackages);
router.post('/packages', manageRates, saveSessionBillingPackage);
router.get('/packages/purchases', view, listSessionBillingPackagePurchases);
router.post('/packages/purchases', recordPayments, createSessionBillingPackagePurchase);
router.post('/packages/purchases/:id/cancel', recordPayments, cancelSessionBillingPackagePurchase);
router.put('/packages/:id', manageRates, saveSessionBillingPackage);
router.delete('/packages/:id', manageRates, archiveSessionBillingPackage);

/* Reports */
router.get('/reports', view, getSessionBillingReports);
router.get('/reports/catalog', view, getSessionBillingReportCatalog);
router.get('/reports/print', view, printSessionBillingReport);
router.get('/reports/export', exportData, exportSessionBillingReport);

/* Communication */
router.get('/messages', view, getSessionBillingMessages);
router.get('/messages/reminders', view, getSessionBillingReminderCandidates);
router.get('/students/:studentId/reminder/preview', emailFamilies, getSessionBillingReminderPreview);
router.post('/students/:studentId/reminder', emailFamilies, sendSessionBillingReminder);
router.post('/students/:studentId/message-draft', emailFamilies, draftSessionBillingMessage);
router.get('/email/roster', emailFamilies, getSessionBillingStatementEmailRoster);
router.get('/students/:studentId/email/preview', emailFamilies, getSessionBillingStatementEmailPreview);
router.post('/students/:studentId/email', emailFamilies, sendSessionBillingStatementEmail);

/* Audit */
router.get('/audit', view, getSessionBillingAudit);

/* Exports */
router.get('/export/students', exportData, exportSessionBillingStudents);

/* Manual lesson time */
router.get('/manual/options', logMinutes, getSessionBillingManualOptions);
router.get('/manual/entries', logMinutes, listSessionBillingManualEntries);
router.post('/manual/entries', logMinutes, createSessionBillingManualEntry);
router.post('/manual/entries/:id/void', logMinutes, voidSessionBillingManualEntry);

export default router;
