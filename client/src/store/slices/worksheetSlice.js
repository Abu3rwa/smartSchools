import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Thunks ─────────────────────────────────────────────────────────────────

export const fetchWorksheets = createAsyncThunk(
    'worksheets/fetchAll',
    async (params = {}, { rejectWithValue }) => {
        try {
            const res = await api.get('/worksheets', { params });
            return res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Failed to load worksheets');
        }
    }
);

export const fetchWorksheet = createAsyncThunk(
    'worksheets/fetchOne',
    async (id, { rejectWithValue }) => {
        try {
            const res = await api.get(`/worksheets/${id}`);
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Failed to load worksheet');
        }
    }
);

export const createWorksheet = createAsyncThunk(
    'worksheets/create',
    async (formData, { rejectWithValue }) => {
        try {
            const res = await api.post('/worksheets', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Failed to create worksheet');
        }
    }
);

export const updateWorksheet = createAsyncThunk(
    'worksheets/update',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const res = await api.put(`/worksheets/${id}`, data);
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Update failed');
        }
    }
);

export const deleteWorksheet = createAsyncThunk(
    'worksheets/delete',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/worksheets/${id}`);
            return id;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Delete failed');
        }
    }
);

export const extractAnswerKey = createAsyncThunk(
    'worksheets/extractAnswerKey',
    async (id, { rejectWithValue }) => {
        try {
            const res = await api.post(`/worksheets/${id}/extract-answer-key`);
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Answer key extraction failed');
        }
    }
);

export const fetchSubmissions = createAsyncThunk(
    'worksheets/fetchSubmissions',
    async (worksheetId, { rejectWithValue }) => {
        try {
            const res = await api.get(`/worksheets/${worksheetId}/submissions`);
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Failed to load submissions');
        }
    }
);

export const uploadSubmission = createAsyncThunk(
    'worksheets/uploadSubmission',
    async ({ worksheetId, formData }, { rejectWithValue }) => {
        try {
            const res = await api.post(`/worksheets/${worksheetId}/submissions`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Upload failed');
        }
    }
);

export const uploadBatchSubmissions = createAsyncThunk(
    'worksheets/uploadBatch',
    async ({ worksheetId, formData }, { rejectWithValue }) => {
        try {
            const res = await api.post(`/worksheets/${worksheetId}/submissions/batch`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Batch upload failed');
        }
    }
);

export const processSubmission = createAsyncThunk(
    'worksheets/processSubmission',
    async ({ worksheetId, submissionId }, { rejectWithValue }) => {
        try {
            const res = await api.post(`/worksheets/${worksheetId}/submissions/${submissionId}/process`);
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Processing failed');
        }
    }
);

export const processAllSubmissions = createAsyncThunk(
    'worksheets/processAll',
    async (worksheetId, { rejectWithValue }) => {
        try {
            const res = await api.post(`/worksheets/${worksheetId}/process-all`);
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Batch processing failed');
        }
    }
);

export const applyOverride = createAsyncThunk(
    'worksheets/applyOverride',
    async ({ submissionId, overrides }, { rejectWithValue }) => {
        try {
            const res = await api.put(`/worksheets/submissions/${submissionId}/override`, { overrides });
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Override failed');
        }
    }
);

export const deleteSubmission = createAsyncThunk(
    'worksheets/deleteSubmission',
    async ({ worksheetId, submissionId }, { rejectWithValue }) => {
        try {
            await api.delete(`/worksheets/${worksheetId}/submissions/${submissionId}`);
            return submissionId;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Delete failed');
        }
    }
);

export const replaceSubmission = createAsyncThunk(
    'worksheets/replaceSubmission',
    async ({ worksheetId, submissionId, formData }, { rejectWithValue }) => {
        try {
            const res = await api.put(`/worksheets/${worksheetId}/submissions/${submissionId}/replace`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Replace failed');
        }
    }
);

export const publishResults = createAsyncThunk(
    'worksheets/publish',
    async (id, { rejectWithValue }) => {
        try {
            const res = await api.post(`/worksheets/${id}/publish`);
            return res.data?.data ?? res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Publish failed');
        }
    }
);

export const syncToGradebook = createAsyncThunk(
    'worksheets/syncGradebook',
    async ({ id, submissionIds }, { rejectWithValue }) => {
        try {
            const res = await api.post(`/worksheets/${id}/gradebook/sync`, { submissionIds });
            return res.data;
        } catch (err) {
            return rejectWithValue(err.response?.data?.message || 'Gradebook sync failed');
        }
    }
);

// ─── Slice ──────────────────────────────────────────────────────────────────

const worksheetSlice = createSlice({
    name: 'worksheets',
    initialState: {
        list: [],
        pagination: null,
        current: null,
        submissions: [],
        loading: false,
        creating: false,
        uploading: false,
        processing: false,
        error: null
    },
    reducers: {
        clearError: (state) => { state.error = null; },
        clearCurrent: (state) => { state.current = null; state.submissions = []; },
        clearSubmissions: (state) => { state.submissions = []; }
    },
    extraReducers: (builder) => {
        builder
            // Fetch all
            .addCase(fetchWorksheets.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchWorksheets.fulfilled, (state, action) => {
                state.loading = false;
                state.list = action.payload?.worksheets || action.payload?.data || [];
                state.pagination = {
                    total: action.payload?.total,
                    page: action.payload?.page,
                    limit: action.payload?.limit,
                    pages: action.payload?.pages
                };
            })
            .addCase(fetchWorksheets.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            // Fetch one
            .addCase(fetchWorksheet.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchWorksheet.fulfilled, (state, action) => { state.loading = false; state.current = action.payload; })
            .addCase(fetchWorksheet.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            // Create
            .addCase(createWorksheet.pending, (state) => { state.creating = true; state.error = null; })
            .addCase(createWorksheet.fulfilled, (state, action) => {
                state.creating = false;
                state.list.unshift(action.payload);
            })
            .addCase(createWorksheet.rejected, (state, action) => { state.creating = false; state.error = action.payload; })

            // Update
            .addCase(updateWorksheet.fulfilled, (state, action) => {
                const idx = state.list.findIndex(w => w._id === action.payload?._id);
                if (idx !== -1) state.list[idx] = action.payload;
                if (state.current?._id === action.payload?._id) state.current = action.payload;
            })

            // Delete
            .addCase(deleteWorksheet.fulfilled, (state, action) => {
                state.list = state.list.filter(w => w._id !== action.payload);
                if (state.current?._id === action.payload) state.current = null;
            })

            // Extract answer key
            .addCase(extractAnswerKey.pending, (state) => { state.processing = true; })
            .addCase(extractAnswerKey.fulfilled, (state, action) => {
                state.processing = false;
                if (state.current) {
                    state.current.modelAnswers = action.payload?.modelAnswers;
                    state.current.totalQuestions = action.payload?.totalQuestions;
                }
            })
            .addCase(extractAnswerKey.rejected, (state, action) => { state.processing = false; state.error = action.payload; })

            // Fetch submissions
            .addCase(fetchSubmissions.pending, (state) => { state.loading = true; })
            .addCase(fetchSubmissions.fulfilled, (state, action) => {
                state.loading = false;
                state.submissions = Array.isArray(action.payload) ? action.payload : [];
            })
            .addCase(fetchSubmissions.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

            // Upload submission
            .addCase(uploadSubmission.pending, (state) => { state.uploading = true; state.error = null; })
            .addCase(uploadSubmission.fulfilled, (state, action) => {
                state.uploading = false;
                if (action.payload) state.submissions.unshift(action.payload);
            })
            .addCase(uploadSubmission.rejected, (state, action) => { state.uploading = false; state.error = action.payload; })

            // Batch upload
            .addCase(uploadBatchSubmissions.pending, (state) => { state.uploading = true; state.error = null; })
            .addCase(uploadBatchSubmissions.fulfilled, (state, action) => {
                state.uploading = false;
                const items = Array.isArray(action.payload) ? action.payload : [];
                state.submissions = [...items, ...state.submissions];
            })
            .addCase(uploadBatchSubmissions.rejected, (state, action) => { state.uploading = false; state.error = action.payload; })

            // Process submission
            .addCase(processSubmission.pending, (state) => { state.processing = true; })
            .addCase(processSubmission.fulfilled, (state, action) => {
                state.processing = false;
                const idx = state.submissions.findIndex(s => s._id === action.payload?._id);
                if (idx !== -1) state.submissions[idx] = action.payload;
            })
            .addCase(processSubmission.rejected, (state, action) => { state.processing = false; state.error = action.payload; })

            // Process all
            .addCase(processAllSubmissions.pending, (state) => { state.processing = true; })
            .addCase(processAllSubmissions.fulfilled, (state) => { state.processing = false; })
            .addCase(processAllSubmissions.rejected, (state, action) => { state.processing = false; state.error = action.payload; })

            // Override
            .addCase(applyOverride.fulfilled, (state, action) => {
                const idx = state.submissions.findIndex(s => s._id === action.payload?._id);
                if (idx !== -1) state.submissions[idx] = action.payload;
            })

            // Delete submission
            .addCase(deleteSubmission.fulfilled, (state, action) => {
                state.submissions = state.submissions.filter(s => s._id !== action.payload);
            })

            // Replace submission
            .addCase(replaceSubmission.pending, (state) => { state.uploading = true; })
            .addCase(replaceSubmission.fulfilled, (state, action) => {
                state.uploading = false;
                const idx = state.submissions.findIndex(s => s._id === action.payload?._id);
                if (idx !== -1) state.submissions[idx] = action.payload;
            })
            .addCase(replaceSubmission.rejected, (state, action) => { state.uploading = false; state.error = action.payload; })

            // Publish
            .addCase(publishResults.fulfilled, (state, action) => {
                if (state.current) state.current.status = 'published';
            });
    }
});

export const { clearError, clearCurrent, clearSubmissions } = worksheetSlice.actions;

// Selectors
export const selectWorksheets = (state) => state.worksheets?.list || [];
export const selectCurrentWorksheet = (state) => state.worksheets?.current;
export const selectSubmissions = (state) => state.worksheets?.submissions || [];
export const selectWorksheetLoading = (state) => state.worksheets?.loading || false;
export const selectWorksheetCreating = (state) => state.worksheets?.creating || false;
export const selectWorksheetUploading = (state) => state.worksheets?.uploading || false;
export const selectWorksheetProcessing = (state) => state.worksheets?.processing || false;
export const selectWorksheetError = (state) => state.worksheets?.error;
export const selectWorksheetPagination = (state) => state.worksheets?.pagination;

export default worksheetSlice.reducer;
