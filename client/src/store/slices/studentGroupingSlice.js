import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Thunks ─────────────────────────────────────────────────────────

export const fetchStudentGroups = createAsyncThunk(
    'studentGrouping/fetchStudentGroups',
    async ({ classId, standardId, academicYear }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/student-grouping/${classId}/${standardId}`, {
                params: { academicYear }
            });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch student groups');
        }
    }
);

export const fetchGroupingOverview = createAsyncThunk(
    'studentGrouping/fetchGroupingOverview',
    async ({ classId, academicYear, subjectId }, { rejectWithValue }) => {
        try {
            const response = await api.get(`/student-grouping/${classId}/overview`, {
                params: { academicYear, subjectId }
            });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch grouping overview');
        }
    }
);

export const saveGroupingOverride = createAsyncThunk(
    'studentGrouping/saveGroupingOverride',
    async ({ classId, standardId, studentId, newLevel, reason, academicYear }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/student-grouping/${classId}/${standardId}/override`, {
                studentId,
                overrideLevel: newLevel,
                reason,
                academicYear
            });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to save override');
        }
    }
);

export const refreshGroupActivities = createAsyncThunk(
    'studentGrouping/refreshGroupActivities',
    async ({ classId, standardId, level }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/student-grouping/${classId}/${standardId}/refresh-activities`, {
                level
            });
            return { level, activities: response.data.data.activities };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to refresh activities');
        }
    }
);

// ─── Slice ──────────────────────────────────────────────────────────

const initialState = {
    groups: [],
    notStarted: [],
    overview: [],
    loading: false,
    overviewLoading: false,
    overrideSaving: false,
    activitiesRefreshing: false,
    error: null,
    overviewError: null
};

const studentGroupingSlice = createSlice({
    name: 'studentGrouping',
    initialState,
    reducers: {
        clearGroupingData(state) {
            state.groups = [];
            state.notStarted = [];
            state.error = null;
        },
        clearOverview(state) {
            state.overview = [];
            state.overviewError = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // fetchStudentGroups
            .addCase(fetchStudentGroups.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchStudentGroups.fulfilled, (state, action) => {
                state.loading = false;
                state.groups = action.payload.groups || [];
                state.notStarted = action.payload.notStarted || [];
            })
            .addCase(fetchStudentGroups.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // fetchGroupingOverview
            .addCase(fetchGroupingOverview.pending, (state) => {
                state.overviewLoading = true;
                state.overviewError = null;
            })
            .addCase(fetchGroupingOverview.fulfilled, (state, action) => {
                state.overviewLoading = false;
                state.overview = action.payload.overview || [];
            })
            .addCase(fetchGroupingOverview.rejected, (state, action) => {
                state.overviewLoading = false;
                state.overviewError = action.payload;
            })
            // saveGroupingOverride
            .addCase(saveGroupingOverride.pending, (state) => {
                state.overrideSaving = true;
            })
            .addCase(saveGroupingOverride.fulfilled, (state) => {
                state.overrideSaving = false;
            })
            .addCase(saveGroupingOverride.rejected, (state) => {
                state.overrideSaving = false;
            })
            // refreshGroupActivities
            .addCase(refreshGroupActivities.pending, (state) => {
                state.activitiesRefreshing = true;
            })
            .addCase(refreshGroupActivities.fulfilled, (state, action) => {
                state.activitiesRefreshing = false;
                const { level, activities } = action.payload;
                // Update activities in the matching group(s)
                if (level && activities[level]) {
                    const group = state.groups.find((g) => g.level === level);
                    if (group) group.suggestedActivities = activities[level];
                } else {
                    // All levels refreshed
                    for (const group of state.groups) {
                        if (activities[group.level]) {
                            group.suggestedActivities = activities[group.level];
                        }
                    }
                }
            })
            .addCase(refreshGroupActivities.rejected, (state) => {
                state.activitiesRefreshing = false;
            });
    }
});

export const { clearGroupingData, clearOverview } = studentGroupingSlice.actions;

// ─── Selectors ──────────────────────────────────────────────────────

export const selectGroupingGroups = (state) => state.studentGrouping.groups;
export const selectGroupingNotStarted = (state) => state.studentGrouping.notStarted;
export const selectGroupingOverview = (state) => state.studentGrouping.overview;
export const selectGroupingLoading = (state) => state.studentGrouping.loading;
export const selectOverviewLoading = (state) => state.studentGrouping.overviewLoading;
export const selectOverrideSaving = (state) => state.studentGrouping.overrideSaving;
export const selectActivitiesRefreshing = (state) => state.studentGrouping.activitiesRefreshing;
export const selectGroupingError = (state) => state.studentGrouping.error;

export default studentGroupingSlice.reducer;
