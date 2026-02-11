import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

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

const lessonSlice = createSlice({
    name: 'lessons',
    initialState: {
        lessons: [],
        currentLesson: null,
        loading: false,
        error: null
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
            });
    }
});

export const { clearError, setCurrentLesson, clearCurrentLesson } = lessonSlice.actions;

// Selectors
export const selectLessons = (state) => state.lessons.lessons;
export const selectLessonsLoading = (state) => state.lessons.loading;
export const selectCurrentLesson = (state) => state.lessons.currentLesson;

export default lessonSlice.reducer;
