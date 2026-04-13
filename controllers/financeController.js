import FeeStructure from '../models/FeeStructure.js';
import Discount from '../models/Discount.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import PaymentPlan from '../models/PaymentPlan.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';

// ─── Helpers ────────────────────────────────────────────

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function generateInvoiceNumber(schoolId) {
    const count = await Invoice.countDocuments({ school: schoolId });
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
}

async function generateReceiptNumber(schoolId) {
    const count = await Payment.countDocuments({ school: schoolId });
    const year = new Date().getFullYear();
    return `RCT-${year}-${String(count + 1).padStart(6, '0')}`;
}

// ─── Fee Structures ─────────────────────────────────────

export const getFeeStructures = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, search, category, frequency, academicYear, isActive } = req.query;
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = String(limit).toLowerCase() === 'all'
        ? 0
        : Math.max(parseInt(limit, 10) || 50, 0);
    const shouldPaginate = parsedLimit > 0;

    const query = { school: req.schoolId };
    if (search) {
        const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
        query.name = searchRegex;
    }
    if (category) query.category = category;
    if (frequency) query.frequency = frequency;
    if (academicYear) query.academicYear = academicYear;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    let q = FeeStructure.find(query).sort({ category: 1, name: 1 });
    if (shouldPaginate) q = q.skip((parsedPage - 1) * parsedLimit).limit(parsedLimit);

    const [feeStructures, total] = await Promise.all([
        q,
        FeeStructure.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: {
            feeStructures,
            pagination: {
                page: parsedPage,
                limit: shouldPaginate ? parsedLimit : total,
                total,
                pages: shouldPaginate ? Math.max(1, Math.ceil(total / parsedLimit)) : 1
            }
        }
    });
});

export const createFeeStructure = asyncHandler(async (req, res) => {
    const { name, category, amount, frequency, appliesTo, academicYear, optional, description } = req.body;
    if (!name || !category || amount == null || !frequency || !academicYear) {
        return res.status(400).json({ success: false, message: 'name, category, amount, frequency, and academicYear are required' });
    }

    const feeStructure = await FeeStructure.create({
        school: req.schoolId,
        name: name.trim(),
        category,
        amount,
        frequency,
        appliesTo: appliesTo || {},
        academicYear: academicYear.trim(),
        optional: !!optional,
        description: description?.trim() || '',
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: feeStructure });
});

export const updateFeeStructure = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const feeStructure = await FeeStructure.findOne({ _id: id, school: req.schoolId });
    if (!feeStructure) {
        return res.status(404).json({ success: false, message: 'Fee structure not found' });
    }

    const allowed = ['name', 'category', 'amount', 'frequency', 'appliesTo', 'academicYear', 'optional', 'description', 'isActive'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) feeStructure[key] = req.body[key];
    }
    await feeStructure.save();

    res.json({ success: true, data: feeStructure });
});

export const deleteFeeStructure = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const feeStructure = await FeeStructure.findOne({ _id: id, school: req.schoolId });
    if (!feeStructure) {
        return res.status(404).json({ success: false, message: 'Fee structure not found' });
    }
    // Soft delete
    feeStructure.isActive = false;
    await feeStructure.save();
    res.json({ success: true, message: 'Fee structure deactivated' });
});

// ─── Discounts ──────────────────────────────────────────

export const getDiscounts = asyncHandler(async (req, res) => {
    const { isActive } = req.query;
    const query = { school: req.schoolId };
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const discounts = await Discount.find(query).sort({ name: 1 });
    res.json({ success: true, data: { discounts } });
});

export const createDiscount = asyncHandler(async (req, res) => {
    const { name, type, value, criteria, maxAmount, applicableFeeCategories } = req.body;
    if (!name || !type || value == null) {
        return res.status(400).json({ success: false, message: 'name, type, and value are required' });
    }
    if (type === 'percentage' && (value < 0 || value > 100)) {
        return res.status(400).json({ success: false, message: 'Percentage value must be 0-100' });
    }

    const discount = await Discount.create({
        school: req.schoolId,
        name: name.trim(),
        type,
        value,
        criteria: criteria || {},
        maxAmount: maxAmount || null,
        applicableFeeCategories: applicableFeeCategories || [],
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: discount });
});

