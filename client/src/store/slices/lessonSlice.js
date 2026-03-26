import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';
import lessonService from '../../services/lessonService';

export const extractPdf = createAsyncThunk(
    'lessons/extractPdf',
    async (file, { rejectWithValue }) => {
        try {
            const form = new FormData();
            form.append('materialFile', file);
            const res = await api.post('/lessons/ai/extract-pdf', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (!res.data.success) throw new Error(res.data.message);
            return res.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'PDF extraction failed');
        }
    }
);

// Async thunks
export const fetchLessons = createAsyncThunk(
    'lessons/fetchLessons',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/lessons', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch lessons');
        }
    }
);

export const createLesson = createAsyncThunk(
    'lessons/createLesson',
    async (lessonData, { rejectWithValue }) => {
        try {
            const response = await api.post('/lessons', lessonData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create lesson');
        }
    }
);

export const updateLesson = createAsyncThunk(
    'lessons/updateLesson',
    async ({ id, lessonData }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/lessons/${id}`, lessonData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update lesson');
        }
    }
);

export const deleteLesson = createAsyncThunk(
    'lessons/deleteLesson',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/lessons/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete lesson');
        }
    }
);

export const fetchLessonById = createAsyncThunk(
    'lessons/fetchLessonById',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/lessons/${id}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch lesson');
        }
    }
);

export const suggestField = createAsyncThunk(
    'lessons/suggestField',
    async (payload, { rejectWithValue }) => {
        try {
            const res = await api.post('/lessons/ai/suggest', payload);
            if (!res.data.success) throw new Error(res.data.message);
            return res.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'AI suggestion failed');
        }
    }
);

export const detectStandards = createAsyncThunk(
    'lessons/detectStandards',
    async (payload, { rejectWithValue }) => {
        try {
            const res = await api.post('/lessons/ai/detect-standards', payload);
            if (!res.data.success) throw new Error(res.data.message);
            return res.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Standards detection failed');
        }
    }
);

export const generateSection = createAsyncThunk(
    'lessons/generateSection',
    async (payload, { rejectWithValue }) => {
        try {
            const res = await api.post('/lessons/ai/generate-section', payload);
            if (!res.data.success) throw new Error(res.data.message);
            return res.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Section generation failed');
        }
    }
);

export const fetchLessonPlanStats = createAsyncThunk(
    'lessons/fetchStats',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/lessons/stats', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch lesson plan stats');
        }
    }
);

export const updateLessonPlanAdminNote = createAsyncThunk(
    'lessons/updateAdminNote',
    async ({ id, adminNoteToTeacher }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/lessons/${id}/admin-note`, { adminNoteToTeacher });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to save admin note');
        }
    }
);

export const reviewLessonPlan = createAsyncThunk(
    'lessons/reviewLessonPlan',
    async ({ id, finalStatus, comments = '' }, { rejectWithValue }) => {
        try {
            const response = await lessonService.reviewLessonPlan(id, { finalStatus, comments });
            return { lessonId: id, ...response };
        } catch (error) {
            return rejectWithValue({
                lessonId: id,
                message: error.response?.data?.message || 'Failed to review lesson plan'
            });
        }
    }
);

export const triggerLessonEvaluation = createAsyncThunk(
    'lessons/triggerLessonEvaluation',
    async ({ id, forceReevaluate = false, reason = '' }, { rejectWithValue }) => {
        try {
            const response = await lessonService.triggerLessonEvaluation(id, { forceReevaluate, reason });
            return { lessonId: id, ...response };
        } catch (error) {
            return rejectWithValue({
                lessonId: id,
                message: error.response?.data?.message || 'Failed to evaluate lesson plan'
            });
        }
    }
);

