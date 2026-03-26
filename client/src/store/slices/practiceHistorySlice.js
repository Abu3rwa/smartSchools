import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── History / Review / Assessment Thunks ───

// Student: Get practice history
export const fetchPracticeHistory = createAsyncThunk(
    'practiceHistory/fetchPracticeHistory',
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
    'practiceHistory/fetchReviewQueue',
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
    'practiceHistory/fetchMyAssessmentResults',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/practice/assessment/my-results', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch assessment results');
        }
    }
);

// ─── Slice ───

const practiceHistorySlice = createSlice({
    name: 'practiceHistory',
    initialState: {
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
        historyLoading: false,
        error: null
    },
    reducers: {
        clearHistoryError: (state) => {
            state.error = null;
            state.reviewQueueError = null;
        },
        clearPracticeHistory: (state) => {
            state.practiceHistory = [];
            state.historyMastery = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Practice history
            .addCase(fetchPracticeHistory.pending, (state) => {
                state.historyLoading = true;
                state.error = null;
            })
            .addCase(fetchPracticeHistory.fulfilled, (state, action) => {
                state.historyLoading = false;
                state.practiceHistory = action.payload.attempts;
                state.historyMastery = action.payload.mastery;
                state.historyPagination = action.payload.pagination;
            })
            .addCase(fetchPracticeHistory.rejected, (state, action) => {
                state.historyLoading = false;
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

export const { clearHistoryError, clearPracticeHistory } = practiceHistorySlice.actions;

// Selectors
export const selectPracticeHistory = (state) => state.practiceHistory?.practiceHistory || [];
export const selectReviewQueue = (state) => state.practiceHistory?.reviewQueue || [];
export const selectReviewFeatureEnabled = (state) => state.practiceHistory?.reviewFeatureEnabled;
export const selectReviewQueueLoading = (state) => state.practiceHistory?.reviewQueueLoading || false;
export const selectReviewQueueError = (state) => state.practiceHistory?.reviewQueueError;
export const selectHistoryMastery = (state) => state.practiceHistory?.historyMastery;
export const selectPracticeHistoryLoading = (state) => state.practiceHistory?.historyLoading || false;
export const selectMyAssessmentResults = (state) => state.practiceHistory?.assessmentResults || [];
export const selectMyAssessmentStandardAverages = (state) => state.practiceHistory?.assessmentStandardAverages || [];
export const selectMyAssessmentSummary = (state) => state.practiceHistory?.assessmentSummary;
export const selectMyAssessmentResultsLoading = (state) => state.practiceHistory?.assessmentResultsLoading || false;
export const selectMyAssessmentResultsError = (state) => state.practiceHistory?.assessmentResultsError;

export default practiceHistorySlice.reducer;
