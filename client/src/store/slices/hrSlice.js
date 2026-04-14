import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── HR Settings ────────────────────────────────────────
export const fetchHRSettings = createAsyncThunk('hr/fetchHRSettings', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/settings');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch HR settings'); }
});

export const updateHRSettings = createAsyncThunk('hr/updateHRSettings', async (data, { rejectWithValue }) => {
    try {
        const res = await api.put('/hr/settings', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update HR settings'); }
});

// ─── Dashboard ──────────────────────────────────────────
export const fetchHRDashboard = createAsyncThunk('hr/fetchHRDashboard', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/dashboard');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch HR dashboard'); }
});

// ─── Staff Profiles ─────────────────────────────────────
export const fetchStaffProfiles = createAsyncThunk('hr/fetchStaffProfiles', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/staff', { params });
        return res.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch staff profiles'); }
});

export const fetchStaffProfile = createAsyncThunk('hr/fetchStaffProfile', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/hr/staff/${id}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch staff profile'); }
});

export const createStaffProfile = createAsyncThunk('hr/createStaffProfile', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/staff', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create staff profile'); }
});

export const updateStaffProfile = createAsyncThunk('hr/updateStaffProfile', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/staff/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update staff profile'); }
});

export const fetchStaffDirectory = createAsyncThunk('hr/fetchStaffDirectory', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/directory');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch staff directory'); }
});

export const fetchMyProfile = createAsyncThunk('hr/fetchMyProfile', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/me/profile');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch your profile'); }
});

// ─── Contracts ──────────────────────────────────────────
export const fetchContracts = createAsyncThunk('hr/fetchContracts', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/contracts', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch contracts'); }
});

export const createContract = createAsyncThunk('hr/createContract', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/contracts', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create contract'); }
});

export const updateContract = createAsyncThunk('hr/updateContract', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/contracts/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update contract'); }
});

export const terminateContract = createAsyncThunk('hr/terminateContract', async ({ id, reason }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/contracts/${id}/terminate`, { reason });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to terminate contract'); }
});

export const fetchExpiringContracts = createAsyncThunk('hr/fetchExpiringContracts', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/contracts/expiring', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch expiring contracts'); }
});

// ─── Leave Types ────────────────────────────────────────
export const fetchLeaveTypes = createAsyncThunk('hr/fetchLeaveTypes', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/leave-types', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch leave types'); }
});

export const createLeaveType = createAsyncThunk('hr/createLeaveType', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/leave-types', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create leave type'); }
});

export const updateLeaveType = createAsyncThunk('hr/updateLeaveType', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/leave-types/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update leave type'); }
});

export const deleteLeaveType = createAsyncThunk('hr/deleteLeaveType', async (id, { rejectWithValue }) => {
    try {
        const res = await api.delete(`/hr/leave-types/${id}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete leave type'); }
});

// ─── Leave Balances ─────────────────────────────────────
export const fetchLeaveBalances = createAsyncThunk('hr/fetchLeaveBalances', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/leave-balances', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch leave balances'); }
});

export const fetchMyLeaveBalances = createAsyncThunk('hr/fetchMyLeaveBalances', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/me/leave-balances', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch your leave balances'); }
});

export const adjustLeaveBalance = createAsyncThunk('hr/adjustLeaveBalance', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/leave-balances/${id}/adjust`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to adjust leave balance'); }
});

export const bulkAllocateBalances = createAsyncThunk('hr/bulkAllocateBalances', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/leave-balances/allocate', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to allocate leave balances'); }
});

// ─── Leave Requests ─────────────────────────────────────
export const fetchLeaveRequests = createAsyncThunk('hr/fetchLeaveRequests', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/leave-requests', { params });
        return res.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch leave requests'); }
});

export const fetchMyLeaveRequests = createAsyncThunk('hr/fetchMyLeaveRequests', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/me/leave');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch your leave requests'); }
});

export const submitLeaveRequest = createAsyncThunk('hr/submitLeaveRequest', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/leave-requests', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to submit leave request'); }
});

export const approveLeaveRequest = createAsyncThunk('hr/approveLeaveRequest', async ({ id, note }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/leave-requests/${id}/approve`, { note });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to approve leave request'); }
});

export const rejectLeaveRequest = createAsyncThunk('hr/rejectLeaveRequest', async ({ id, note }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/leave-requests/${id}/reject`, { note });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to reject leave request'); }
});

export const cancelLeaveRequest = createAsyncThunk('hr/cancelLeaveRequest', async ({ id, reason }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/leave-requests/${id}/cancel`, { reason });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to cancel leave request'); }
});

