import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Student: Get my assignments
export const fetchMyAssignments = createAsyncThunk(
    'practice/fetchMyAssignments',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/practice/my-assignments');
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch assignments');
        }
    }
);

// Student: Generate a question
export const generateQuestion = createAsyncThunk(
    'practice/generateQuestion',
    async (data, { rejectWithValue }) => {
        try {
            const response = await api.post('/practice/generate', data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load question. Please try again.');
        }
    }
);

// Student: Submit answer
export const submitAnswer = createAsyncThunk(
    'practice/submitAnswer',
    async (data, { rejectWithValue }) => {
        try {
            const response = await api.post('/practice/submit', data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to submit answer');
        }
    }
);

// Student: Get practice history
export const fetchPracticeHistory = createAsyncThunk(
    'practice/fetchPracticeHistory',
    async ({ standardId, params = {} }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/practice/history/${standardId}`, { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch history');
        }
    }
);

const practiceSlice = createSlice({
    name: 'practice',
    initialState: {
        myAssignments: [],
        studentId: null,
        currentQuestion: null,
        lastResult: null,
        practiceStatus: null,
        sessionInfo: null,
        statusMessage: null,
        studentFirstName: null,
        suggestRemediation: false,
        practiceHistory: [],
        historyMastery: null,
        historyPagination: null,
        loading: false,
        generating: false,
        submitting: false,
        error: null
    },
    reducers: {
        clearError: (state) => { state.error = null; },
        clearCurrentQuestion: (state) => {
            state.currentQuestion = null;
            state.lastResult = null;
            state.practiceStatus = null;
            state.statusMessage = null;
            state.suggestRemediation = false;
        },
        clearLastResult: (state) => { state.lastResult = null; },
        clearPracticeHistory: (state) => { state.practiceHistory = []; state.historyMastery = null; }
    },
    extraReducers: (builder) => {
        builder
            // My assignments
            .addCase(fetchMyAssignments.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchMyAssignments.fulfilled, (state, action) => {
                state.loading = false;
                state.myAssignments = action.payload.assignments;
                state.studentId = action.payload.studentId;
            })
            .addCase(fetchMyAssignments.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Generate question
            .addCase(generateQuestion.pending, (state) => { state.generating = true; state.error = null; state.lastResult = null; })
            .addCase(generateQuestion.fulfilled, (state, action) => {
                state.generating = false;
                state.practiceStatus = action.payload.status;
                state.statusMessage = action.payload.message || null;
                state.sessionInfo = action.payload.session || null;
                state.studentFirstName = action.payload.studentFirstName || state.studentFirstName;
                state.suggestRemediation = Boolean(action.payload.suggestRemediation);
                state.currentQuestion = action.payload.question || null;
            })
            .addCase(generateQuestion.rejected, (state, action) => {
                state.generating = false;
                state.error = action.payload;
            })
            // Submit answer
            .addCase(submitAnswer.pending, (state) => { state.submitting = true; state.error = null; })
            .addCase(submitAnswer.fulfilled, (state, action) => {
                state.submitting = false;
                state.lastResult = action.payload;
                state.currentQuestion = null;
                state.sessionInfo = action.payload.session || state.sessionInfo;
                state.studentFirstName = action.payload.studentFirstName || state.studentFirstName;
            })
            .addCase(submitAnswer.rejected, (state, action) => {
                state.submitting = false;
                state.error = action.payload;
            })
            // Practice history
            .addCase(fetchPracticeHistory.pending, (state) => { state.loading = true; })
            .addCase(fetchPracticeHistory.fulfilled, (state, action) => {
                state.loading = false;
                state.practiceHistory = action.payload.attempts;
                state.historyMastery = action.payload.mastery;
                state.historyPagination = action.payload.pagination;
            })
            .addCase(fetchPracticeHistory.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

export const { clearError, clearCurrentQuestion, clearLastResult, clearPracticeHistory } = practiceSlice.actions;

// Selectors
export const selectMyAssignments = (state) => state.practice?.myAssignments || [];
export const selectPracticeStudentId = (state) => state.practice?.studentId;
export const selectCurrentQuestion = (state) => state.practice?.currentQuestion;
export const selectLastResult = (state) => state.practice?.lastResult;
export const selectPracticeHistory = (state) => state.practice?.practiceHistory || [];
export const selectHistoryMastery = (state) => state.practice?.historyMastery;
export const selectPracticeLoading = (state) => state.practice?.loading;
export const selectGenerating = (state) => state.practice?.generating;
export const selectSubmitting = (state) => state.practice?.submitting;
export const selectPracticeError = (state) => state.practice?.error;
export const selectPracticeStatus = (state) => state.practice?.practiceStatus;
export const selectPracticeSessionInfo = (state) => state.practice?.sessionInfo;
export const selectPracticeStatusMessage = (state) => state.practice?.statusMessage;
export const selectPracticeStudentFirstName = (state) => state.practice?.studentFirstName;
export const selectPracticeSuggestRemediation = (state) => state.practice?.suggestRemediation;

export default practiceSlice.reducer;
