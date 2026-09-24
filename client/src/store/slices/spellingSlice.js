import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api from '../../config/api';

const requestError = (error, fallback) => error.response?.data?.message || fallback;

export const fetchSpellingHistory = createAsyncThunk('spelling/fetchHistory', async (params = {}, { rejectWithValue }) => {
    try {
        const response = await api.get('/spelling/sessions', { params });
        return response.data.data || [];
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to load spelling history.'));
    }
});

export const fetchSpellingRetests = createAsyncThunk('spelling/fetchRetests', async (params = {}, { rejectWithValue }) => {
    try {
        const response = await api.get('/spelling/retest-queue', { params });
        return response.data.data || [];
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to load spelling retests.'));
    }
});

export const fetchSpellingWords = createAsyncThunk('spelling/fetchWords', async (params = {}, { rejectWithValue }) => {
    try {
        const response = await api.get('/spelling/word-lists', { params });
        return response.data.data || { words: [], categories: [] };
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to load spelling words.'));
    }
});

export const fetchStudentSpellingDetails = createAsyncThunk('spelling/fetchStudentDetails', async ({ studentId, params = {} }, { rejectWithValue }) => {
    try {
        const response = await api.get(`/spelling/students/${studentId}/details`, { params });
        return response.data.data;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to load student spelling details.'));
    }
});

export const startTeacherSpellingSession = createAsyncThunk('spelling/startTeacherSession', async ({ studentId, curriculumGrade, curriculumWeek, emailNotification, mode = 'teacher-led' }, { rejectWithValue }) => {
    try {
        const response = await api.post('/spelling/sessions', { studentId, mode, maxMistakesAllowed: 3, curriculumGrade, curriculumWeek, emailNotification });
        return response.data.data;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to start the teacher session.'));
    }
});

export const fetchActiveSpellingSession = createAsyncThunk('spelling/fetchActiveSession', async (_, { rejectWithValue }) => {
    try {
        const response = await api.get('/spelling/sessions/active');
        return response.data.data || null;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to load the active spelling session.'));
    }
});

export const submitTeacherSpellingAttempt = createAsyncThunk('spelling/submitTeacherAttempt', async ({ sessionId, sequence, correct }, { rejectWithValue }) => {
    try {
        const response = await api.patch(`/spelling/sessions/${sessionId}/attempt`, {
            sequence,
            correct,
            idempotencyKey: `${sessionId}-${sequence}`
        });
        return response.data.data;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to record the spelling attempt.'));
    }
});

export const startSelfServeSpellingSession = createAsyncThunk('spelling/startSession', async (_, { rejectWithValue }) => {
    try {
        const response = await api.post('/spelling/sessions', { mode: 'self-serve', maxMistakesAllowed: 3 });
        return response.data.data;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to start the spelling session.'));
    }
});

export const fetchSpellingCurrentItem = createAsyncThunk('spelling/fetchCurrentItem', async (sessionId, { rejectWithValue }) => {
    try {
        const response = await api.get(`/spelling/sessions/${sessionId}/current-item`);
        return response.data.data;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to load the current spelling item.'));
    }
});

export const submitSpellingAnswer = createAsyncThunk('spelling/submitAnswer', async ({ sessionId, sequence, studentInput }, { rejectWithValue }) => {
    try {
        const response = await api.patch(`/spelling/sessions/${sessionId}/attempt`, {
            sequence,
            studentInput,
            idempotencyKey: `${sessionId}-${sequence}`
        });
        return response.data.data;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to submit the spelling answer.'));
    }
});

export const endSpellingSession = createAsyncThunk('spelling/endSession', async ({ sessionId, reason = 'manual-complete' }, { rejectWithValue }) => {
    try {
        const response = await api.post(`/spelling/sessions/${sessionId}/complete`, { reason });
        return response.data.data;
    } catch (error) {
        return rejectWithValue(requestError(error, 'Unable to end the spelling session.'));
    }
});

const spellingSlice = createSlice({
    name: 'spelling',
    initialState: {
        history: [],
        retests: [],
        words: [],
        categories: [],
        studentDetails: null,
        session: null,
        currentItem: null,
        feedback: null,
        loading: false,
        error: null
    },
    reducers: {
        clearSpellingFeedback: (state) => { state.feedback = null; },
        clearSpellingError: (state) => { state.error = null; }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSpellingHistory.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchSpellingHistory.fulfilled, (state, action) => { state.loading = false; state.history = action.payload; })
            .addCase(fetchSpellingHistory.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(fetchSpellingRetests.fulfilled, (state, action) => { state.retests = action.payload; })
            .addCase(fetchSpellingRetests.rejected, (state, action) => { state.error = action.payload; })
            .addCase(fetchSpellingWords.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchSpellingWords.fulfilled, (state, action) => {
                state.loading = false;
                state.words = action.payload.words || [];
                state.categories = action.payload.categories || [];
            })
            .addCase(fetchSpellingWords.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(fetchStudentSpellingDetails.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchStudentSpellingDetails.fulfilled, (state, action) => { state.loading = false; state.studentDetails = action.payload; })
            .addCase(fetchStudentSpellingDetails.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(startSelfServeSpellingSession.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(startSelfServeSpellingSession.fulfilled, (state, action) => { state.loading = false; state.session = action.payload; })
            .addCase(startSelfServeSpellingSession.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(startTeacherSpellingSession.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(startTeacherSpellingSession.fulfilled, (state, action) => { state.loading = false; state.session = action.payload; })
            .addCase(startTeacherSpellingSession.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(fetchActiveSpellingSession.fulfilled, (state, action) => { state.session = action.payload; })
            .addCase(fetchSpellingCurrentItem.fulfilled, (state, action) => {
                state.session = action.payload.session;
                state.currentItem = action.payload.item;
            })
            .addCase(fetchSpellingCurrentItem.rejected, (state, action) => { state.error = action.payload; })
            .addCase(submitSpellingAnswer.pending, (state) => { state.loading = true; state.error = null; state.feedback = null; })
            .addCase(submitSpellingAnswer.fulfilled, (state, action) => {
                state.loading = false;
                state.session = action.payload.session;
                state.feedback = { correct: action.payload.attempt.correct, answer: action.payload.attempt.wordSnapshot };
                state.currentItem = action.payload.session.status === 'in-progress' ? null : null;
            })
            .addCase(submitSpellingAnswer.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
            
        builder
            .addCase(submitTeacherSpellingAttempt.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(submitTeacherSpellingAttempt.fulfilled, (state, action) => {
                state.loading = false;
                state.session = action.payload.session;
                state.currentItem = null;
            })
            .addCase(submitTeacherSpellingAttempt.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
            
        builder
            .addCase(endSpellingSession.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(endSpellingSession.fulfilled, (state, action) => {
                state.loading = false;
                state.session = null;
                state.currentItem = null;
                state.feedback = null;
            })
            .addCase(endSpellingSession.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
    }
});

export const { clearSpellingFeedback, clearSpellingError } = spellingSlice.actions;
export const selectSpelling = (state) => state.spelling || {};
export default spellingSlice.reducer;