export const fetchLeaveCalendar = createAsyncThunk('hr/fetchLeaveCalendar', async (params, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/leave-calendar', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch leave calendar'); }
});

// ─── Certifications ─────────────────────────────────────
export const fetchCertifications = createAsyncThunk('hr/fetchCertifications', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/certifications', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch certifications'); }
});

export const fetchMyCertifications = createAsyncThunk('hr/fetchMyCertifications', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/me/certifications');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch your certifications'); }
});

export const createCertification = createAsyncThunk('hr/createCertification', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/certifications', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create certification'); }
});

export const updateCertification = createAsyncThunk('hr/updateCertification', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/certifications/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update certification'); }
});

export const deleteCertification = createAsyncThunk('hr/deleteCertification', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/hr/certifications/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete certification'); }
});

// ─── Professional Development ───────────────────────────
export const fetchPDRecords = createAsyncThunk('hr/fetchPDRecords', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/pd', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch PD records'); }
});

export const fetchMyPDRecords = createAsyncThunk('hr/fetchMyPDRecords', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/me/pd');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch your PD records'); }
});

export const createPDRecord = createAsyncThunk('hr/createPDRecord', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/pd', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create PD record'); }
});

export const updatePDRecord = createAsyncThunk('hr/updatePDRecord', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/pd/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update PD record'); }
});

export const deletePDRecord = createAsyncThunk('hr/deletePDRecord', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/hr/pd/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete PD record'); }
});

export const fetchPDSummary = createAsyncThunk('hr/fetchPDSummary', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/pd/summary', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch PD summary'); }
});

// ─── Performance Reviews ────────────────────────────────
export const fetchReviews = createAsyncThunk('hr/fetchReviews', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/reviews', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch reviews'); }
});

export const fetchMyReviews = createAsyncThunk('hr/fetchMyReviews', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/hr/me/reviews');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch your reviews'); }
});

export const createReview = createAsyncThunk('hr/createReview', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/hr/reviews', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create review'); }
});

export const updateReview = createAsyncThunk('hr/updateReview', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/reviews/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update review'); }
});

export const submitSelfAssessment = createAsyncThunk('hr/submitSelfAssessment', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/reviews/${id}/self-assessment`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to submit self-assessment'); }
});

export const acknowledgeReview = createAsyncThunk('hr/acknowledgeReview', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/hr/reviews/${id}/acknowledge`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to acknowledge review'); }
});

