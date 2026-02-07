import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import gradeService from '../../services/gradeService';

// Async thunk for fetching dashboard stats
export const fetchDashboardStats = createAsyncThunk(
    'dashboard/fetchStats',
    async (academicYear, { rejectWithValue }) => {
        try {
            const response = await gradeService.getDashboardStats(academicYear);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch dashboard stats');
        }
    }
);

const dashboardSlice = createSlice({
    name: 'dashboard',
    initialState: {
        stats: {
            totalStudents: 0,
            totalClasses: 0,
            totalGrades: 0,
            avgPerformance: '0%',
            changes: {
                students: '+0%',
                classes: '+0%',
                grades: '+0%',
                performance: '+0%'
            }
        },
        loading: false,
        error: null
    },
    reducers: {
        clearDashboardError: (state) => {
            state.error = null;
        },
        resetDashboard: (state) => {
            state.stats = {
                totalStudents: 0,
                totalClasses: 0,
                totalGrades: 0,
                avgPerformance: '0%',
                changes: {
                    students: '+0%',
                    classes: '+0%',
                    grades: '+0%',
                    performance: '+0%'
                }
            };
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Fetch dashboard stats pending
            .addCase(fetchDashboardStats.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            // Fetch dashboard stats fulfilled
            .addCase(fetchDashboardStats.fulfilled, (state, action) => {
                state.loading = false;
                state.stats = action.payload;
                state.error = null;
            })
            // Fetch dashboard stats rejected
            .addCase(fetchDashboardStats.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

export const { clearDashboardError, resetDashboard } = dashboardSlice.actions;

// Selectors
export const selectDashboardStats = (state) => state.dashboard.stats;
export const selectDashboardLoading = (state) => state.dashboard.loading;
export const selectDashboardError = (state) => state.dashboard.error;

export default dashboardSlice.reducer;