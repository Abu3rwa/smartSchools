import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Standards CRUD Thunks ───

export const fetchStandards = createAsyncThunk(
    'standards/fetchStandards',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/standards', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch standards');
        }
    }
);

export const createStandard = createAsyncThunk(
    'standards/createStandard',
    async (data, { rejectWithValue }) => {
        try {
            const response = await api.post('/standards', data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create standard');
        }
    }
);

export const updateStandard = createAsyncThunk(
    'standards/updateStandard',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/standards/${id}`, data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update standard');
        }
    }
);

export const deleteStandard = createAsyncThunk(
    'standards/deleteStandard',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/standards/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete standard');
        }
    }
);

export const importStandards = createAsyncThunk(
    'standards/importStandards',
    async (standards, { rejectWithValue }) => {
        try {
            const response = await api.post('/standards/import', { standards });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to import standards');
        }
    }
);

// ─── Slice ───

const standardCoreSlice = createSlice({
    name: 'standards',
    initialState: {
        standards: [],
        pagination: null,
        loading: false,
        error: null,
        importResult: null
    },
    reducers: {
        clearError: (state) => { state.error = null; },
        clearImportResult: (state) => { state.importResult = null; }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchStandards.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchStandards.fulfilled, (state, action) => {
                state.loading = false;
                state.standards = action.payload.standards;
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchStandards.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(createStandard.fulfilled, (state, action) => {
                state.standards.push(action.payload.standard);
            })
            .addCase(createStandard.rejected, (state, action) => {
                state.error = action.payload;
            })
            .addCase(updateStandard.fulfilled, (state, action) => {
                const index = state.standards.findIndex(s => s._id === action.payload.standard._id);
                if (index !== -1) state.standards[index] = action.payload.standard;
            })
            .addCase(deleteStandard.fulfilled, (state, action) => {
                state.standards = state.standards.filter(s => s._id !== action.payload);
            })
            .addCase(importStandards.pending, (state) => { state.loading = true; })
            .addCase(importStandards.fulfilled, (state, action) => {
                state.loading = false;
                state.importResult = action.payload;
            })
            .addCase(importStandards.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

export const { clearError, clearImportResult } = standardCoreSlice.actions;

// Selectors
export const selectStandards = (state) => state.standards?.standards || [];
export const selectStandardsPagination = (state) => state.standards?.pagination;
export const selectStandardsCoreLoading = (state) => state.standards?.loading;
export const selectStandardsError = (state) => state.standards?.error;
export const selectImportResult = (state) => state.standards?.importResult;

export default standardCoreSlice.reducer;
