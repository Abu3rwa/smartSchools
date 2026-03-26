import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Practice Core Thunks ───

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

// ─── Slice ───

const practiceCoreSlice = createSlice({
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
        loading: false,
        assignmentsLoading: false,
        generating: false,
        submitting: false,
        error: null
    },
    reducers: {
        clearCoreError: (state) => {
            state.error = null;
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
        clearLastResult: (state) => { state.lastResult = null; }
    },
    extraReducers: (builder) => {
        builder
            // My assignments
            .addCase(fetchMyAssignments.pending, (state) => {
                state.assignmentsLoading = true;
                state.loading = Boolean(state.assignmentsLoading);
                state.error = null;
            })
            .addCase(fetchMyAssignments.fulfilled, (state, action) => {
                state.assignmentsLoading = false;
                state.loading = false;
                state.myAssignments = action.payload.assignments;
                state.studentId = action.payload.studentId;
            })
            .addCase(fetchMyAssignments.rejected, (state, action) => {
                state.assignmentsLoading = false;
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
            });
    }
});

export const { clearCoreError, clearCurrentQuestion, clearLastResult } = practiceCoreSlice.actions;

// Selectors
export const selectMyAssignments = (state) => state.practice?.myAssignments || [];
export const selectPracticeStudentId = (state) => state.practice?.studentId;
export const selectCurrentQuestion = (state) => state.practice?.currentQuestion;
export const selectLastResult = (state) => state.practice?.lastResult;
export const selectPracticeAssignmentsLoading = (state) => state.practice?.assignmentsLoading || false;
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

export default practiceCoreSlice.reducer;