export const fetchLessonEvaluationHistory = createAsyncThunk(
    'lessons/fetchLessonEvaluationHistory',
    async ({ id, page = 1, limit = 10 }, { rejectWithValue }) => {
        try {
            const response = await lessonService.getLessonEvaluationHistory(id, { page, limit });
            return { lessonId: id, ...response };
        } catch (error) {
            return rejectWithValue({
                lessonId: id,
                message: error.response?.data?.message || 'Failed to load evaluation history'
            });
        }
    }
);

const lessonSlice = createSlice({
    name: 'lessons',
    initialState: {
        lessons: [],
        currentLesson: null,
        stats: null,
        statsLoading: false,
        loading: false,
        error: null,
        evaluationLoadingByLessonId: {},
        evaluationHistoryLoadingByLessonId: {},
        evaluationErrorByLessonId: {},
        evaluationHistoryByLessonId: {},
        evaluationMetaByLessonId: {},
        reviewLoadingByLessonId: {},
        reviewErrorByLessonId: {}
    },
    reducers: {
        clearError: (state) => {
            state.error = null;
        },
        setCurrentLesson: (state, action) => {
            state.currentLesson = action.payload;
        },
        clearCurrentLesson: (state) => {
            state.currentLesson = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchLessons.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchLessons.fulfilled, (state, action) => {
                state.loading = false;
                state.lessons = action.payload.lessons || [];
            })
            .addCase(fetchLessons.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(createLesson.fulfilled, (state, action) => {
                state.lessons.unshift(action.payload.lesson);
            })
            .addCase(updateLesson.fulfilled, (state, action) => {
                const index = state.lessons.findIndex(l => l._id === action.payload.lesson._id);
                if (index !== -1) {
                    state.lessons[index] = action.payload.lesson;
                }
            })
            .addCase(deleteLesson.fulfilled, (state, action) => {
                state.lessons = state.lessons.filter(l => l._id !== action.payload);
            })
            .addCase(fetchLessonById.fulfilled, (state, action) => {
                state.currentLesson = action.payload?.lesson ?? null;
            })
            .addCase(fetchLessonById.rejected, (state) => {
                state.currentLesson = null;
            })
            .addCase(fetchLessonPlanStats.pending, (state) => {
                state.statsLoading = true;
                state.error = null;
            })
            .addCase(fetchLessonPlanStats.fulfilled, (state, action) => {
                state.statsLoading = false;
                state.stats = action.payload;
            })
            .addCase(fetchLessonPlanStats.rejected, (state, action) => {
                state.statsLoading = false;
                state.error = action.payload;
            })
            .addCase(updateLessonPlanAdminNote.fulfilled, (state, action) => {
                const lesson = action.payload?.lesson;
                if (lesson) {
                    const index = state.lessons.findIndex(l => l._id === lesson._id);
                    if (index !== -1) {
                        state.lessons[index] = { ...state.lessons[index], ...lesson };
                    }
                }
            })
            .addCase(reviewLessonPlan.pending, (state, action) => {
                const lessonId = action.meta.arg.id;
                state.reviewLoadingByLessonId[lessonId] = true;
                state.reviewErrorByLessonId[lessonId] = null;
            })
            .addCase(reviewLessonPlan.fulfilled, (state, action) => {
                const lessonId = action.payload.lessonId;
                state.reviewLoadingByLessonId[lessonId] = false;
                state.reviewErrorByLessonId[lessonId] = null;

                const lesson = action.payload?.data?.lesson;
                if (lesson) {
                    const index = state.lessons.findIndex((l) => l._id === lesson._id);
                    if (index !== -1) {
                        state.lessons[index] = { ...state.lessons[index], ...lesson };
                    } else {
                        state.lessons.unshift(lesson);
                    }
                    if (state.currentLesson?._id === lesson._id) {
                        state.currentLesson = { ...state.currentLesson, ...lesson };
                    }
                }
            })
            .addCase(reviewLessonPlan.rejected, (state, action) => {
                const lessonId = action.payload?.lessonId || action.meta.arg.id;
                state.reviewLoadingByLessonId[lessonId] = false;
                state.reviewErrorByLessonId[lessonId] = action.payload?.message || 'Failed to review lesson plan';
            })
            .addCase(triggerLessonEvaluation.pending, (state, action) => {
                const lessonId = action.meta.arg.id;
                state.evaluationLoadingByLessonId[lessonId] = true;
                state.evaluationErrorByLessonId[lessonId] = null;
            })
            .addCase(triggerLessonEvaluation.fulfilled, (state, action) => {
                const lessonId = action.payload.lessonId;
                state.evaluationLoadingByLessonId[lessonId] = false;
                state.evaluationErrorByLessonId[lessonId] = null;

                const lesson = action.payload?.data?.lesson;
                const evaluationMeta = action.payload?.data || null;
                if (evaluationMeta) {
                    state.evaluationMetaByLessonId[lessonId] = evaluationMeta;
                }

                if (lesson) {
                    const index = state.lessons.findIndex((l) => l._id === lesson._id);
                    if (index !== -1) {
                        state.lessons[index] = { ...state.lessons[index], ...lesson };
                    } else {
                        state.lessons.unshift(lesson);
                    }
                    if (state.currentLesson?._id === lesson._id) {
                        state.currentLesson = { ...state.currentLesson, ...lesson };
                    }
                }
            })
            .addCase(triggerLessonEvaluation.rejected, (state, action) => {
                const lessonId = action.payload?.lessonId || action.meta.arg.id;
                state.evaluationLoadingByLessonId[lessonId] = false;
                state.evaluationErrorByLessonId[lessonId] = action.payload?.message || 'Failed to evaluate lesson plan';
            })
            .addCase(fetchLessonEvaluationHistory.pending, (state, action) => {
                const lessonId = action.meta.arg.id;
                state.evaluationHistoryLoadingByLessonId[lessonId] = true;
                state.evaluationErrorByLessonId[lessonId] = null;
            })
            .addCase(fetchLessonEvaluationHistory.fulfilled, (state, action) => {
                const lessonId = action.payload.lessonId;
                state.evaluationHistoryLoadingByLessonId[lessonId] = false;
                state.evaluationErrorByLessonId[lessonId] = null;
                state.evaluationHistoryByLessonId[lessonId] = action.payload?.data || null;
            })
            .addCase(fetchLessonEvaluationHistory.rejected, (state, action) => {
                const lessonId = action.payload?.lessonId || action.meta.arg.id;
                state.evaluationHistoryLoadingByLessonId[lessonId] = false;
                state.evaluationErrorByLessonId[lessonId] = action.payload?.message || 'Failed to load evaluation history';
            });
    }
});

export const { clearError, setCurrentLesson, clearCurrentLesson } = lessonSlice.actions;

// Selectors
export const selectLessons = (state) => state.lessons.lessons;
export const selectLessonsLoading = (state) => state.lessons.loading;
export const selectCurrentLesson = (state) => state.lessons.currentLesson;
export const selectLessonPlanStats = (state) => state.lessons.stats;
export const selectLessonPlanStatsLoading = (state) => state.lessons.statsLoading;
export const selectEvaluationLoadingByLessonId = (state) => state.lessons.evaluationLoadingByLessonId;
export const selectEvaluationHistoryLoadingByLessonId = (state) => state.lessons.evaluationHistoryLoadingByLessonId;
export const selectEvaluationErrorByLessonId = (state) => state.lessons.evaluationErrorByLessonId;
export const selectEvaluationHistoryByLessonId = (state) => state.lessons.evaluationHistoryByLessonId;
export const selectEvaluationMetaByLessonId = (state) => state.lessons.evaluationMetaByLessonId;
export const selectReviewLoadingByLessonId = (state) => state.lessons.reviewLoadingByLessonId;
export const selectReviewErrorByLessonId = (state) => state.lessons.reviewErrorByLessonId;

export default lessonSlice.reducer;
