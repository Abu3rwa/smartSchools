import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api from '../../config/api';
import { logout } from './authSlice';

const RETRY_DELAYS_MS = [1200, 4000];
const FEATURES_CACHE_KEY = 'schoolFeatures.cache.v2';
const AUTO_RETRY_MIN_GAP_MS = 5000;

const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

// Only failures that can heal on their own are retried. Auth and validation
// errors would fail again on the next attempt.
const isRetryable = (error) => {
    if (error?.code === 'ERR_CANCELED' || error?.code === 'ECONNABORTED') return false;
    if (!error?.response) return true;
    return error.response.status >= 500;
};

// A timeout still means the server never answered, so the last known payload
// is a better answer than an error card even though it is not worth retrying.
const canFallBackToCache = (error) => {
    if (!error?.response) return error?.code !== 'ERR_CANCELED';
    return error.response.status >= 500;
};

const getCacheScope = (user) => {
    const school = user?.school;
    const schoolId = typeof school === 'string' ? school : school?._id || school?.id;
    return String(schoolId || user?.schoolId || user?._id || user?.id || '');
};

const readCachedFeatures = (user) => {
    const scope = getCacheScope(user);
    if (!scope) return null;
    try {
        const raw = localStorage.getItem(FEATURES_CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (cached?.scope !== scope) return null;
        const features = cached.data?.features;
        if (!features || typeof features !== 'object') return null;
        return cached.data;
    } catch {
        // Unreadable storage only means there is no fallback.
        return null;
    }
};

const writeCachedFeatures = (user, data) => {
    const scope = getCacheScope(user);
    if (!scope || !data?.features) return;
    try {
        localStorage.setItem(FEATURES_CACHE_KEY, JSON.stringify({
            scope,
            savedAt: Date.now(),
            data
        }));
    } catch {
        // Storage can be full or blocked; the live payload still applies.
    }
};

export const fetchSchoolFeatures = createAsyncThunk(
    'schoolFeatures/fetchSchoolFeatures',
    async (_, { rejectWithValue, getState }) => {
        let lastError = null;
        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
            try {
                const response = await api.get('/schools/me/features', { skipErrorToast: true });
                writeCachedFeatures(getState().auth?.user, response.data.data);
                return response.data.data;
            } catch (error) {
                lastError = error;
                if (!isRetryable(error) || attempt === RETRY_DELAYS_MS.length) break;
                await sleep(RETRY_DELAYS_MS[attempt]);
            }
        }
        if (canFallBackToCache(lastError)) {
            const cached = readCachedFeatures(getState().auth?.user);
            if (cached) return cached;
        }
        return rejectWithValue(lastError?.response?.data?.message || 'Failed to fetch school features');
    }
);

let lastAutoRetryAt = 0;

// Re-asks the server when a gated page mounts without a known plan, e.g. the
// fetch that runs at login dropped. Throttled so several gates on one page
// share a single request.
export const retrySchoolFeaturesIfUnknown = () => (dispatch, getState) => {
    const { fetched, loading } = getState().schoolFeatures;
    if (fetched || loading) return;
    const now = Date.now();
    if (now - lastAutoRetryAt < AUTO_RETRY_MIN_GAP_MS) return;
    lastAutoRetryAt = now;
    dispatch(fetchSchoolFeatures());
};

const initialState = {
    plan: null,
    planName: null,
    subscriptionStatus: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    features: {},
    featureMetadata: {},
    limits: null,
    usage: null,
    loading: false,
    fetched: false,
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
                state.fetched = true;
                state.plan = action.payload.plan;
                state.planName = action.payload.planName;
                state.subscriptionStatus = action.payload.subscriptionStatus || null;
                state.trialEndsAt = action.payload.trialEndsAt || null;
                state.currentPeriodEnd = action.payload.currentPeriodEnd || null;
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
export const selectSubscriptionStatus = (state) => state.schoolFeatures.subscriptionStatus;
export const selectSubscriptionTrialEndsAt = (state) => state.schoolFeatures.trialEndsAt;
export const selectSubscriptionCurrentPeriodEnd = (state) => state.schoolFeatures.currentPeriodEnd;
export const selectSchoolFeatures = (state) => state.schoolFeatures.features || {};
export const selectFeatureMetadataMap = (state) => state.schoolFeatures.featureMetadata || {};
export const selectFeatureMetadata = (state, featureKey) =>
    state.schoolFeatures.featureMetadata?.[featureKey] || null;
export const selectSchoolFeatureLimits = (state) => state.schoolFeatures.limits;
export const selectSchoolFeatureUsage = (state) => state.schoolFeatures.usage;
export const selectSchoolFeaturesLoading = (state) => state.schoolFeatures.loading;
/** True once a features fetch has succeeded, so "unknown" is never read as "not entitled". */
export const selectSchoolFeaturesKnown = (state) => state.schoolFeatures.fetched;
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
