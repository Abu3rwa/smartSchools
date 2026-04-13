import express from 'express';
import { protect, requirePermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    getFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure,
    getDiscounts, createDiscount, updateDiscount, deleteDiscount,
    getInvoices, getInvoice, createInvoice, generateBulkInvoices, updateInvoice, issueInvoice, cancelInvoice,
    recordPayment, getPayments, voidPayment,
    createPaymentPlan, getPaymentPlans, updatePaymentPlan,
    getFinanceSummary, getOutstandingReport, getStudentStatement,
    getParentBalance, getParentInvoices, getParentPayments
} from '../controllers/financeController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// ─── Fee Structures ─────────────────────────────────────
router.route('/fee-structures')
    .get(requirePermission(PERMISSIONS.VIEW_FEE_STRUCTURES), getFeeStructures)
    .post(requirePermission(PERMISSIONS.MANAGE_FEE_STRUCTURES), createFeeStructure);

router.route('/fee-structures/:id')
    .put(requirePermission(PERMISSIONS.MANAGE_FEE_STRUCTURES), updateFeeStructure)
    .delete(requirePermission(PERMISSIONS.MANAGE_FEE_STRUCTURES), deleteFeeStructure);

// ─── Discounts ──────────────────────────────────────────
router.route('/discounts')
    .get(requirePermission(PERMISSIONS.VIEW_FEE_STRUCTURES), getDiscounts)
    .post(requirePermission(PERMISSIONS.MANAGE_DISCOUNTS), createDiscount);

router.route('/discounts/:id')
    .put(requirePermission(PERMISSIONS.MANAGE_DISCOUNTS), updateDiscount)
    .delete(requirePermission(PERMISSIONS.MANAGE_DISCOUNTS), deleteDiscount);

// ─── Invoices ───────────────────────────────────────────
router.get('/invoices', requirePermission(PERMISSIONS.VIEW_INVOICES), getInvoices);
router.get('/invoices/:id', requirePermission(PERMISSIONS.VIEW_INVOICES), getInvoice);
router.post('/invoices', requirePermission(PERMISSIONS.CREATE_INVOICES), createInvoice);
router.post('/invoices/generate', requirePermission(PERMISSIONS.CREATE_INVOICES), generateBulkInvoices);
router.put('/invoices/:id', requirePermission(PERMISSIONS.CREATE_INVOICES), updateInvoice);
router.post('/invoices/:id/issue', requirePermission(PERMISSIONS.CREATE_INVOICES), issueInvoice);
router.post('/invoices/:id/cancel', requirePermission(PERMISSIONS.CANCEL_INVOICES), cancelInvoice);

// ─── Payments ───────────────────────────────────────────
router.post('/payments', requirePermission(PERMISSIONS.RECORD_PAYMENTS), recordPayment);
router.get('/payments', requirePermission(PERMISSIONS.VIEW_INVOICES), getPayments);
router.delete('/payments/:id', requirePermission(PERMISSIONS.VOID_PAYMENTS), voidPayment);

// ─── Payment Plans ──────────────────────────────────────
router.post('/payment-plans', requirePermission(PERMISSIONS.MANAGE_PAYMENT_PLANS), createPaymentPlan);
router.get('/payment-plans/:studentId', requirePermission(PERMISSIONS.VIEW_INVOICES), getPaymentPlans);
router.put('/payment-plans/:id', requirePermission(PERMISSIONS.MANAGE_PAYMENT_PLANS), updatePaymentPlan);

// ─── Reports ────────────────────────────────────────────
router.get('/reports/summary', requirePermission(PERMISSIONS.VIEW_FINANCE_REPORTS), getFinanceSummary);
router.get('/reports/outstanding', requirePermission(PERMISSIONS.VIEW_FINANCE_REPORTS), getOutstandingReport);
router.get('/reports/student/:id', requirePermission(PERMISSIONS.VIEW_STUDENT_FINANCE), getStudentStatement);

// ─── Parent Access ──────────────────────────────────────
router.get('/parent/balance', getParentBalance);
router.get('/parent/invoices', getParentInvoices);
router.get('/parent/payments', getParentPayments);

export default router;