export const updateDiscount = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const discount = await Discount.findOne({ _id: id, school: req.schoolId });
    if (!discount) {
        return res.status(404).json({ success: false, message: 'Discount not found' });
    }

    const allowed = ['name', 'type', 'value', 'criteria', 'maxAmount', 'applicableFeeCategories', 'isActive'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) discount[key] = req.body[key];
    }
    await discount.save();
    res.json({ success: true, data: discount });
});

export const deleteDiscount = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await Discount.findOneAndDelete({ _id: id, school: req.schoolId });
    if (!result) {
        return res.status(404).json({ success: false, message: 'Discount not found' });
    }
    res.json({ success: true, message: 'Discount deleted' });
});

// ─── Invoices ───────────────────────────────────────────

export const getInvoices = asyncHandler(async (req, res) => {
    const { page = 1, limit = 25, status, studentId, classId, academicYear, dateFrom, dateTo, search } = req.query;
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 25, 1);

    const query = { school: req.schoolId };
    if (status) query.status = status;
    if (studentId) query.student = studentId;
    if (academicYear) query.academicYear = academicYear;
    if (dateFrom || dateTo) {
        query.dueDate = {};
        if (dateFrom) query.dueDate.$gte = new Date(dateFrom);
        if (dateTo) query.dueDate.$lte = new Date(dateTo);
    }
    if (search) {
        const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
        query.invoiceNumber = searchRegex;
    }

    // If classId, resolve students in that class
    if (classId) {
        const classStudents = await Student.find({ school: req.schoolId, class: classId }).select('_id');
        query.student = { $in: classStudents.map((s) => s._id) };
    }

    const [invoices, total] = await Promise.all([
        Invoice.find(query)
            .populate('student', 'firstName lastName studentId class')
            .sort({ createdAt: -1 })
            .skip((parsedPage - 1) * parsedLimit)
            .limit(parsedLimit),
        Invoice.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: {
            invoices,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total,
                pages: Math.max(1, Math.ceil(total / parsedLimit))
            }
        }
    });
});

export const getInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ _id: id, school: req.schoolId })
        .populate('student', 'firstName lastName studentId class')
        .populate('items.feeStructure', 'name category')
        .populate('items.discountRef', 'name type value')
        .populate('createdBy', 'firstName lastName');

    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const payments = await Payment.find({ invoice: id, school: req.schoolId, voided: false })
        .populate('receivedBy', 'firstName lastName')
        .sort({ receivedAt: -1 });

    res.json({ success: true, data: { invoice, payments } });
});

export const createInvoice = asyncHandler(async (req, res) => {
    const { studentId, items, dueDate, academicYear, term, notes } = req.body;
    if (!studentId || !items?.length || !dueDate || !academicYear) {
        return res.status(400).json({ success: false, message: 'studentId, items, dueDate, and academicYear are required' });
    }

    const student = await Student.findOne({ _id: studentId, school: req.schoolId });
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const invoiceNumber = await generateInvoiceNumber(req.schoolId);
    let totalAmount = 0;
    let discountAmount = 0;

    const invoiceItems = items.map((item) => {
        const amt = Number(item.amount) || 0;
        const disc = Number(item.discount) || 0;
        totalAmount += amt;
        discountAmount += disc;
        return {
            feeStructure: item.feeStructureId || undefined,
            description: item.description,
            amount: amt,
            discount: disc,
            discountRef: item.discountId || undefined,
            net: Math.max(0, amt - disc)
        };
    });

    const netAmount = Math.max(0, totalAmount - discountAmount);

    const invoice = await Invoice.create({
        school: req.schoolId,
        student: studentId,
        invoiceNumber,
        items: invoiceItems,
        totalAmount,
        discountAmount,
        netAmount,
        dueDate: new Date(dueDate),
        academicYear: academicYear.trim(),
        term: term?.trim() || '',
        notes: notes?.trim() || '',
        balance: netAmount,
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: invoice });
});

