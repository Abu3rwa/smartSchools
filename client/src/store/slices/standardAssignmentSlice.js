import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Assignment Thunks ───

export const fetchAssignments = createAsyncThunk(
    'standardAssignments/fetchAssignments',
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
    'standardAssignments/fetchAssignment',
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
    'standardAssignments/createAssignment',
    async (data, { rejectWithValue }) => {
        try {
            const response = await api.post('/standard-assignments', data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create assignment');
        }
    }
);

export const updateAssignment = createAsyncThunk(
    'standardAssignments/updateAssignment',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/standard-assignments/${id}`, data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update assignment');
        }
    }
);

export const deleteAssignment = createAsyncThunk(
    'standardAssignments/deleteAssignment',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/standard-assignments/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete assignment');
        }
    }
);

// ─── Progress Thunks ───

export const fetchAssignmentProgress = createAsyncThunk(
    'standardAssignments/fetchAssignmentProgress',
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
    'standardAssignments/fetchStudentProgress',
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

const standardAssignmentSlice = createSlice({
    name: 'standardAssignments',
    initialState: {
        assignments: [],
        assignmentsPagination: null,
        currentAssignment: null,
        assignmentProgress: null,
        assignmentProgressLoading: false,
        studentProgress: null,
        loading: false,
        error: null
    },
    reducers: {
        clearCurrentAssignment: (state) => { state.currentAssignment = null; },
        clearAssignmentProgress: (state) => {
            state.assignmentProgress = null;
            state.assignmentProgressLoading = false;
        },
        clearStudentProgress: (state) => { state.studentProgress = null; },
        clearAssignmentError: (state) => { state.error = null; }
    },
    extraReducers: (builder) => {
        builder
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
            .addCase(fetchAssignment.fulfilled, (state, action) => {
                state.currentAssignment = action.payload;
            })
            .addCase(createAssignment.fulfilled, (state, action) => {
                state.assignments.unshift(action.payload.assignment);
            })
            .addCase(createAssignment.rejected, (state, action) => {
                state.error = action.payload;
            })
            .addCase(updateAssignment.fulfilled, (state, action) => {
                const next = action.payload?.assignment;
                if (!next) return;
                const index = state.assignments.findIndex((item) => item._id === next._id);
                if (index !== -1) state.assignments[index] = next;
            })
            .addCase(updateAssignment.rejected, (state, action) => {
                state.error = action.payload;
            })
            .addCase(deleteAssignment.fulfilled, (state, action) => {
                state.assignments = state.assignments.filter(a => a._id !== action.payload);
            })
            .addCase(fetchAssignmentProgress.pending, (state) => {
                state.assignmentProgressLoading = true;
                state.assignmentProgress = null;
                state.error = null;
            })
            .addCase(fetchAssignmentProgress.fulfilled, (state, action) => {
                state.assignmentProgressLoading = false;
                state.assignmentProgress = action.payload;
            })
            .addCase(fetchAssignmentProgress.rejected, (state, action) => {
                state.assignmentProgressLoading = false;
                state.error = action.payload;
            })
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

export const {
    clearCurrentAssignment,
    clearAssignmentProgress,
    clearStudentProgress,
    clearAssignmentError
} = standardAssignmentSlice.actions;

// Selectors
export const selectAssignments = (state) => state.standardAssignments?.assignments || [];
export const selectCurrentAssignment = (state) => state.standardAssignments?.currentAssignment;
export const selectAssignmentProgress = (state) => state.standardAssignments?.assignmentProgress;
export const selectAssignmentProgressLoading = (state) => state.standardAssignments?.assignmentProgressLoading;
export const selectStudentStandardsProgress = (state) => state.standardAssignments?.studentProgress;
export const selectAssignmentsLoading = (state) => state.standardAssignments?.loading;

export default standardAssignmentSlice.reducer;
