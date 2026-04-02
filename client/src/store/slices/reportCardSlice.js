import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import reportCardService from '../../services/reportCardService';

export const fetchReportCards = createAsyncThunk(
    'reportCards/fetch',
    async (params = {}, { rejectWithValue }) => {
        try {
            const result = await reportCardService.getReportCards(params);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load report cards');
        }
    }
);

export const fetchReportCard = createAsyncThunk(
    'reportCards/fetchOne',
    async (id, { rejectWithValue }) => {
        try {
            const result = await reportCardService.getReportCard(id);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load report card');
        }
    }
);

export const generateReportCard = createAsyncThunk(
    'reportCards/generate',
    async (data, { rejectWithValue }) => {
        try {
            const result = await reportCardService.generateReportCard(data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to generate report card');
        }
    }
);

export const generateBulkReportCards = createAsyncThunk(
    'reportCards/generateBulk',
    async (data, { rejectWithValue }) => {
        try {
            const result = await reportCardService.generateBulkReportCards(data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to generate bulk report cards');
        }
    }
);

export const publishReportCard = createAsyncThunk(
    'reportCards/publish',
    async (id, { rejectWithValue }) => {
        try {
            const result = await reportCardService.publishReportCard(id);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to publish report card');
        }
    }
);

export const updateReportCardComments = createAsyncThunk(
    'reportCards/updateComments',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const result = await reportCardService.updateComments(id, data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update comments');
        }
    }
);

const reportCardSlice = createSlice({
    name: 'reportCards',
    initialState: {
        reportCards: [],
        currentReportCard: null,
        bulkResult: null,
        loading: false,
        generating: false,
        error: null
    },
    reducers: {
        clearReportCardError: (state) => { state.error = null; },
        clearBulkResult: (state) => { state.bulkResult = null; },
        clearCurrentReportCard: (state) => { state.currentReportCard = null; }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchReportCards.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchReportCards.fulfilled, (state, action) => { state.loading = false; state.reportCards = action.payload; })
            .addCase(fetchReportCards.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(fetchReportCard.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchReportCard.fulfilled, (state, action) => { state.loading = false; state.currentReportCard = action.payload; })
            .addCase(fetchReportCard.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(generateReportCard.pending, (state) => { state.generating = true; state.error = null; })
            .addCase(generateReportCard.fulfilled, (state, action) => {
                state.generating = false;
                state.reportCards.unshift(action.payload);
            })
            .addCase(generateReportCard.rejected, (state, action) => { state.generating = false; state.error = action.payload; })
            .addCase(generateBulkReportCards.pending, (state) => { state.generating = true; state.error = null; })
            .addCase(generateBulkReportCards.fulfilled, (state, action) => { state.generating = false; state.bulkResult = action.payload; })
            .addCase(generateBulkReportCards.rejected, (state, action) => { state.generating = false; state.error = action.payload; })
            .addCase(publishReportCard.fulfilled, (state, action) => {
                const idx = state.reportCards.findIndex(r => r._id === action.payload._id);
                if (idx !== -1) state.reportCards[idx] = action.payload;
                if (state.currentReportCard?._id === action.payload._id) state.currentReportCard = action.payload;
            })
            .addCase(updateReportCardComments.fulfilled, (state, action) => {
                if (state.currentReportCard?._id === action.payload._id) state.currentReportCard = action.payload;
            });
    }
});

export const { clearReportCardError, clearBulkResult, clearCurrentReportCard } = reportCardSlice.actions;

export const selectReportCards = (state) => state.reportCards?.reportCards || [];
export const selectCurrentReportCard = (state) => state.reportCards?.currentReportCard || null;
export const selectReportCardBulkResult = (state) => state.reportCards?.bulkResult || null;
export const selectReportCardsLoading = (state) => state.reportCards?.loading || false;
export const selectReportCardsGenerating = (state) => state.reportCards?.generating || false;
export const selectReportCardsError = (state) => state.reportCards?.error || null;

export default reportCardSlice.reducer;
