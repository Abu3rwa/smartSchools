import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Fee Structures ─────────────────────────────────────
export const fetchFeeStructures = createAsyncThunk('finance/fetchFeeStructures', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/finance/fee-structures', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch fee structures'); }
});

export const createFeeStructure = createAsyncThunk('finance/createFeeStructure', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/finance/fee-structures', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create fee structure'); }
});

export const updateFeeStructure = createAsyncThunk('finance/updateFeeStructure', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/finance/fee-structures/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update fee structure'); }
});

export const deleteFeeStructure = createAsyncThunk('finance/deleteFeeStructure', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/finance/fee-structures/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete fee structure'); }
});

// ─── Discounts ──────────────────────────────────────────
export const fetchDiscounts = createAsyncThunk('finance/fetchDiscounts', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/finance/discounts', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch discounts'); }
});

export const createDiscount = createAsyncThunk('finance/createDiscount', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/finance/discounts', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create discount'); }
});

export const updateDiscount = createAsyncThunk('finance/updateDiscount', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/finance/discounts/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update discount'); }
});

export const deleteDiscount = createAsyncThunk('finance/deleteDiscount', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/finance/discounts/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete discount'); }
});

// ─── Invoices ───────────────────────────────────────────
export const fetchInvoices = createAsyncThunk('finance/fetchInvoices', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/finance/invoices', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch invoices'); }
});

export const fetchInvoice = createAsyncThunk('finance/fetchInvoice', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/finance/invoices/${id}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch invoice'); }
});

export const createInvoice = createAsyncThunk('finance/createInvoice', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/finance/invoices', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create invoice'); }
});

export const generateBulkInvoices = createAsyncThunk('finance/generateBulkInvoices', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/finance/invoices/generate', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to generate invoices'); }
});

export const issueInvoice = createAsyncThunk('finance/issueInvoice', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/finance/invoices/${id}/issue`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to issue invoice'); }
});

export const cancelInvoice = createAsyncThunk('finance/cancelInvoice', async ({ id, reason }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/finance/invoices/${id}/cancel`, { reason });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to cancel invoice'); }
});

// ─── Payments ───────────────────────────────────────────
export const recordPayment = createAsyncThunk('finance/recordPayment', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/finance/payments', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to record payment'); }
});

export const fetchPayments = createAsyncThunk('finance/fetchPayments', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/finance/payments', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch payments'); }
});

export const voidPayment = createAsyncThunk('finance/voidPayment', async ({ id, reason }, { rejectWithValue }) => {
    try {
        const res = await api.delete(`/finance/payments/${id}`, { data: { reason } });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to void payment'); }
});

// ─── Payment Plans ──────────────────────────────────────
export const createPaymentPlan = createAsyncThunk('finance/createPaymentPlan', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/finance/payment-plans', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create payment plan'); }
});

