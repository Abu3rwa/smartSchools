import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Month Config ────────────────────────────────────────────────────────────
export const fetchPlpMonthConfigs = createAsyncThunk('plp/fetchMonthConfigs', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/config/month', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch configs'); }
});

export const createPlpMonthConfig = createAsyncThunk('plp/createMonthConfig', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/config/month', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create config'); }
});

export const updatePlpMonthConfig = createAsyncThunk('plp/updateMonthConfig', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/config/month/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update config'); }
});

export const publishPlpMonthConfig = createAsyncThunk('plp/publishMonthConfig', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/config/month/${id}/publish`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to publish config'); }
});

export const closePlpMonthConfig = createAsyncThunk('plp/closeMonthConfig', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/config/month/${id}/close`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to close config'); }
});

// ─── Records ─────────────────────────────────────────────────────────────────
export const fetchPlpRecords = createAsyncThunk('plp/fetchRecords', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/records', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch records'); }
});

export const fetchPlpRecord = createAsyncThunk('plp/fetchRecord', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/records/${id}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch record'); }
});

export const createPlpRecord = createAsyncThunk('plp/createRecord', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/records', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create record'); }
});

export const updatePlpRecord = createAsyncThunk('plp/updateRecord', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/records/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update record'); }
});

export const submitPlpRecord = createAsyncThunk('plp/submitRecord', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/records/${id}/submit`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to submit record'); }
});

// ─── Evidence ────────────────────────────────────────────────────────────────
export const fetchPlpEvidence = createAsyncThunk('plp/fetchEvidence', async (recordId, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/records/${recordId}/evidence`);
        return { recordId, evidence: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch evidence'); }
});