// ─── Slice ──────────────────────────────────────────────
const hrSlice = createSlice({
    name: 'hr',
    initialState: {
        settings: null,
        dashboard: null,
        staffProfiles: [], staffPagination: null, currentStaffProfile: null, staffDirectory: [],
        myProfile: null,
        contracts: [], expiringContracts: [],
        leaveTypes: [],
        leaveBalances: [], myLeaveBalances: [],
        leaveRequests: [], leaveRequestsPagination: null, myLeaveRequests: [], leaveCalendar: [],
        certifications: [], myCertifications: [],
        pdRecords: [], myPDRecords: [], pdSummary: null,
        reviews: [], myReviews: [],
        loading: false, error: null,
    },
    reducers: {
        clearHRError: (state) => { state.error = null; },
        clearCurrentStaffProfile: (state) => { state.currentStaffProfile = null; },
    },
    extraReducers: (builder) => {
        const pending = (state) => { state.loading = true; state.error = null; };
        const rejected = (state, action) => { state.loading = false; state.error = action.payload; };

        builder
            // Settings
            .addCase(fetchHRSettings.pending, pending)
            .addCase(fetchHRSettings.fulfilled, (state, action) => { state.loading = false; state.settings = action.payload; })
            .addCase(fetchHRSettings.rejected, rejected)
            .addCase(updateHRSettings.fulfilled, (state, action) => { state.settings = action.payload; })

            // Dashboard
            .addCase(fetchHRDashboard.pending, pending)
            .addCase(fetchHRDashboard.fulfilled, (state, action) => { state.loading = false; state.dashboard = action.payload; })
            .addCase(fetchHRDashboard.rejected, rejected)

            // Staff Profiles
            .addCase(fetchStaffProfiles.pending, pending)
            .addCase(fetchStaffProfiles.fulfilled, (state, action) => {
                state.loading = false;
                state.staffProfiles = action.payload.data;
                state.staffPagination = action.payload.pagination;
            })
            .addCase(fetchStaffProfiles.rejected, rejected)
            .addCase(fetchStaffProfile.pending, pending)
            .addCase(fetchStaffProfile.fulfilled, (state, action) => { state.loading = false; state.currentStaffProfile = action.payload; })
            .addCase(fetchStaffProfile.rejected, rejected)
            .addCase(createStaffProfile.fulfilled, (state, action) => { state.staffProfiles.unshift(action.payload); })
            .addCase(updateStaffProfile.fulfilled, (state, action) => {
                const idx = state.staffProfiles.findIndex(s => s._id === action.payload._id);
                if (idx !== -1) state.staffProfiles[idx] = action.payload;
                if (state.currentStaffProfile?._id === action.payload._id) state.currentStaffProfile = action.payload;
            })
            .addCase(fetchStaffDirectory.fulfilled, (state, action) => { state.staffDirectory = action.payload; })
            .addCase(fetchMyProfile.pending, pending)
            .addCase(fetchMyProfile.fulfilled, (state, action) => { state.loading = false; state.myProfile = action.payload; })
            .addCase(fetchMyProfile.rejected, rejected)

            // Contracts
            .addCase(fetchContracts.pending, pending)
            .addCase(fetchContracts.fulfilled, (state, action) => { state.loading = false; state.contracts = action.payload; })
            .addCase(fetchContracts.rejected, rejected)
            .addCase(createContract.fulfilled, (state, action) => { state.contracts.unshift(action.payload); })
            .addCase(updateContract.fulfilled, (state, action) => {
                const idx = state.contracts.findIndex(c => c._id === action.payload._id);
                if (idx !== -1) state.contracts[idx] = action.payload;
            })
            .addCase(terminateContract.fulfilled, (state, action) => {
                const idx = state.contracts.findIndex(c => c._id === action.payload._id);
                if (idx !== -1) state.contracts[idx] = action.payload;
            })
            .addCase(fetchExpiringContracts.fulfilled, (state, action) => { state.expiringContracts = action.payload; })

            // Leave Types
            .addCase(fetchLeaveTypes.pending, pending)
            .addCase(fetchLeaveTypes.fulfilled, (state, action) => { state.loading = false; state.leaveTypes = action.payload; })
            .addCase(fetchLeaveTypes.rejected, rejected)
            .addCase(createLeaveType.fulfilled, (state, action) => { state.leaveTypes.push(action.payload); })
            .addCase(updateLeaveType.fulfilled, (state, action) => {
                const idx = state.leaveTypes.findIndex(t => t._id === action.payload._id);
                if (idx !== -1) state.leaveTypes[idx] = action.payload;
            })
            .addCase(deleteLeaveType.fulfilled, (state, action) => {
                const idx = state.leaveTypes.findIndex(t => t._id === action.payload._id);
                if (idx !== -1) state.leaveTypes[idx] = action.payload;
            })

            // Leave Balances
            .addCase(fetchLeaveBalances.fulfilled, (state, action) => { state.leaveBalances = action.payload; })
            .addCase(fetchMyLeaveBalances.fulfilled, (state, action) => { state.myLeaveBalances = action.payload; })
            .addCase(adjustLeaveBalance.fulfilled, (state, action) => {
                const idx = state.leaveBalances.findIndex(b => b._id === action.payload._id);
                if (idx !== -1) state.leaveBalances[idx] = action.payload;
            })

            // Leave Requests
            .addCase(fetchLeaveRequests.pending, pending)
            .addCase(fetchLeaveRequests.fulfilled, (state, action) => {
                state.loading = false;
                state.leaveRequests = action.payload.data;
                state.leaveRequestsPagination = action.payload.pagination;
            })
            .addCase(fetchLeaveRequests.rejected, rejected)
            .addCase(fetchMyLeaveRequests.fulfilled, (state, action) => { state.myLeaveRequests = action.payload; })
            .addCase(submitLeaveRequest.fulfilled, (state, action) => { state.myLeaveRequests.unshift(action.payload); })
            .addCase(approveLeaveRequest.fulfilled, (state, action) => {
                const idx = state.leaveRequests.findIndex(r => r._id === action.payload._id);
                if (idx !== -1) state.leaveRequests[idx] = action.payload;
            })
            .addCase(rejectLeaveRequest.fulfilled, (state, action) => {
                const idx = state.leaveRequests.findIndex(r => r._id === action.payload._id);
                if (idx !== -1) state.leaveRequests[idx] = action.payload;
            })
            .addCase(cancelLeaveRequest.fulfilled, (state, action) => {
                const update = (list) => { const i = list.findIndex(r => r._id === action.payload._id); if (i !== -1) list[i] = action.payload; };
                update(state.leaveRequests);
                update(state.myLeaveRequests);
            })
            .addCase(fetchLeaveCalendar.fulfilled, (state, action) => { state.leaveCalendar = action.payload; })

            // Certifications
            .addCase(fetchCertifications.pending, pending)
            .addCase(fetchCertifications.fulfilled, (state, action) => { state.loading = false; state.certifications = action.payload; })
            .addCase(fetchCertifications.rejected, rejected)
            .addCase(fetchMyCertifications.fulfilled, (state, action) => { state.myCertifications = action.payload; })
            .addCase(createCertification.fulfilled, (state, action) => { state.certifications.unshift(action.payload); })
            .addCase(updateCertification.fulfilled, (state, action) => {
                const idx = state.certifications.findIndex(c => c._id === action.payload._id);
                if (idx !== -1) state.certifications[idx] = action.payload;
            })
            .addCase(deleteCertification.fulfilled, (state, action) => {
                state.certifications = state.certifications.filter(c => c._id !== action.payload);
            })

            // PD
            .addCase(fetchPDRecords.pending, pending)
            .addCase(fetchPDRecords.fulfilled, (state, action) => { state.loading = false; state.pdRecords = action.payload; })
            .addCase(fetchPDRecords.rejected, rejected)
            .addCase(fetchMyPDRecords.fulfilled, (state, action) => { state.myPDRecords = action.payload; })
            .addCase(createPDRecord.fulfilled, (state, action) => { state.pdRecords.unshift(action.payload); })
            .addCase(updatePDRecord.fulfilled, (state, action) => {
                const idx = state.pdRecords.findIndex(r => r._id === action.payload._id);
                if (idx !== -1) state.pdRecords[idx] = action.payload;
            })
            .addCase(deletePDRecord.fulfilled, (state, action) => {
                state.pdRecords = state.pdRecords.filter(r => r._id !== action.payload);
            })
            .addCase(fetchPDSummary.fulfilled, (state, action) => { state.pdSummary = action.payload; })

            // Reviews
            .addCase(fetchReviews.pending, pending)
            .addCase(fetchReviews.fulfilled, (state, action) => { state.loading = false; state.reviews = action.payload; })
            .addCase(fetchReviews.rejected, rejected)
            .addCase(fetchMyReviews.fulfilled, (state, action) => { state.myReviews = action.payload; })
            .addCase(createReview.fulfilled, (state, action) => { state.reviews.unshift(action.payload); })
            .addCase(updateReview.fulfilled, (state, action) => {
                const idx = state.reviews.findIndex(r => r._id === action.payload._id);
                if (idx !== -1) state.reviews[idx] = action.payload;
            })
            .addCase(submitSelfAssessment.fulfilled, (state, action) => {
                const idx = state.myReviews.findIndex(r => r._id === action.payload._id);
                if (idx !== -1) state.myReviews[idx] = action.payload;
            })
            .addCase(acknowledgeReview.fulfilled, (state, action) => {
                const idx = state.myReviews.findIndex(r => r._id === action.payload._id);
                if (idx !== -1) state.myReviews[idx] = action.payload;
            });
    },
});

