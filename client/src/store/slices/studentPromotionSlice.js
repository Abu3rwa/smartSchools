import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Promotion Thunks ───

export const fetchPromotionQueue = createAsyncThunk(
    'studentPromotion/fetchPromotionQueue',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/students/promotion/queue', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch promotion queue');
        }
    }
);

export const submitStudentPromotionDecision = createAsyncThunk(
    'studentPromotion/submitPromotionDecision',
    async ({ studentId, decisionData }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/promotion-decisions`, decisionData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to submit promotion decision');
        }
    }
);

export const updateStudentReEnrollment = createAsyncThunk(
    'studentPromotion/updateStudentReEnrollment',
    async ({ studentId, updates }, { rejectWithValue }) => {
        try {
            const response = await api.patch(`/students/${studentId}/re-enrollment`, updates);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update re-enrollment status');
        }
    }
);

// ─── Helpers ───

const syncStudentInPromotionQueue = (state, updatedStudent, latestDecision = undefined) => {
    state.promotionQueue = state.promotionQueue.map((item) => {
        if (item?.student?._id !== updatedStudent._id) {
            return item;
        }

        let decisionStatus = item.decisionStatus;
        if (latestDecision) {
            if (latestDecision.decisionType === 'hold_review' && latestDecision.approvalStatus === 'approved') {
                decisionStatus = 'hold_review';
            } else {
                decisionStatus = latestDecision.approvalStatus;
            }
        }

        return {
            ...item,
            student: updatedStudent,
            latestDecision: latestDecision === undefined ? item.latestDecision : latestDecision,
            decisionStatus
        };
    });
};

// ─── Slice ───

const studentPromotionSlice = createSlice({
    name: 'studentPromotion',
    initialState: {
        promotionQueue: [],
        promotionQueuePagination: null,
        promotionQueueAcademicYear: null,
        promotionQueueLoading: false,
        promotionActionLoading: false,
        error: null
    },
    reducers: {
        clearPromotionError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPromotionQueue.pending, (state) => {
                state.promotionQueueLoading = true;
                state.error = null;
            })
            .addCase(fetchPromotionQueue.fulfilled, (state, action) => {
                state.promotionQueueLoading = false;
                state.promotionQueue = action.payload.queue || [];
                state.promotionQueuePagination = action.payload.pagination || null;
                state.promotionQueueAcademicYear = action.payload.academicYear || null;
            })
            .addCase(fetchPromotionQueue.rejected, (state, action) => {
                state.promotionQueueLoading = false;
                state.error = action.payload;
            })
            .addCase(submitStudentPromotionDecision.pending, (state) => {
                state.promotionActionLoading = true;
                state.error = null;
            })
            .addCase(submitStudentPromotionDecision.fulfilled, (state, action) => {
                state.promotionActionLoading = false;
                const updatedStudent = action.payload.student;
                if (updatedStudent) {
                    syncStudentInPromotionQueue(state, updatedStudent, action.payload.decision || null);
                }
            })
            .addCase(submitStudentPromotionDecision.rejected, (state, action) => {
                state.promotionActionLoading = false;
                state.error = action.payload;
            })
            .addCase(updateStudentReEnrollment.pending, (state) => {
                state.promotionActionLoading = true;
                state.error = null;
            })
            .addCase(updateStudentReEnrollment.fulfilled, (state, action) => {
                state.promotionActionLoading = false;
                const updatedStudent = action.payload.student;
                if (updatedStudent) {
                    syncStudentInPromotionQueue(state, updatedStudent);
                }
            })
            .addCase(updateStudentReEnrollment.rejected, (state, action) => {
                state.promotionActionLoading = false;
                state.error = action.payload;
            });
    }
});

export const { clearPromotionError } = studentPromotionSlice.actions;

// Selectors
export const selectPromotionQueue = (state) => state.studentPromotion.promotionQueue;
export const selectPromotionQueuePagination = (state) => state.studentPromotion.promotionQueuePagination;
export const selectPromotionQueueAcademicYear = (state) => state.studentPromotion.promotionQueueAcademicYear;
export const selectPromotionQueueLoading = (state) => state.studentPromotion.promotionQueueLoading;
export const selectPromotionActionLoading = (state) => state.studentPromotion.promotionActionLoading;

export default studentPromotionSlice.reducer;