export const createPlpEvidence = createAsyncThunk('plp/createEvidence', async ({ recordId, data }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/records/${recordId}/evidence`, data);
        return { recordId, evidence: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to add evidence'); }
});

export const deletePlpEvidence = createAsyncThunk('plp/deleteEvidence', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/plp/evidence/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete evidence'); }
});

// ─── Awards ──────────────────────────────────────────────────────────────────
export const fetchPlpAwardCandidates = createAsyncThunk('plp/fetchAwardCandidates', async (params, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/awards/candidates', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch candidates'); }
});

export const setPlpAwardDecision = createAsyncThunk('plp/setAwardDecision', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/awards/decision', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to set decision'); }
});

// ─── Supervisor assignments ───────────────────────────────────────────────────
export const fetchPlpSupervisorAssignments = createAsyncThunk('plp/fetchSupervisorAssignments', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/supervisor-assignments');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch assignments'); }
});

export const createPlpSupervisorAssignment = createAsyncThunk('plp/createSupervisorAssignment', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/supervisor-assignments', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create assignment'); }
});

export const deletePlpSupervisorAssignment = createAsyncThunk('plp/deleteSupervisorAssignment', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/plp/supervisor-assignments/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete assignment'); }
});

// ─── Supervisor teachers ──────────────────────────────────────────────────────
export const fetchSupervisorTeachers = createAsyncThunk('plp/fetchSupervisorTeachers', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/supervisor/teachers');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch teachers'); }
});

// ─── Slice ────────────────────────────────────────────────────────────────────
const plpSlice = createSlice({
    name: 'plp',
    initialState: {
        configs: [],
        records: [],
        selectedRecord: null,
        evidence: {},
        awardCandidates: [],
        supervisorAssignments: [],
        supervisorTeachers: [],
        loading: false,
        error: null,
    },
    reducers: {
        clearPlpError: (state) => { state.error = null; },
        clearSelectedRecord: (state) => { state.selectedRecord = null; },
    },
    extraReducers: (builder) => {
        const pending = (state) => { state.loading = true; state.error = null; };
        const failed = (state, action) => { state.loading = false; state.error = action.payload; };

        builder
            .addCase(fetchPlpMonthConfigs.pending, pending)
            .addCase(fetchPlpMonthConfigs.fulfilled, (state, action) => { state.loading = false; state.configs = action.payload; })
            .addCase(fetchPlpMonthConfigs.rejected, failed)

            .addCase(createPlpMonthConfig.fulfilled, (state, action) => { state.configs.unshift(action.payload); })
            .addCase(updatePlpMonthConfig.fulfilled, (state, action) => {
                const idx = state.configs.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.configs[idx] = action.payload;
            })
            .addCase(publishPlpMonthConfig.fulfilled, (state, action) => {
                const idx = state.configs.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.configs[idx] = action.payload;
            })
            .addCase(closePlpMonthConfig.fulfilled, (state, action) => {
                const idx = state.configs.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.configs[idx] = action.payload;
            })

            .addCase(fetchPlpRecords.pending, pending)
            .addCase(fetchPlpRecords.fulfilled, (state, action) => { state.loading = false; state.records = action.payload; })
            .addCase(fetchPlpRecords.rejected, failed)

            .addCase(fetchPlpRecord.fulfilled, (state, action) => { state.selectedRecord = action.payload; })

            .addCase(createPlpRecord.fulfilled, (state, action) => { state.records.unshift(action.payload); })
            .addCase(updatePlpRecord.fulfilled, (state, action) => {
                const idx = state.records.findIndex((r) => r._id === action.payload._id);
                if (idx !== -1) state.records[idx] = action.payload;
                if (state.selectedRecord?._id === action.payload._id) state.selectedRecord = action.payload;
            })
            .addCase(submitPlpRecord.fulfilled, (state, action) => {
                const idx = state.records.findIndex((r) => r._id === action.payload._id);
                if (idx !== -1) state.records[idx] = action.payload;
                if (state.selectedRecord?._id === action.payload._id) state.selectedRecord = action.payload;
            })

            .addCase(fetchPlpEvidence.fulfilled, (state, action) => {
                state.evidence[action.payload.recordId] = action.payload.evidence;
            })
            .addCase(createPlpEvidence.fulfilled, (state, action) => {
                const { recordId, evidence } = action.payload;
                if (!state.evidence[recordId]) state.evidence[recordId] = [];
                state.evidence[recordId].unshift(evidence);
            })
            .addCase(deletePlpEvidence.fulfilled, (state, action) => {
                Object.keys(state.evidence).forEach((recordId) => {
                    state.evidence[recordId] = state.evidence[recordId].filter((e) => e._id !== action.payload);
                });
            })

            .addCase(fetchPlpAwardCandidates.fulfilled, (state, action) => { state.awardCandidates = action.payload; })
            .addCase(setPlpAwardDecision.fulfilled, (state, action) => {
                const idx = state.awardCandidates.findIndex((r) => r._id === action.payload._id);
                if (idx !== -1) state.awardCandidates[idx] = action.payload;
            })

            .addCase(fetchPlpSupervisorAssignments.fulfilled, (state, action) => { state.supervisorAssignments = action.payload; })
            .addCase(createPlpSupervisorAssignment.fulfilled, (state, action) => { state.supervisorAssignments.unshift(action.payload); })
            .addCase(deletePlpSupervisorAssignment.fulfilled, (state, action) => {
                state.supervisorAssignments = state.supervisorAssignments.filter((a) => a._id !== action.payload);
            })

            .addCase(fetchSupervisorTeachers.fulfilled, (state, action) => { state.supervisorTeachers = action.payload; });
    },
});

export const { clearPlpError, clearSelectedRecord } = plpSlice.actions;

export const selectPlpConfigs = (s) => s.plp.configs;
export const selectPlpRecords = (s) => s.plp.records;
export const selectSelectedPlpRecord = (s) => s.plp.selectedRecord;
export const selectPlpEvidence = (recordId) => (s) => s.plp.evidence[recordId] || [];
export const selectPlpAwardCandidates = (s) => s.plp.awardCandidates;
export const selectPlpSupervisorAssignments = (s) => s.plp.supervisorAssignments;
export const selectSupervisorTeachers = (s) => s.plp.supervisorTeachers;
export const selectPlpLoading = (s) => s.plp.loading;
export const selectPlpError = (s) => s.plp.error;

export default plpSlice.reducer;