export const { clearHRError, clearCurrentStaffProfile } = hrSlice.actions;

// Selectors
export const selectHRSettings = (state) => state.hr.settings;
export const selectHRDashboard = (state) => state.hr.dashboard;
export const selectStaffProfiles = (state) => state.hr.staffProfiles;
export const selectStaffPagination = (state) => state.hr.staffPagination;
export const selectCurrentStaffProfile = (state) => state.hr.currentStaffProfile;
export const selectStaffDirectory = (state) => state.hr.staffDirectory;
export const selectMyProfile = (state) => state.hr.myProfile;
export const selectContracts = (state) => state.hr.contracts;
export const selectExpiringContracts = (state) => state.hr.expiringContracts;
export const selectLeaveTypes = (state) => state.hr.leaveTypes;
export const selectLeaveBalances = (state) => state.hr.leaveBalances;
export const selectMyLeaveBalances = (state) => state.hr.myLeaveBalances;
export const selectLeaveRequests = (state) => state.hr.leaveRequests;
export const selectLeaveRequestsPagination = (state) => state.hr.leaveRequestsPagination;
export const selectMyLeaveRequests = (state) => state.hr.myLeaveRequests;
export const selectLeaveCalendar = (state) => state.hr.leaveCalendar;
export const selectCertifications = (state) => state.hr.certifications;
export const selectMyCertifications = (state) => state.hr.myCertifications;
export const selectPDRecords = (state) => state.hr.pdRecords;
export const selectMyPDRecords = (state) => state.hr.myPDRecords;
export const selectPDSummary = (state) => state.hr.pdSummary;
export const selectReviews = (state) => state.hr.reviews;
export const selectMyReviews = (state) => state.hr.myReviews;
export const selectHRLoading = (state) => state.hr.loading;
export const selectHRError = (state) => state.hr.error;

export default hrSlice.reducer;
