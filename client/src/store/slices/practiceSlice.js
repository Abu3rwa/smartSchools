import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

const syncLoadingState = (state) => {
    state.loading = Boolean(state.assignmentsLoading || state.historyLoading);
};

// Student: Get my assignments
export const fetchMyAssignments = createAsyncThunk(
    'practice/fetchMyAssignments',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/practice/my-assignments', { params });
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

// Student: Get smart review queue
export const fetchReviewQueue = createAsyncThunk(
    'practice/fetchReviewQueue',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/review/queue', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch review queue');
        }
    }
);

export const fetchMyAssessmentResults = createAsyncThunk(
    'practice/fetchMyAssessmentResults',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/practice/assessment/my-results', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch assessment results');
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
        sessionContext: null,
        statusMessage: null,
        studentFirstName: null,
        assignmentInstructions: null,
        suggestRemediation: false,
        practiceHistory: [],
        reviewQueue: [],
        reviewFeatureEnabled: false,
        reviewQueueLoading: false,
        reviewQueueError: null,
        historyMastery: null,
        historyPagination: null,
        assessmentResults: [],
        assessmentStandardAverages: [],
        assessmentSummary: null,
        assessmentResultsLoading: false,
        assessmentResultsError: null,
        loading: false,
        assignmentsLoading: false,
        historyLoading: false,
        generating: false,
        submitting: false,
        error: null
    },
    reducers: {
        clearError: (state) => {
            state.error = null;
            state.reviewQueueError = null;
        },
        clearCurrentQuestion: (state) => {
            state.currentQuestion = null;
            state.lastResult = null;
            state.practiceStatus = null;
            state.statusMessage = null;
            state.sessionContext = null;
            state.suggestRemediation = false;
            state.assignmentInstructions = null;
        },
        clearLastResult: (state) => { state.lastResult = null; },
        clearPracticeHistory: (state) => { state.practiceHistory = []; state.historyMastery = null; }
    },
    extraReducers: (builder) => {
        builder
            // My assignments
            .addCase(fetchMyAssignments.pending, (state) => {
                state.assignmentsLoading = true;
                syncLoadingState(state);
                state.error = null;
            })
            .addCase(fetchMyAssignments.fulfilled, (state, action) => {
                state.assignmentsLoading = false;
                syncLoadingState(state);
                state.myAssignments = action.payload.assignments;
                state.studentId = action.payload.studentId;
            })
            .addCase(fetchMyAssignments.rejected, (state, action) => {
                state.assignmentsLoading = false;
                syncLoadingState(state);
                state.error = action.payload;
            })
            // Generate question
            .addCase(generateQuestion.pending, (state) => { state.generating = true; state.error = null; state.lastResult = null; })
            .addCase(generateQuestion.fulfilled, (state, action) => {
                state.generating = false;
                state.practiceStatus = action.payload.status;
                state.statusMessage = action.payload.message || null;
                state.sessionInfo = action.payload.session || null;
                state.sessionContext = action.payload.sessionContext || state.sessionContext;
                state.studentFirstName = action.payload.studentFirstName || state.studentFirstName;
                state.assignmentInstructions = action.payload.assignmentInstructions || state.assignmentInstructions;
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
                state.sessionContext = action.payload.sessionContext || state.sessionContext;
                state.studentFirstName = action.payload.studentFirstName || state.studentFirstName;
            })
            .addCase(submitAnswer.rejected, (state, action) => {
                state.submitting = false;
                state.error = action.payload;
            })
            // Practice history
            .addCase(fetchPracticeHistory.pending, (state) => {
                state.historyLoading = true;
                syncLoadingState(state);
                state.error = null;
            })
            .addCase(fetchPracticeHistory.fulfilled, (state, action) => {
                state.historyLoading = false;
                syncLoadingState(state);
                state.practiceHistory = action.payload.attempts;
                state.historyMastery = action.payload.mastery;
                state.historyPagination = action.payload.pagination;
            })
            .addCase(fetchPracticeHistory.rejected, (state, action) => {
                state.historyLoading = false;
                syncLoadingState(state);
                state.error = action.payload;
            })
            // Review queue
            .addCase(fetchReviewQueue.pending, (state) => {
                state.reviewQueueLoading = true;
                state.reviewQueueError = null;
            })
            .addCase(fetchReviewQueue.fulfilled, (state, action) => {
                state.reviewQueueLoading = false;
                state.reviewQueue = action.payload?.items || [];
                state.reviewFeatureEnabled = Boolean(action.payload?.featureEnabled);
            })
            .addCase(fetchReviewQueue.rejected, (state, action) => {
                state.reviewQueueLoading = false;
                state.reviewQueueError = action.payload;
            })
            // Assessment results
            .addCase(fetchMyAssessmentResults.pending, (state) => {
                state.assessmentResultsLoading = true;
                state.assessmentResultsError = null;
            })
            .addCase(fetchMyAssessmentResults.fulfilled, (state, action) => {
                state.assessmentResultsLoading = false;
                state.assessmentResults = action.payload?.items || [];
                state.assessmentStandardAverages = action.payload?.standardAverages || [];
                state.assessmentSummary = action.payload?.summary || null;
            })
            .addCase(fetchMyAssessmentResults.rejected, (state, action) => {
                state.assessmentResultsLoading = false;
                state.assessmentResultsError = action.payload;
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
export const selectReviewQueue = (state) => state.practice?.reviewQueue || [];
export const selectReviewFeatureEnabled = (state) => state.practice?.reviewFeatureEnabled;
export const selectReviewQueueLoading = (state) => state.practice?.reviewQueueLoading || false;
export const selectReviewQueueError = (state) => state.practice?.reviewQueueError;
export const selectHistoryMastery = (state) => state.practice?.historyMastery;
export const selectPracticeLoading = (state) => state.practice?.loading || false;
export const selectPracticeAssignmentsLoading = (state) => state.practice?.assignmentsLoading || false;
export const selectPracticeHistoryLoading = (state) => state.practice?.historyLoading || false;
export const selectGenerating = (state) => state.practice?.generating || false;
export const selectSubmitting = (state) => state.practice?.submitting || false;
export const selectPracticeError = (state) => state.practice?.error;
export const selectPracticeStatus = (state) => state.practice?.practiceStatus;
export const selectPracticeSessionInfo = (state) => state.practice?.sessionInfo;
export const selectPracticeStatusMessage = (state) => state.practice?.statusMessage;
export const selectPracticeStudentFirstName = (state) => state.practice?.studentFirstName;
export const selectPracticeAssignmentInstructions = (state) => state.practice?.assignmentInstructions;
export const selectPracticeSuggestRemediation = (state) => state.practice?.suggestRemediation;
export const selectPracticeSessionContext = (state) => state.practice?.sessionContext;
export const selectMyAssessmentResults = (state) => state.practice?.assessmentResults || [];
export const selectMyAssessmentStandardAverages = (state) => state.practice?.assessmentStandardAverages || [];
export const selectMyAssessmentSummary = (state) => state.practice?.assessmentSummary;
export const selectMyAssessmentResultsLoading = (state) => state.practice?.assessmentResultsLoading || false;
export const selectMyAssessmentResultsError = (state) => state.practice?.assessmentResultsError;

export default practiceSlice.reducer;
