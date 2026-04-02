import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import gradebookColumnService from '../../services/gradebookColumnService';

export const fetchColumns = createAsyncThunk(
    'gradebookColumns/fetch',
    async ({ classId, subjectId, academicYear, semester }, { rejectWithValue }) => {
        try {
            const result = await gradebookColumnService.getColumns({ classId, subjectId, academicYear, semester });
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load columns');
        }
    }
);

export const createColumn = createAsyncThunk(
    'gradebookColumns/create',
    async (data, { rejectWithValue }) => {
        try {
            const result = await gradebookColumnService.createColumn(data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create column');
        }
    }
);

export const updateColumn = createAsyncThunk(
    'gradebookColumns/update',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const result = await gradebookColumnService.updateColumn(id, data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update column');
        }
    }
);

export const deleteColumn = createAsyncThunk(
    'gradebookColumns/delete',
    async ({ id, deleteGrades = false }, { rejectWithValue }) => {
        try {
            await gradebookColumnService.deleteColumn(id, deleteGrades);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete column');
        }
    }
);

export const reorderColumns = createAsyncThunk(
    'gradebookColumns/reorder',
    async (order, { rejectWithValue }) => {
        try {
            await gradebookColumnService.reorderColumns(order);
            return order;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to reorder columns');
        }
    }
);

export const toggleColumnLock = createAsyncThunk(
    'gradebookColumns/toggleLock',
    async (id, { rejectWithValue }) => {
        try {
            const result = await gradebookColumnService.toggleLock(id);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to toggle lock');
        }
    }
);

export const migrateColumns = createAsyncThunk(
    'gradebookColumns/migrate',
    async ({ classId, subjectId, academicYear, semester }, { rejectWithValue }) => {
        try {
            const result = await gradebookColumnService.migrateColumns({ classId, subjectId, academicYear, semester });
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to migrate columns');
        }
    }
);

const gradebookColumnsSlice = createSlice({
    name: 'gradebookColumns',
    initialState: {
        columns: [],
        loading: false,
        saving: false,
        migrating: false,
        error: null
    },
    reducers: {
        clearColumnsError: (state) => {
            state.error = null;
        },
        clearColumns: (state) => {
            state.columns = [];
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Fetch
            .addCase(fetchColumns.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchColumns.fulfilled, (state, action) => {
                state.loading = false;
                state.columns = action.payload;
            })
            .addCase(fetchColumns.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Create
            .addCase(createColumn.pending, (state) => {
                state.saving = true;
            })
            .addCase(createColumn.fulfilled, (state, action) => {
                state.saving = false;
                state.columns.push(action.payload);
                state.columns.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            })
            .addCase(createColumn.rejected, (state, action) => {
                state.saving = false;
                state.error = action.payload;
            })
            // Update
            .addCase(updateColumn.fulfilled, (state, action) => {
                const idx = state.columns.findIndex(c => c._id === action.payload._id);
                if (idx !== -1) state.columns[idx] = action.payload;
            })
            // Delete
            .addCase(deleteColumn.fulfilled, (state, action) => {
                state.columns = state.columns.filter(c => c._id !== action.payload);
            })
            // Reorder
            .addCase(reorderColumns.fulfilled, (state, action) => {
                const orderMap = new Map(action.payload.map(o => [o.columnId, o.sortOrder]));
                state.columns = state.columns
                    .map(c => orderMap.has(c._id) ? { ...c, sortOrder: orderMap.get(c._id) } : c)
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            })
            // Toggle lock
            .addCase(toggleColumnLock.fulfilled, (state, action) => {
                const idx = state.columns.findIndex(c => c._id === action.payload._id);
                if (idx !== -1) state.columns[idx] = action.payload;
            })
            // Migrate
            .addCase(migrateColumns.pending, (state) => {
                state.migrating = true;
            })
            .addCase(migrateColumns.fulfilled, (state) => {
                state.migrating = false;
            })
            .addCase(migrateColumns.rejected, (state, action) => {
                state.migrating = false;
                state.error = action.payload;
            });
    }
});

export const { clearColumnsError, clearColumns } = gradebookColumnsSlice.actions;

export const selectColumns = (state) => state.gradebookColumns.columns;
export const selectColumnsLoading = (state) => state.gradebookColumns.loading;
export const selectColumnsSaving = (state) => state.gradebookColumns.saving;
export const selectColumnsMigrating = (state) => state.gradebookColumns.migrating;
export const selectColumnsError = (state) => state.gradebookColumns.error;

export default gradebookColumnsSlice.reducer;