export const generateBulkInvoices = asyncHandler(async (req, res) => {
    const { feeStructureIds, classId, grade, dueDate, academicYear, term } = req.body;
    if (!feeStructureIds?.length || !dueDate || !academicYear) {
        return res.status(400).json({ success: false, message: 'feeStructureIds, dueDate, and academicYear are required' });
    }
    if (!classId && grade == null) {
        return res.status(400).json({ success: false, message: 'classId or grade is required' });
    }

    // Find applicable fee structures
    const feeStructures = await FeeStructure.find({
        _id: { $in: feeStructureIds },
        school: req.schoolId,
        isActive: true
    });
    if (!feeStructures.length) {
        return res.status(404).json({ success: false, message: 'No active fee structures found' });
    }

    // Find students
    const studentQuery = { school: req.schoolId };
    if (classId) studentQuery.class = classId;
    else if (grade != null) studentQuery.grade = grade;

    const students = await Student.find(studentQuery).select('_id firstName lastName');
    if (!students.length) {
        return res.status(404).json({ success: false, message: 'No students found for the given criteria' });
    }

    // Load applicable discounts
    const discounts = await Discount.find({ school: req.schoolId, isActive: true });

    const created = [];
    const errors = [];

    for (const student of students) {
        try {
            const invoiceNumber = await generateInvoiceNumber(req.schoolId);
            let totalAmount = 0;
            let discountAmount = 0;

            const invoiceItems = feeStructures.map((fs) => {
                const amt = fs.amount;
                // Auto-apply matching discounts
                let disc = 0;
                let discRef;
                for (const d of discounts) {
                    if (d.applicableFeeCategories.length && !d.applicableFeeCategories.includes(fs.category)) continue;
                    const calculated = d.type === 'percentage'
                        ? Math.min(amt * d.value / 100, d.maxAmount || Infinity)
                        : Math.min(d.value, amt);
                    if (calculated > disc) {
                        disc = calculated;
                        discRef = d._id;
                    }
                }
                totalAmount += amt;
                discountAmount += disc;
                return {
                    feeStructure: fs._id,
                    description: fs.name,
                    amount: amt,
                    discount: disc,
                    discountRef: discRef,
                    net: Math.max(0, amt - disc)
                };
            });

            const netAmount = Math.max(0, totalAmount - discountAmount);

            const invoice = await Invoice.create({
                school: req.schoolId,
                student: student._id,
                invoiceNumber,
                items: invoiceItems,
                totalAmount,
                discountAmount,
                netAmount,
                dueDate: new Date(dueDate),
                academicYear: academicYear.trim(),
                term: term?.trim() || '',
                balance: netAmount,
                createdBy: req.user._id
            });
            created.push(invoice._id);
        } catch (err) {
            errors.push({ studentId: student._id, name: `${student.firstName} ${student.lastName}`, error: err.message });
        }
    }

    res.status(201).json({
        success: true,
        data: { created: created.length, errors: errors.length, invoiceIds: created, errors }
    });
});

export const updateInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ _id: id, school: req.schoolId });
    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (invoice.status !== 'draft') {
        return res.status(400).json({ success: false, message: 'Only draft invoices can be edited' });
    }

    const allowed = ['items', 'dueDate', 'term', 'notes'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) invoice[key] = req.body[key];
    }

    // Recalculate totals if items changed
    if (req.body.items) {
        let totalAmount = 0;
        let discountAmount = 0;
        invoice.items.forEach((item) => {
            totalAmount += item.amount;
            discountAmount += item.discount;
        });
        invoice.totalAmount = totalAmount;
        invoice.discountAmount = discountAmount;
        invoice.netAmount = Math.max(0, totalAmount - discountAmount);
        invoice.balance = invoice.netAmount - invoice.paidAmount;
    }

    await invoice.save();
    res.json({ success: true, data: invoice });
});

export const issueInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ _id: id, school: req.schoolId });
    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (invoice.status !== 'draft') {
        return res.status(400).json({ success: false, message: 'Invoice is already issued' });
    }

    invoice.status = 'issued';
    invoice.issuedAt = new Date();
    await invoice.save();

    res.json({ success: true, data: invoice });
});

