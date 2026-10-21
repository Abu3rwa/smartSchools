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

export const fetchAllStandards = createAsyncThunk(
    'standards/fetchAllStandards',
    async (_, { rejectWithValue }) => {
        try {
            const limit = 100;
            const standards = [];
            let page = 1;
            let pages = 1;
            let total = 0;

            while (page <= pages) {
                const response = await api.get('/standards', { params: { page, limit } });
                const data = response.data?.data;
                if (!Array.isArray(data?.standards) || !Number.isInteger(data?.pagination?.pages)) {
                    throw new Error('The standards service returned an invalid paginated response.');
                }
                standards.push(...data.standards);
                pages = data.pagination.pages;
                total = data.pagination.total;
                page += 1;
            }

            return {
                standards,
                pagination: {
                    page: 1,
                    limit: standards.length,
                    total,
                    pages: 1
                }
            };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || error.message || 'Failed to fetch standards');
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

export const bulkDeleteStandards = createAsyncThunk(
    'standards/bulkDeleteStandards',
    async (standardIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/standards/bulk-delete', { standardIds });
            return { standardIds, deletedCount: response.data.data.deletedCount };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete standards');
        }
    }
);

export const importStandards = createAsyncThunk(
    'standards/importStandards',
    async ({ standards, duplicatePolicy = 'skip' }, { rejectWithValue }) => {
        try {
            const response = await api.post('/standards/import', { standards, duplicatePolicy });
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
            .addCase(fetchAllStandards.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchAllStandards.fulfilled, (state, action) => {
                state.loading = false;
                state.standards = action.payload.standards;
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchAllStandards.rejected, (state, action) => {
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
            .addCase(bulkDeleteStandards.fulfilled, (state, action) => {
                const deletedIds = new Set(action.payload.standardIds.map(String));
                state.standards = state.standards.filter((standard) => !deletedIds.has(String(standard._id)));
            })
            .addCase(importStandards.pending, (state) => {
                state.loading = true;
                state.importResult = null;
            })
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
