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

export const updateAssignment = createAsyncThunk(
    'standards/updateAssignment',
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

export const fetchSBGradebook = createAsyncThunk(
    'standards/fetchSBGradebook',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/practice/sb-gradebook', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch standards gradebook');
        }
    }
);

export const fetchSBGradebookMatrix = createAsyncThunk(
    'standards/fetchSBGradebookMatrix',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/practice/sb-gradebook/matrix', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch gradebook matrix');
        }
    }
);

export const saveBulkManualScores = createAsyncThunk(
    'standards/saveBulkManualScores',
    async (payload, { rejectWithValue }) => {
        try {
            const response = await api.put('/practice/sb-gradebook/manual-scores/bulk', payload);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to save scores');
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
        assignmentProgressLoading: false,
        studentProgress: null,
        sbGradebook: {
            rows: [],
            summary: null,
            pagination: null,
            filterOptions: {
                classes: [],
                subjects: [],
                standards: [],
                students: [],
                statuses: []
            },
            academicYear: null,
            semester: null,
            filters: {}
        },
        sbGradebookLoading: false,
        sbGradebookError: null,
        sbGradebookMatrix: {
            standards: [],
            students: [],
            matrix: {},
            classAverage: {},
            pagination: null,
            filterOptions: { classes: [], subjects: [], standards: [] },
            academicYear: null,
            semester: null,
        },
        sbGradebookMatrixLoading: false,
        sbGradebookMatrixError: null,
        bulkSaveLoading: false,
        bulkSaveError: null,
        loading: false,
        error: null,
        importResult: null
    },
    reducers: {
        clearError: (state) => { state.error = null; },
        clearImportResult: (state) => { state.importResult = null; },
        clearCurrentAssignment: (state) => { state.currentAssignment = null; },
        clearAssignmentProgress: (state) => {
            state.assignmentProgress = null;
            state.assignmentProgressLoading = false;
        },
        clearStudentProgress: (state) => { state.studentProgress = null; },
        clearSBGradebook: (state) => {
            state.sbGradebook = {
                rows: [],
                summary: null,
                pagination: null,
                filterOptions: {
                    classes: [],
                    subjects: [],
                    standards: [],
                    students: [],
                    statuses: []
                },
                academicYear: null,
                semester: null,
                filters: {}
            };
            state.sbGradebookLoading = false;
            state.sbGradebookError = null;
        },
        clearSBGradebookMatrix: (state) => {
            state.sbGradebookMatrix = {
                standards: [],
                students: [],
                matrix: {},
                classAverage: {},
                pagination: null,
                filterOptions: { classes: [], subjects: [], standards: [] },
                academicYear: null,
                semester: null,
            };
            state.sbGradebookMatrixLoading = false;
            state.sbGradebookMatrixError = null;
        }
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
            // Update assignment
            .addCase(updateAssignment.fulfilled, (state, action) => {
                const next = action.payload?.assignment;
                if (!next) return;
                const index = state.assignments.findIndex((item) => item._id === next._id);
                if (index !== -1) state.assignments[index] = next;
            })
            .addCase(updateAssignment.rejected, (state, action) => {
                state.error = action.payload;
            })
            // Delete assignment
            .addCase(deleteAssignment.fulfilled, (state, action) => {
                state.assignments = state.assignments.filter(a => a._id !== action.payload);
            })
            // Assignment progress
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
            // Student progress
            .addCase(fetchStudentProgress.pending, (state) => { state.loading = true; })
            .addCase(fetchStudentProgress.fulfilled, (state, action) => {
                state.loading = false;
                state.studentProgress = action.payload;
            })
            .addCase(fetchStudentProgress.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // SB Gradebook
            .addCase(fetchSBGradebook.pending, (state) => {
                state.sbGradebookLoading = true;
                state.sbGradebookError = null;
            })
            .addCase(fetchSBGradebook.fulfilled, (state, action) => {
                state.sbGradebookLoading = false;
                state.sbGradebook = {
                    rows: action.payload?.rows || [],
                    summary: action.payload?.summary || null,
                    pagination: action.payload?.pagination || null,
                    filterOptions: action.payload?.filterOptions || {
                        classes: [],
                        subjects: [],
                        standards: [],
                        students: [],
                        statuses: []
                    },
                    academicYear: action.payload?.academicYear ?? null,
                    semester: action.payload?.semester ?? null,
                    filters: action.payload?.filters || {}
                };
            })
            .addCase(fetchSBGradebook.rejected, (state, action) => {
                state.sbGradebookLoading = false;
                state.sbGradebookError = action.payload;
            })
            // SB Gradebook Matrix
            .addCase(fetchSBGradebookMatrix.pending, (state) => {
                state.sbGradebookMatrixLoading = true;
                state.sbGradebookMatrixError = null;
            })
            .addCase(fetchSBGradebookMatrix.fulfilled, (state, action) => {
                state.sbGradebookMatrixLoading = false;
                state.sbGradebookMatrix = {
                    standards: action.payload?.standards || [],
                    students: action.payload?.students || [],
                    matrix: action.payload?.matrix || {},
                    classAverage: action.payload?.classAverage || {},
                    pagination: action.payload?.pagination || null,
                    filterOptions: action.payload?.filterOptions || { classes: [], subjects: [], standards: [] },
                    academicYear: action.payload?.academicYear ?? null,
                    semester: action.payload?.semester ?? null,
                };
            })
            .addCase(fetchSBGradebookMatrix.rejected, (state, action) => {
                state.sbGradebookMatrixLoading = false;
                state.sbGradebookMatrixError = action.payload;
            })
            // Bulk save manual scores
            .addCase(saveBulkManualScores.pending, (state) => {
                state.bulkSaveLoading = true;
                state.bulkSaveError = null;
            })
            .addCase(saveBulkManualScores.fulfilled, (state) => {
                state.bulkSaveLoading = false;
            })
            .addCase(saveBulkManualScores.rejected, (state, action) => {
                state.bulkSaveLoading = false;
                state.bulkSaveError = action.payload;
            });
    }
});

export const {
    clearError,
    clearImportResult,
    clearCurrentAssignment,
    clearAssignmentProgress,
    clearStudentProgress,
    clearSBGradebook,
    clearSBGradebookMatrix
} = standardSlice.actions;

// Selectors
export const selectStandards = (state) => state.standards?.standards || [];
export const selectStandardsPagination = (state) => state.standards?.pagination;
export const selectAssignments = (state) => state.standards?.assignments || [];
export const selectCurrentAssignment = (state) => state.standards?.currentAssignment;
export const selectAssignmentProgress = (state) => state.standards?.assignmentProgress;
export const selectAssignmentProgressLoading = (state) => state.standards?.assignmentProgressLoading;
export const selectStudentStandardsProgress = (state) => state.standards?.studentProgress;
export const selectStandardsLoading = (state) => state.standards?.loading;
export const selectStandardsError = (state) => state.standards?.error;
export const selectImportResult = (state) => state.standards?.importResult;
export const selectSBGradebookRows = (state) => state.standards?.sbGradebook?.rows || [];
export const selectSBGradebookSummary = (state) => state.standards?.sbGradebook?.summary;
export const selectSBGradebookPagination = (state) => state.standards?.sbGradebook?.pagination;
export const selectSBGradebookFilterOptions = (state) => state.standards?.sbGradebook?.filterOptions;
export const selectSBGradebookFilters = (state) => state.standards?.sbGradebook?.filters || {};
export const selectSBGradebookLoading = (state) => state.standards?.sbGradebookLoading;
export const selectSBGradebookError = (state) => state.standards?.sbGradebookError;

// Matrix selectors
export const selectSBGradebookMatrixStandards = (state) => state.standards?.sbGradebookMatrix?.standards || [];
export const selectSBGradebookMatrixStudents = (state) => state.standards?.sbGradebookMatrix?.students || [];
export const selectSBGradebookMatrixData = (state) => state.standards?.sbGradebookMatrix?.matrix || {};
export const selectSBGradebookMatrixClassAverage = (state) => state.standards?.sbGradebookMatrix?.classAverage || {};
export const selectSBGradebookMatrixPagination = (state) => state.standards?.sbGradebookMatrix?.pagination;
export const selectSBGradebookMatrixFilterOptions = (state) => state.standards?.sbGradebookMatrix?.filterOptions;
export const selectSBGradebookMatrixLoading = (state) => state.standards?.sbGradebookMatrixLoading;
export const selectSBGradebookMatrixError = (state) => state.standards?.sbGradebookMatrixError;
export const selectBulkSaveLoading = (state) => state.standards?.bulkSaveLoading;

export default standardSlice.reducer;
