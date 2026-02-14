import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const fetchClasses = createAsyncThunk(
    'classes/fetchClasses',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/classes', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch classes');
        }
    }
);

export const fetchClass = createAsyncThunk(
    'classes/fetchClass',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/classes/${id}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch class');
        }
    }
);

export const createClass = createAsyncThunk(
    'classes/createClass',
    async (classData, { rejectWithValue }) => {
        try {
            const response = await api.post('/classes', classData);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create class');
        }
    }
);

export const updateClass = createAsyncThunk(
    'classes/updateClass',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/classes/${id}`, data);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update class');
        }
    }
);

export const deleteClass = createAsyncThunk(
    'classes/deleteClass',
    async (id, { rejectWithValue }) => {
        try {
            await api.delete(`/classes/${id}`);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete class');
        }
    }
);

export const addSubjectToClass = createAsyncThunk(
    'classes/addSubject',
    async ({ classId, subjectId, teacherId }, { rejectWithValue, dispatch }) => {
        try {
            const response = await api.post(`/classes/${classId}/subjects`, { subjectId, teacherId });
            // Refresh teachers so teacherSlice stays in sync
            dispatch({ type: 'teachers/needsRefresh' });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to add subject');
        }
    }
);

export const fetchClassAnalytics = createAsyncThunk(
    'classes/fetchClassAnalytics',
    async ({ classId, academicYear, startDate, endDate } = {}, { rejectWithValue }) => {
        try {
            const params = {};
            if (academicYear) params.academicYear = academicYear;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            const response = await api.get(`/classes/${classId}/analytics`, { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch class analytics');
        }
    }
);

export const fetchClassInsights = createAsyncThunk(
    'classes/fetchClassInsights',
    async ({ classId, academicYear, startDate, endDate, includeAnalytics } = {}, { rejectWithValue }) => {
        try {
            const params = {};
            if (academicYear) params.academicYear = academicYear;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            if (includeAnalytics) params.includeAnalytics = 'true';
            const response = await api.get(`/classes/${classId}/insights`, { params });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch AI insights');
        }
    }
);

const classSlice = createSlice({
    name: 'classes',
    initialState: {
        classes: [],
        currentClass: null,
        students: [],
        pagination: null,
        loading: false,
        error: null,
        analytics: null,
        insights: null,
        analyticsLoading: false,
        insightsLoading: false
    },
    reducers: {
        clearCurrentClass: (state) => {
            state.currentClass = null;
            state.students = [];
            state.analytics = null;
            state.insights = null;
        },
        clearError: (state) => {
            state.error = null;
        },
        clearClassAnalyticsData: (state) => {
            state.analytics = null;
            state.insights = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Fetch classes
            .addCase(fetchClasses.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchClasses.fulfilled, (state, action) => {
                state.loading = false;
                state.classes = action.payload.classes;
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchClasses.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Fetch single class
            .addCase(fetchClass.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchClass.fulfilled, (state, action) => {
                state.loading = false;
                state.currentClass = action.payload.class;
                state.students = action.payload.students || [];
            })
            .addCase(fetchClass.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Create class
            .addCase(createClass.fulfilled, (state, action) => {
                state.classes.push(action.payload.class);
            })
            // Update class
            .addCase(updateClass.fulfilled, (state, action) => {
                const index = state.classes.findIndex(c => c._id === action.payload.class._id);
                if (index !== -1) {
                    state.classes[index] = action.payload.class;
                }
                if (state.currentClass?._id === action.payload.class._id) {
                    state.currentClass = action.payload.class;
                }
            })
            // Delete class
            .addCase(deleteClass.fulfilled, (state, action) => {
                state.classes = state.classes.filter(c => c._id !== action.payload);
            })
            // Add subject
            .addCase(addSubjectToClass.fulfilled, (state, action) => {
                state.currentClass = action.payload.class;
            })
            // Class analytics
            .addCase(fetchClassAnalytics.pending, (state) => {
                state.analyticsLoading = true;
            })
            .addCase(fetchClassAnalytics.fulfilled, (state, action) => {
                state.analyticsLoading = false;
                state.analytics = action.payload;
            })
            .addCase(fetchClassAnalytics.rejected, (state) => {
                state.analyticsLoading = false;
            })
            // Class insights
            .addCase(fetchClassInsights.pending, (state) => {
                state.insightsLoading = true;
            })
            .addCase(fetchClassInsights.fulfilled, (state, action) => {
                state.insightsLoading = false;
                const data = action.payload?.data;
                state.insights = data || null;
                if (data?.analytics) state.analytics = data.analytics;
            })
            .addCase(fetchClassInsights.rejected, (state) => {
                state.insightsLoading = false;
            });
    }
});

export const { clearCurrentClass, clearError, clearClassAnalyticsData } = classSlice.actions;

// Selectors
export const selectClasses = (state) => state.classes.classes;
export const selectCurrentClass = (state) => state.classes.currentClass;
export const selectClassStudents = (state) => state.classes.students;
export const selectClassesLoading = (state) => state.classes.loading;
export const selectClassesError = (state) => state.classes.error;
export const selectClassAnalytics = (state) => state.classes.analytics;
export const selectClassInsights = (state) => state.classes.insights;
export const selectClassAnalyticsLoading = (state) => state.classes.analyticsLoading;
export const selectClassInsightsLoading = (state) => state.classes.insightsLoading;

export default classSlice.reducer;
