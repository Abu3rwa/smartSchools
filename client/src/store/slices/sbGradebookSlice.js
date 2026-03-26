import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── SB Gradebook Thunks ───

export const fetchSBGradebook = createAsyncThunk(
    'sbGradebook/fetchSBGradebook',
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
    'sbGradebook/fetchSBGradebookMatrix',
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
    'sbGradebook/saveBulkManualScores',
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

const SB_GRADEBOOK_INITIAL = {
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
    filters: {},
    scoringMode: 'average',
};

const SB_GRADEBOOK_MATRIX_INITIAL = {
    standards: [],
    students: [],
    matrix: {},
    classAverage: {},
    pagination: null,
    filterOptions: { classes: [], subjects: [], standards: [] },
    academicYear: null,
    semester: null,
    scoringMode: 'average',
};

const sbGradebookSlice = createSlice({
    name: 'sbGradebook',
    initialState: {
        sbGradebook: { ...SB_GRADEBOOK_INITIAL },
        sbGradebookLoading: false,
        sbGradebookError: null,
        sbGradebookMatrix: { ...SB_GRADEBOOK_MATRIX_INITIAL },
        sbGradebookMatrixLoading: false,
        sbGradebookMatrixError: null,
        bulkSaveLoading: false,
        bulkSaveError: null
    },
    reducers: {
        clearSBGradebook: (state) => {
            state.sbGradebook = { ...SB_GRADEBOOK_INITIAL };
            state.sbGradebookLoading = false;
            state.sbGradebookError = null;
        },
        clearSBGradebookMatrix: (state) => {
            state.sbGradebookMatrix = { ...SB_GRADEBOOK_MATRIX_INITIAL };
            state.sbGradebookMatrixLoading = false;
            state.sbGradebookMatrixError = null;
        }
    },
    extraReducers: (builder) => {
        builder
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
                    filters: action.payload?.filters || {},
                    scoringMode: action.payload?.scoringMode || 'average',
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
                    scoringMode: action.payload?.scoringMode || 'average',
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

export const { clearSBGradebook, clearSBGradebookMatrix } = sbGradebookSlice.actions;

// Selectors
export const selectSBGradebookRows = (state) => state.sbGradebook?.sbGradebook?.rows || [];
export const selectSBGradebookSummary = (state) => state.sbGradebook?.sbGradebook?.summary;
export const selectSBGradebookPagination = (state) => state.sbGradebook?.sbGradebook?.pagination;
export const selectSBGradebookFilterOptions = (state) => state.sbGradebook?.sbGradebook?.filterOptions;
export const selectSBGradebookFilters = (state) => state.sbGradebook?.sbGradebook?.filters || {};
export const selectSBGradebookLoading = (state) => state.sbGradebook?.sbGradebookLoading;
export const selectSBGradebookError = (state) => state.sbGradebook?.sbGradebookError;
export const selectSBGradebookScoringMode = (state) => state.sbGradebook?.sbGradebook?.scoringMode || 'average';

// Matrix selectors
export const selectSBGradebookMatrixStandards = (state) => state.sbGradebook?.sbGradebookMatrix?.standards || [];
export const selectSBGradebookMatrixStudents = (state) => state.sbGradebook?.sbGradebookMatrix?.students || [];
export const selectSBGradebookMatrixData = (state) => state.sbGradebook?.sbGradebookMatrix?.matrix || {};
export const selectSBGradebookMatrixClassAverage = (state) => state.sbGradebook?.sbGradebookMatrix?.classAverage || {};
export const selectSBGradebookMatrixPagination = (state) => state.sbGradebook?.sbGradebookMatrix?.pagination;
export const selectSBGradebookMatrixFilterOptions = (state) => state.sbGradebook?.sbGradebookMatrix?.filterOptions;
export const selectSBGradebookMatrixLoading = (state) => state.sbGradebook?.sbGradebookMatrixLoading;
export const selectSBGradebookMatrixError = (state) => state.sbGradebook?.sbGradebookMatrixError;
export const selectSBGradebookMatrixScoringMode = (state) => state.sbGradebook?.sbGradebookMatrix?.scoringMode || 'average';
export const selectBulkSaveLoading = (state) => state.sbGradebook?.bulkSaveLoading;

export default sbGradebookSlice.reducer;