export const cancelInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await Invoice.findOne({ _id: id, school: req.schoolId });
    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (invoice.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'Invoice is already cancelled' });
    }
    if (invoice.paidAmount > 0) {
        return res.status(400).json({ success: false, message: 'Cannot cancel invoice with payments. Void payments first.' });
    }

    invoice.status = 'cancelled';
    invoice.cancelledAt = new Date();
    invoice.cancelledBy = req.user._id;
    invoice.cancelReason = req.body.reason?.trim() || '';
    await invoice.save();

    res.json({ success: true, data: invoice });
});

// ─── Payments ───────────────────────────────────────────

export const recordPayment = asyncHandler(async (req, res) => {
    const { invoiceId, amount, method, reference, receivedAt, notes } = req.body;
    if (!invoiceId || !amount || !method) {
        return res.status(400).json({ success: false, message: 'invoiceId, amount, and method are required' });
    }

    const invoice = await Invoice.findOne({ _id: invoiceId, school: req.schoolId });
    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    if (invoice.status === 'cancelled') {
        return res.status(400).json({ success: false, message: 'Cannot record payment on cancelled invoice' });
    }
    if (invoice.status === 'paid') {
        return res.status(400).json({ success: false, message: 'Invoice is already fully paid' });
    }

    const paymentAmount = Number(amount);
    if (paymentAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Payment amount must be positive' });
    }
    if (paymentAmount > invoice.balance) {
        return res.status(400).json({ success: false, message: `Payment amount exceeds balance of ${invoice.balance}` });
    }

    const receiptNumber = await generateReceiptNumber(req.schoolId);

    const payment = await Payment.create({
        school: req.schoolId,
        invoice: invoice._id,
        student: invoice.student,
        amount: paymentAmount,
        method,
        reference: reference?.trim() || '',
        receivedBy: req.user._id,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        notes: notes?.trim() || '',
        receiptNumber
    });

    // Update invoice
    invoice.paidAmount += paymentAmount;
    await invoice.save(); // pre-save hook recalculates balance + status

    res.status(201).json({ success: true, data: { payment, invoice } });
});

export const getPayments = asyncHandler(async (req, res) => {
    const { page = 1, limit = 25, method, studentId, dateFrom, dateTo, search } = req.query;
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 25, 1);

    const query = { school: req.schoolId, voided: false };
    if (method) query.method = method;
    if (studentId) query.student = studentId;
    if (dateFrom || dateTo) {
        query.receivedAt = {};
        if (dateFrom) query.receivedAt.$gte = new Date(dateFrom);
        if (dateTo) query.receivedAt.$lte = new Date(dateTo);
    }
    if (search) {
        const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [{ receiptNumber: searchRegex }, { reference: searchRegex }];
    }

    const [payments, total] = await Promise.all([
        Payment.find(query)
            .populate('student', 'firstName lastName studentId')
            .populate('invoice', 'invoiceNumber netAmount')
            .populate('receivedBy', 'firstName lastName')
            .sort({ receivedAt: -1 })
            .skip((parsedPage - 1) * parsedLimit)
            .limit(parsedLimit),
        Payment.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: {
            payments,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total,
                pages: Math.max(1, Math.ceil(total / parsedLimit))
            }
        }
    });
});

export const voidPayment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payment = await Payment.findOne({ _id: id, school: req.schoolId });
    if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (payment.voided) {
        return res.status(400).json({ success: false, message: 'Payment is already voided' });
    }

    payment.voided = true;
    payment.voidedAt = new Date();
    payment.voidedBy = req.user._id;
    payment.voidReason = req.body.reason?.trim() || '';
    await payment.save();

    // Update invoice
    const invoice = await Invoice.findById(payment.invoice);
    if (invoice && invoice.status !== 'cancelled') {
        invoice.paidAmount = Math.max(0, invoice.paidAmount - payment.amount);
        await invoice.save(); // pre-save hook recalculates balance + status
    }

    res.json({ success: true, data: payment });
});

// ─── Payment Plans ──────────────────────────────────────

