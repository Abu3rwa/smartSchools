import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import analyticsService from '../../services/analyticsService';

export const fetchStudentAnalytics = createAsyncThunk(
    'analytics/fetchStudent',
    async ({ studentId, params }, { rejectWithValue }) => {
        try {
            const result = await analyticsService.getStudentAnalytics(studentId, params);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load student analytics');
        }
    }
);

export const fetchClassAnalytics = createAsyncThunk(
    'analytics/fetchClass',
    async ({ classId, params }, { rejectWithValue }) => {
        try {
            const result = await analyticsService.getClassAnalytics(classId, params);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load class analytics');
        }
    }
);

export const fetchSchoolAnalytics = createAsyncThunk(
    'analytics/fetchSchool',
    async (params = {}, { rejectWithValue }) => {
        try {
            const result = await analyticsService.getSchoolAnalytics(params);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load school analytics');
        }
    }
);

const analyticsSlice = createSlice({
    name: 'analytics',
    initialState: {
        studentData: null,
        classData: null,
        schoolData: null,
        loading: false,
        error: null
    },
    reducers: {
        clearAnalytics: (state) => {
            state.studentData = null;
            state.classData = null;
            state.schoolData = null;
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchStudentAnalytics.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchStudentAnalytics.fulfilled, (state, action) => { state.loading = false; state.studentData = action.payload; })
            .addCase(fetchStudentAnalytics.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(fetchClassAnalytics.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchClassAnalytics.fulfilled, (state, action) => { state.loading = false; state.classData = action.payload; })
            .addCase(fetchClassAnalytics.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(fetchSchoolAnalytics.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchSchoolAnalytics.fulfilled, (state, action) => { state.loading = false; state.schoolData = action.payload; })
            .addCase(fetchSchoolAnalytics.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
    }
});

export const { clearAnalytics } = analyticsSlice.actions;

export const selectStudentAnalytics = (state) => state.analytics?.studentData || null;
export const selectClassAnalytics = (state) => state.analytics?.classData || null;
export const selectSchoolAnalytics = (state) => state.analytics?.schoolData || null;
export const selectAnalyticsLoading = (state) => state.analytics?.loading || false;
export const selectAnalyticsError = (state) => state.analytics?.error || null;

export default analyticsSlice.reducer;
