import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Standards CRUD ───

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

// ─── Assignments ───

export const fetchAssignments = createAsyncThunk(
    'standards/fetchAssignments',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/standard-assignments', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch assignments');
        }
    }
);

export const fetchAssignment = createAsyncThunk(
    'standards/fetchAssignment',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/standard-assignments/${id}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch assignment');
        }
    }
);

export const createAssignment = createAsyncThunk(
    'standards/createAssignment',
    async (data, { rejectWithValue }) => {
        try {
            const response = await api.post('/standard-assignments', data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create assignment');
        }
    }
);

export const deleteAssignment = createAsyncThunk(
    'standards/deleteAssignment',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/standard-assignments/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete assignment');
        }
    }
);

// ─── Progress ───

export const fetchAssignmentProgress = createAsyncThunk(
    'standards/fetchAssignmentProgress',
    async (assignmentId, { rejectWithValue }) => {
        try {
            const response = await api.get(`/practice/assignment/${assignmentId}/progress`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch progress');
        }
    }
);

export const fetchStudentProgress = createAsyncThunk(
    'standards/fetchStudentProgress',
    async (studentId, { rejectWithValue }) => {
        try {
            const response = await api.get(`/practice/student/${studentId}/progress`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch student progress');
        }
    }
);

// ─── Slice ───

const standardSlice = createSlice({
    name: 'standards',
    initialState: {
        standards: [],
        pagination: null,
        assignments: [],
        assignmentsPagination: null,
        currentAssignment: null,
        assignmentProgress: null,
        studentProgress: null,
        loading: false,
        error: null,
        importResult: null
    },
    reducers: {
        clearError: (state) => { state.error = null; },
        clearImportResult: (state) => { state.importResult = null; },
        clearCurrentAssignment: (state) => { state.currentAssignment = null; },
        clearAssignmentProgress: (state) => { state.assignmentProgress = null; },
        clearStudentProgress: (state) => { state.studentProgress = null; }
    },
    extraReducers: (builder) => {
        builder
            // Fetch standards
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
            // Create standard
            .addCase(createStandard.fulfilled, (state, action) => {
                state.standards.push(action.payload.standard);
            })
            .addCase(createStandard.rejected, (state, action) => {
                state.error = action.payload;
            })
            // Update standard
            .addCase(updateStandard.fulfilled, (state, action) => {
                const index = state.standards.findIndex(s => s._id === action.payload.standard._id);
                if (index !== -1) state.standards[index] = action.payload.standard;
            })
            // Delete standard
            .addCase(deleteStandard.fulfilled, (state, action) => {
                state.standards = state.standards.filter(s => s._id !== action.payload);
            })
            // Import standards
            .addCase(importStandards.pending, (state) => { state.loading = true; })
            .addCase(importStandards.fulfilled, (state, action) => {
                state.loading = false;
                state.importResult = action.payload;
            })
            .addCase(importStandards.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch assignments
            .addCase(fetchAssignments.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchAssignments.fulfilled, (state, action) => {
                state.loading = false;
                state.assignments = action.payload.assignments;
                state.assignmentsPagination = action.payload.pagination;
            })
            .addCase(fetchAssignments.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch single assignment
            .addCase(fetchAssignment.fulfilled, (state, action) => {
                state.currentAssignment = action.payload;
            })
            // Create assignment
            .addCase(createAssignment.fulfilled, (state, action) => {
                state.assignments.unshift(action.payload.assignment);
            })
            .addCase(createAssignment.rejected, (state, action) => {
                state.error = action.payload;
            })
            // Delete assignment
            .addCase(deleteAssignment.fulfilled, (state, action) => {
                state.assignments = state.assignments.filter(a => a._id !== action.payload);
            })
            // Assignment progress
            .addCase(fetchAssignmentProgress.pending, (state) => { state.loading = true; })
            .addCase(fetchAssignmentProgress.fulfilled, (state, action) => {
                state.loading = false;
                state.assignmentProgress = action.payload;
            })
            .addCase(fetchAssignmentProgress.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Student progress
            .addCase(fetchStudentProgress.pending, (state) => { state.loading = true; })
            .addCase(fetchStudentProgress.fulfilled, (state, action) => {
                state.loading = false;
                state.studentProgress = action.payload;
            })
            .addCase(fetchStudentProgress.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

export const { clearError, clearImportResult, clearCurrentAssignment, clearAssignmentProgress, clearStudentProgress } = standardSlice.actions;

// Selectors
export const selectStandards = (state) => state.standards?.standards || [];
export const selectStandardsPagination = (state) => state.standards?.pagination;
export const selectAssignments = (state) => state.standards?.assignments || [];
export const selectCurrentAssignment = (state) => state.standards?.currentAssignment;
export const selectAssignmentProgress = (state) => state.standards?.assignmentProgress;
export const selectStudentStandardsProgress = (state) => state.standards?.studentProgress;
export const selectStandardsLoading = (state) => state.standards?.loading;
export const selectStandardsError = (state) => state.standards?.error;
export const selectImportResult = (state) => state.standards?.importResult;

export default standardSlice.reducer;