export const createPaymentPlan = asyncHandler(async (req, res) => {
    const { invoiceId, installments } = req.body;
    if (!invoiceId || !installments?.length || installments.length < 2) {
        return res.status(400).json({ success: false, message: 'invoiceId and at least 2 installments are required' });
    }

    const invoice = await Invoice.findOne({ _id: invoiceId, school: req.schoolId });
    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Validate installment total matches balance
    const installmentTotal = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    if (Math.abs(installmentTotal - invoice.balance) > 0.01) {
        return res.status(400).json({
            success: false,
            message: `Installment total (${installmentTotal}) must match invoice balance (${invoice.balance})`
        });
    }

    const plan = await PaymentPlan.create({
        school: req.schoolId,
        student: invoice.student,
        invoice: invoice._id,
        installments: installments.map((i) => ({
            dueDate: new Date(i.dueDate),
            amount: Number(i.amount),
            status: 'pending'
        })),
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: plan });
});

export const getPaymentPlans = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const query = { school: req.schoolId };
    if (studentId) query.student = studentId;

    const plans = await PaymentPlan.find(query)
        .populate('student', 'firstName lastName studentId')
        .populate('invoice', 'invoiceNumber netAmount balance')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: { plans } });
});

export const updatePaymentPlan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const plan = await PaymentPlan.findOne({ _id: id, school: req.schoolId });
    if (!plan) {
        return res.status(404).json({ success: false, message: 'Payment plan not found' });
    }
    if (plan.status !== 'active') {
        return res.status(400).json({ success: false, message: 'Can only modify active plans' });
    }

    if (req.body.installments) {
        plan.installments = req.body.installments.map((i) => ({
            dueDate: new Date(i.dueDate),
            amount: Number(i.amount),
            status: i.status || 'pending',
            payment: i.paymentId || undefined
        }));
    }
    if (req.body.status) plan.status = req.body.status;

    await plan.save();
    res.json({ success: true, data: plan });
});

// ─── Reports ────────────────────────────────────────────

export const getFinanceSummary = asyncHandler(async (req, res) => {
    const { academicYear, dateFrom, dateTo } = req.query;
    const matchInvoice = { school: new mongoose.Types.ObjectId(req.schoolId) };
    if (academicYear) matchInvoice.academicYear = academicYear;

    const matchPayment = { school: new mongoose.Types.ObjectId(req.schoolId), voided: false };
    if (dateFrom || dateTo) {
        matchPayment.receivedAt = {};
        if (dateFrom) matchPayment.receivedAt.$gte = new Date(dateFrom);
        if (dateTo) matchPayment.receivedAt.$lte = new Date(dateTo);
    }

    const [invoiceStats, paymentStats, categoryBreakdown] = await Promise.all([
        Invoice.aggregate([
            { $match: { ...matchInvoice, status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: null,
                    totalBilled: { $sum: '$netAmount' },
                    totalPaid: { $sum: '$paidAmount' },
                    totalOutstanding: { $sum: '$balance' },
                    count: { $sum: 1 }
                }
            }
        ]),
        Payment.aggregate([
            { $match: matchPayment },
            {
                $group: {
                    _id: '$method',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]),
        Invoice.aggregate([
            { $match: { ...matchInvoice, status: { $ne: 'cancelled' } } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'feestructures',
                    localField: 'items.feeStructure',
                    foreignField: '_id',
                    as: 'feeInfo'
                }
            },
            { $unwind: { path: '$feeInfo', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$feeInfo.category',
                    totalAmount: { $sum: '$items.amount' },
                    totalDiscount: { $sum: '$items.discount' },
                    netAmount: { $sum: '$items.net' }
                }
            },
            { $sort: { netAmount: -1 } }
        ])
    ]);

    const summary = invoiceStats[0] || { totalBilled: 0, totalPaid: 0, totalOutstanding: 0, count: 0 };
    const collectionRate = summary.totalBilled > 0
        ? Math.round((summary.totalPaid / summary.totalBilled) * 100)
        : 0;

    res.json({
        success: true,
        data: {
            summary: { ...summary, collectionRate },
            paymentsByMethod: paymentStats,
            revenueByCategory: categoryBreakdown
        }
    });
});

export const getOutstandingReport = asyncHandler(async (req, res) => {
    const { academicYear, classId, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 50, 1);

    const query = {
        school: req.schoolId,
        status: { $in: ['issued', 'partially-paid', 'overdue'] },
        balance: { $gt: 0 }
    };
    if (academicYear) query.academicYear = academicYear;

    if (classId) {
        const classStudents = await Student.find({ school: req.schoolId, class: classId }).select('_id');
        query.student = { $in: classStudents.map((s) => s._id) };
    }

    const [invoices, total] = await Promise.all([
        Invoice.find(query)
            .populate('student', 'firstName lastName studentId class')
            .sort({ balance: -1 })
            .skip((parsedPage - 1) * parsedLimit)
            .limit(parsedLimit),
        Invoice.countDocuments(query)
    ]);

    const totalOutstanding = await Invoice.aggregate([
        { $match: { school: new mongoose.Types.ObjectId(req.schoolId), status: { $in: ['issued', 'partially-paid', 'overdue'] } } },
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);

    res.json({
        success: true,
        data: {
            invoices,
            totalOutstanding: totalOutstanding[0]?.total || 0,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total,
                pages: Math.max(1, Math.ceil(total / parsedLimit))
            }
        }
    });
});

export const getStudentStatement = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const student = await Student.findOne({ _id: id, school: req.schoolId }).select('firstName lastName studentId class grade');
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const [invoices, payments] = await Promise.all([
        Invoice.find({ student: id, school: req.schoolId, status: { $ne: 'cancelled' } })
            .sort({ createdAt: -1 }),
        Payment.find({ student: id, school: req.schoolId, voided: false })
            .sort({ receivedAt: -1 })
    ]);

    const totalBilled = invoices.reduce((sum, inv) => sum + inv.netAmount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
        success: true,
        data: {
            student,
            invoices,
            payments,
            summary: {
                totalBilled,
                totalPaid,
                balance: totalBilled - totalPaid
            }
        }
    });
});

