import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Thunks ────────────────────────────────────────────────────────────────

export const fetchGrammarTests = createAsyncThunk(
    'grammarTests/fetchAll',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/grammar-tests', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch grammar tests');
        }
    }
);

export const createGrammarTest = createAsyncThunk(
    'grammarTests/create',
    async (data, { rejectWithValue }) => {
        try {
            const response = await api.post('/grammar-tests', data);
            return response.data.data.test;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create grammar test');
        }
    }
);

export const updateGrammarTest = createAsyncThunk(
    'grammarTests/update',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/grammar-tests/${id}`, data);
            return response.data.data.test;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update grammar test');
        }
    }
);

export const deleteGrammarTest = createAsyncThunk(
    'grammarTests/delete',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/grammar-tests/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete grammar test');
        }
    }
);

export const toggleGrammarTest = createAsyncThunk(
    'grammarTests/toggle',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.patch(`/grammar-tests/${id}/toggle`);
            return { id, isEnabled: response.data.data.isEnabled };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to toggle grammar test');
        }
    }
);

export const publishGrammarTest = createAsyncThunk(
    'grammarTests/publish',
    async (id, { rejectWithValue }) => {
        try {
            await api.post(`/grammar-tests/${id}/publish`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to publish grammar test');
        }
    }
);

export const fetchGrammarTestPool = createAsyncThunk(
    'grammarTests/fetchPool',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/grammar-tests/${id}/pool`);
            return { id, ...response.data.data };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load question pool');
        }
    }
);

export const updateGrammarTestPool = createAsyncThunk(
    'grammarTests/updatePool',
    async ({ id, questions }, { rejectWithValue }) => {
        try {
            await api.put(`/grammar-tests/${id}/pool`, { questions });
            return { id, questions };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to save question pool');
        }
    }
);

export const regenerateGrammarTestQuestion = createAsyncThunk(
    'grammarTests/regenerateQuestion',
    async ({ id, questionIndex, questionType, difficulty }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/grammar-tests/${id}/pool/regenerate`, { questionIndex, questionType, difficulty });
            return { id, ...response.data.data };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to regenerate question');
        }
    }
);

// ─── Slice ─────────────────────────────────────────────────────────────────

const grammarTestSlice = createSlice({
    name: 'grammarTests',
    initialState: {
        tests: [],
        pagination: null,
        loading: false,
        error: null,
        poolData: null,
        poolLoading: false,
        poolError: null,
    },
    reducers: {
        clearError(state) { state.error = null; },
        clearPool(state) { state.poolData = null; state.poolError = null; },
    },
    extraReducers: (builder) => {
        // fetchGrammarTests
        builder.addCase(fetchGrammarTests.pending, (state) => { state.loading = true; state.error = null; });
        builder.addCase(fetchGrammarTests.fulfilled, (state, action) => {
            state.loading = false;
            state.tests = action.payload?.tests || [];
            state.pagination = action.payload?.pagination || null;
        });
        builder.addCase(fetchGrammarTests.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

        // createGrammarTest
        builder.addCase(createGrammarTest.fulfilled, (state, action) => {
            state.tests.unshift(action.payload);
        });

        // updateGrammarTest
        builder.addCase(updateGrammarTest.fulfilled, (state, action) => {
            const idx = state.tests.findIndex(t => t._id === action.payload._id);
            if (idx !== -1) state.tests[idx] = action.payload;
        });

        // deleteGrammarTest
        builder.addCase(deleteGrammarTest.fulfilled, (state, action) => {
            state.tests = state.tests.filter(t => t._id !== action.payload);
        });

        // toggleGrammarTest
        builder.addCase(toggleGrammarTest.fulfilled, (state, action) => {
            const idx = state.tests.findIndex(t => t._id === action.payload.id);
            if (idx !== -1) state.tests[idx] = { ...state.tests[idx], isEnabled: action.payload.isEnabled };
        });

        // publishGrammarTest
        builder.addCase(publishGrammarTest.fulfilled, (state, action) => {
            const idx = state.tests.findIndex(t => t._id === action.payload);
            if (idx !== -1) state.tests[idx] = { ...state.tests[idx], questionWorkflow: { ...state.tests[idx].questionWorkflow, status: 'published' } };
        });

        // fetchGrammarTestPool
        builder.addCase(fetchGrammarTestPool.pending, (state) => { state.poolLoading = true; state.poolError = null; });
        builder.addCase(fetchGrammarTestPool.fulfilled, (state, action) => { state.poolLoading = false; state.poolData = action.payload; });
        builder.addCase(fetchGrammarTestPool.rejected, (state, action) => { state.poolLoading = false; state.poolError = action.payload; });

        // updateGrammarTestPool
        builder.addCase(updateGrammarTestPool.fulfilled, (state, action) => {
            if (state.poolData?.id === action.payload.id) {
                state.poolData.questions = action.payload.questions;
            }
        });

        // regenerateGrammarTestQuestion
        builder.addCase(regenerateGrammarTestQuestion.fulfilled, (state, action) => {
            if (state.poolData?.id === action.payload.id) {
                const questions = [...(state.poolData.questions || [])];
                questions[action.payload.questionIndex] = action.payload.question;
                state.poolData.questions = questions;
            }
        });
    },
});

export const { clearError, clearPool } = grammarTestSlice.actions;

// ─── Selectors ─────────────────────────────────────────────────────────────

export const selectGrammarTests = (state) => state.grammarTests?.tests || [];
export const selectGrammarTestsLoading = (state) => state.grammarTests?.loading || false;
export const selectGrammarTestsError = (state) => state.grammarTests?.error || null;
export const selectGrammarTestPool = (state) => state.grammarTests?.poolData || null;
export const selectGrammarTestPoolLoading = (state) => state.grammarTests?.poolLoading || false;
export const selectGrammarTestPoolError = (state) => state.grammarTests?.poolError || null;

export default grammarTestSlice.reducer;
