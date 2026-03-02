import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api from '../../config/api';
import { logout } from './authSlice';

export const fetchSchoolFeatures = createAsyncThunk(
    'schoolFeatures/fetchSchoolFeatures',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/schools/me/features');
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch school features');
        }
    }
);

const initialState = {
    plan: null,
    planName: null,
    features: {},
    featureMetadata: {},
    limits: null,
    usage: null,
    loading: false,
    error: null
};

const schoolFeaturesSlice = createSlice({
    name: 'schoolFeatures',
    initialState,
    reducers: {
        clearSchoolFeaturesError: (state) => {
            state.error = null;
        },
        resetSchoolFeatures: () => initialState
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSchoolFeatures.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSchoolFeatures.fulfilled, (state, action) => {
                state.loading = false;
                state.plan = action.payload.plan;
                state.planName = action.payload.planName;
                state.features = action.payload.features || {};
                state.featureMetadata = action.payload.featureMetadata || {};
                state.limits = action.payload.limits || null;
                state.usage = action.payload.usage || null;
            })
            .addCase(fetchSchoolFeatures.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || 'Failed to fetch school features';
            })
            .addCase(logout, () => initialState);
    }
});

export const { clearSchoolFeaturesError, resetSchoolFeatures } = schoolFeaturesSlice.actions;

export const selectSchoolFeaturesState = (state) => state.schoolFeatures;
export const selectPlan = (state) => state.schoolFeatures.plan;
export const selectPlanName = (state) => state.schoolFeatures.planName;
export const selectSchoolFeatures = (state) => state.schoolFeatures.features || {};
export const selectFeatureMetadataMap = (state) => state.schoolFeatures.featureMetadata || {};
export const selectFeatureMetadata = (state, featureKey) =>
    state.schoolFeatures.featureMetadata?.[featureKey] || null;
export const selectSchoolFeatureLimits = (state) => state.schoolFeatures.limits;
export const selectSchoolFeatureUsage = (state) => state.schoolFeatures.usage;
export const selectSchoolFeaturesLoading = (state) => state.schoolFeatures.loading;
export const selectSchoolFeaturesError = (state) => state.schoolFeatures.error;
export const selectHasFeature = (state, featureKey) => Boolean(state.schoolFeatures.features?.[featureKey]);

const LIMIT_TO_USAGE_KEY = {
    maxStudents: 'currentStudents',
    maxTeachers: 'currentTeachers',
    maxClasses: 'currentClasses',
    maxStorage: 'currentStorage'
};

export const selectUsagePercentage = (state, limitKey) => {
    const usageKey = LIMIT_TO_USAGE_KEY[limitKey];
    if (!usageKey) return null;

    const limit = state.schoolFeatures.limits?.[limitKey];
    const usage = state.schoolFeatures.usage?.[usageKey];

    if (typeof limit !== 'number' || typeof usage !== 'number') return null;
    if (limit === -1) return 0;
    if (limit === 0) return 0;

    return Math.round((usage / limit) * 100);
};

export default schoolFeaturesSlice.reducer;