// ─── Parent Access ──────────────────────────────────────

export const getParentBalance = asyncHandler(async (req, res) => {
    const studentIds = (req.user.children || []).map((c) => c.student || c);
    if (!studentIds.length) {
        return res.json({ success: true, data: { balances: [] } });
    }

    const invoices = await Invoice.aggregate([
        {
            $match: {
                student: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
                status: { $in: ['issued', 'partially-paid', 'overdue'] }
            }
        },
        {
            $group: {
                _id: '$student',
                totalDue: { $sum: '$balance' },
                invoiceCount: { $sum: 1 }
            }
        }
    ]);

    const students = await Student.find({ _id: { $in: studentIds } }).select('firstName lastName');
    const balances = students.map((s) => {
        const inv = invoices.find((i) => String(i._id) === String(s._id));
        return {
            studentId: s._id,
            name: `${s.firstName} ${s.lastName}`,
            totalDue: inv?.totalDue || 0,
            invoiceCount: inv?.invoiceCount || 0
        };
    });

    res.json({ success: true, data: { balances } });
});

export const getParentInvoices = asyncHandler(async (req, res) => {
    const { studentId } = req.query;
    const allowedStudents = (req.user.children || []).map((c) => String(c.student || c));

    if (studentId && !allowedStudents.includes(String(studentId))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const query = {
        student: { $in: studentId ? [studentId] : allowedStudents },
        status: { $ne: 'cancelled' }
    };

    const invoices = await Invoice.find(query)
        .populate('student', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(100);

    res.json({ success: true, data: { invoices } });
});

export const getParentPayments = asyncHandler(async (req, res) => {
    const { studentId } = req.query;
    const allowedStudents = (req.user.children || []).map((c) => String(c.student || c));

    if (studentId && !allowedStudents.includes(String(studentId))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const payments = await Payment.find({
        student: { $in: studentId ? [studentId] : allowedStudents },
        voided: false
    })
        .populate('student', 'firstName lastName')
        .populate('invoice', 'invoiceNumber')
        .sort({ receivedAt: -1 })
        .limit(100);

    res.json({ success: true, data: { payments } });
});