export const fetchPaymentPlans = createAsyncThunk('finance/fetchPaymentPlans', async (studentId, { rejectWithValue }) => {
    try {
        const res = await api.get(`/finance/payment-plans/${studentId}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch payment plans'); }
});

// ─── Reports ────────────────────────────────────────────
export const fetchFinanceSummary = createAsyncThunk('finance/fetchSummary', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/finance/reports/summary', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch summary'); }
});

export const fetchOutstandingReport = createAsyncThunk('finance/fetchOutstanding', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/finance/reports/outstanding', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch outstanding report'); }
});

export const fetchStudentStatement = createAsyncThunk('finance/fetchStudentStatement', async (studentId, { rejectWithValue }) => {
    try {
        const res = await api.get(`/finance/reports/student/${studentId}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch student statement'); }
});

// ─── Slice ──────────────────────────────────────────────
const financeSlice = createSlice({
    name: 'finance',
    initialState: {
        feeStructures: [],
        feeStructuresPagination: null,
        discounts: [],
        invoices: [],
        invoicesPagination: null,
        currentInvoice: null,
        currentInvoicePayments: [],
        payments: [],
        paymentsPagination: null,
        paymentPlans: [],
        summary: null,
        outstandingReport: null,
        studentStatement: null,
        bulkResult: null,
        loading: false,
        error: null
    },
    reducers: {
        clearError: (state) => { state.error = null; },
        clearCurrentInvoice: (state) => { state.currentInvoice = null; state.currentInvoicePayments = []; },
        clearBulkResult: (state) => { state.bulkResult = null; },
        clearStudentStatement: (state) => { state.studentStatement = null; }
    },
    extraReducers: (builder) => {
        const pending = (state) => { state.loading = true; state.error = null; };
        const rejected = (state, action) => { state.loading = false; state.error = action.payload; };

        builder
            // Fee Structures
            .addCase(fetchFeeStructures.pending, pending)
            .addCase(fetchFeeStructures.fulfilled, (state, action) => {
                state.loading = false;
                state.feeStructures = action.payload?.feeStructures || [];
                state.feeStructuresPagination = action.payload?.pagination || null;
            })
            .addCase(fetchFeeStructures.rejected, rejected)
            .addCase(createFeeStructure.fulfilled, (state, action) => {
                state.feeStructures.push(action.payload);
            })
            .addCase(updateFeeStructure.fulfilled, (state, action) => {
                const idx = state.feeStructures.findIndex((f) => f._id === action.payload._id);
                if (idx >= 0) state.feeStructures[idx] = action.payload;
            })
            .addCase(deleteFeeStructure.fulfilled, (state, action) => {
                state.feeStructures = state.feeStructures.filter((f) => f._id !== action.payload);
            })

            // Discounts
            .addCase(fetchDiscounts.fulfilled, (state, action) => {
                state.discounts = action.payload?.discounts || [];
            })
            .addCase(createDiscount.fulfilled, (state, action) => {
                state.discounts.push(action.payload);
            })
            .addCase(updateDiscount.fulfilled, (state, action) => {
                const idx = state.discounts.findIndex((d) => d._id === action.payload._id);
                if (idx >= 0) state.discounts[idx] = action.payload;
            })
            .addCase(deleteDiscount.fulfilled, (state, action) => {
                state.discounts = state.discounts.filter((d) => d._id !== action.payload);
            })

            // Invoices
            .addCase(fetchInvoices.pending, pending)
            .addCase(fetchInvoices.fulfilled, (state, action) => {
                state.loading = false;
                state.invoices = action.payload?.invoices || [];
                state.invoicesPagination = action.payload?.pagination || null;
            })
            .addCase(fetchInvoices.rejected, rejected)
            .addCase(fetchInvoice.pending, pending)
            .addCase(fetchInvoice.fulfilled, (state, action) => {
                state.loading = false;
                state.currentInvoice = action.payload?.invoice || null;
                state.currentInvoicePayments = action.payload?.payments || [];
            })
            .addCase(fetchInvoice.rejected, rejected)
            .addCase(createInvoice.fulfilled, (state, action) => {
                state.invoices.unshift(action.payload);
            })
            .addCase(generateBulkInvoices.pending, pending)
            .addCase(generateBulkInvoices.fulfilled, (state, action) => {
                state.loading = false;
                state.bulkResult = action.payload;
            })
            .addCase(generateBulkInvoices.rejected, rejected)
            .addCase(issueInvoice.fulfilled, (state, action) => {
                const idx = state.invoices.findIndex((i) => i._id === action.payload._id);
                if (idx >= 0) state.invoices[idx] = action.payload;
                if (state.currentInvoice?._id === action.payload._id) state.currentInvoice = action.payload;
            })
            .addCase(cancelInvoice.fulfilled, (state, action) => {
                const idx = state.invoices.findIndex((i) => i._id === action.payload._id);
                if (idx >= 0) state.invoices[idx] = action.payload;
                if (state.currentInvoice?._id === action.payload._id) state.currentInvoice = action.payload;
            })

            // Payments
            .addCase(fetchPayments.pending, pending)
            .addCase(fetchPayments.fulfilled, (state, action) => {
                state.loading = false;
                state.payments = action.payload?.payments || [];
                state.paymentsPagination = action.payload?.pagination || null;
            })
            .addCase(fetchPayments.rejected, rejected)
            .addCase(recordPayment.fulfilled, (state, action) => {
                if (action.payload?.payment) state.payments.unshift(action.payload.payment);
                if (action.payload?.invoice && state.currentInvoice?._id === action.payload.invoice._id) {
                    state.currentInvoice = action.payload.invoice;
                }
            })
            .addCase(voidPayment.fulfilled, (state, action) => {
                state.payments = state.payments.filter((p) => p._id !== action.payload._id);
            })

            // Payment Plans
            .addCase(fetchPaymentPlans.fulfilled, (state, action) => {
                state.paymentPlans = action.payload?.plans || [];
            })
            .addCase(createPaymentPlan.fulfilled, (state, action) => {
                state.paymentPlans.unshift(action.payload);
            })

            // Reports
            .addCase(fetchFinanceSummary.pending, pending)
            .addCase(fetchFinanceSummary.fulfilled, (state, action) => {
                state.loading = false;
                state.summary = action.payload;
            })
            .addCase(fetchFinanceSummary.rejected, rejected)
            .addCase(fetchOutstandingReport.fulfilled, (state, action) => {
                state.outstandingReport = action.payload;
            })
            .addCase(fetchStudentStatement.fulfilled, (state, action) => {
                state.studentStatement = action.payload;
            });
    }
});

export const { clearError, clearCurrentInvoice, clearBulkResult, clearStudentStatement } = financeSlice.actions;

export const selectFeeStructures = (state) => state.finance.feeStructures;
export const selectDiscounts = (state) => state.finance.discounts;
export const selectInvoices = (state) => state.finance.invoices;
export const selectInvoicesPagination = (state) => state.finance.invoicesPagination;
export const selectCurrentInvoice = (state) => state.finance.currentInvoice;
export const selectCurrentInvoicePayments = (state) => state.finance.currentInvoicePayments;
export const selectPayments = (state) => state.finance.payments;
export const selectPaymentsPagination = (state) => state.finance.paymentsPagination;
export const selectPaymentPlans = (state) => state.finance.paymentPlans;
export const selectFinanceSummary = (state) => state.finance.summary;
export const selectOutstandingReport = (state) => state.finance.outstandingReport;
export const selectStudentStatement = (state) => state.finance.studentStatement;
export const selectBulkResult = (state) => state.finance.bulkResult;
export const selectFinanceLoading = (state) => state.finance.loading;
export const selectFinanceError = (state) => state.finance.error;

export default financeSlice.reducer;
