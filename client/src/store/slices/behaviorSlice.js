import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const fetchBehaviorAnalytics = createAsyncThunk(
    'behavior/fetchAnalytics',
    async (params = {}) => {
        const response = await api.get('/behavior/analytics', { params });
        return response.data.data;
    }
);

export const fetchUserBehavior = createAsyncThunk(
    'behavior/fetchUserBehavior',
    async ({ userId, days = 30 }) => {
        const response = await api.get(`/behavior/users/${userId}`, {
            params: { days }
        });
        return response.data.data;
    }
);

export const fetchSecurityEvents = createAsyncThunk(
    'behavior/fetchSecurityEvents',
    async (params = {}) => {
        const response = await api.get('/behavior/security', { params });
        return response.data.data;
    }
);

export const fetchUsageStatistics = createAsyncThunk(
    'behavior/fetchUsageStatistics',
    async (params = {}) => {
        const response = await api.get('/behavior/usage', { params });
        return response.data.data;
    }
);

export const exportBehaviorData = createAsyncThunk(
    'behavior/exportData',
    async (params = {}) => {
        const response = await api.get('/behavior/export', { 
            params,
            responseType: params.format === 'csv' ? 'blob' : 'json'
        });
        return response.data;
    }
);

export const cleanupBehaviorData = createAsyncThunk(
    'behavior/cleanupData',
    async (params = {}) => {
        const response = await api.delete('/behavior/cleanup', { params });
        return response.data;
    }
);

// Initial state
const initialState = {
    // Analytics data
    analytics: null,
    userBehavior: null,
    securityEvents: null,
    usageStatistics: null,
    
    // Loading states
    loading: {
        analytics: false,
        userBehavior: false,
        securityEvents: false,
        usageStatistics: false,
        export: false,
        cleanup: false
    },
    
    // Error states
    error: {
        analytics: null,
        userBehavior: null,
        securityEvents: null,
        usageStatistics: null,
        export: null,
        cleanup: null
    },
    
    // Success states
    success: {
        export: false,
        cleanup: false
    },
    
    // Filters
    filters: {
        period: 'month',
        school: '',
        eventType: ''
    }
};

// Slice
const behaviorSlice = createSlice({
    name: 'behavior',
    initialState,
    reducers: {
        // Filter actions
        setPeriodFilter: (state, action) => {
            state.filters.period = action.payload;
        },
        setSchoolFilter: (state, action) => {
            state.filters.school = action.payload;
        },
        setEventTypeFilter: (state, action) => {
            state.filters.eventType = action.payload;
        },
        clearFilters: (state) => {
            state.filters = initialState.filters;
        },
        
        // Clear actions
        clearError: (state, action) => {
            const { type } = action.payload;
            if (state.error[type]) {
                state.error[type] = null;
            }
        },
        clearSuccess: (state, action) => {
            const { type } = action.payload;
            if (state.success[type]) {
                state.success[type] = false;
            }
        },
        clearAllErrors: (state) => {
            state.error = initialState.error;
        },
        clearAllSuccess: (state) => {
            state.success = initialState.success;
        },
        
        // Reset specific data
        resetUserBehavior: (state) => {
            state.userBehavior = null;
            state.error.userBehavior = null;
        },
        resetSecurityEvents: (state) => {
            state.securityEvents = null;
            state.error.securityEvents = null;
        },
        resetUsageStatistics: (state) => {
            state.usageStatistics = null;
            state.error.usageStatistics = null;
        }
    },
    extraReducers: (builder) => {
        // fetchBehaviorAnalytics
        builder
            .addCase(fetchBehaviorAnalytics.pending, (state) => {
                state.loading.analytics = true;
                state.error.analytics = null;
            })
            .addCase(fetchBehaviorAnalytics.fulfilled, (state, action) => {
                state.loading.analytics = false;
                state.analytics = action.payload;
            })
            .addCase(fetchBehaviorAnalytics.rejected, (state, action) => {
                state.loading.analytics = false;
                state.error.analytics = action.error.message;
            });
        
        // fetchUserBehavior
        builder
            .addCase(fetchUserBehavior.pending, (state) => {
                state.loading.userBehavior = true;
                state.error.userBehavior = null;
            })
            .addCase(fetchUserBehavior.fulfilled, (state, action) => {
                state.loading.userBehavior = false;
                state.userBehavior = action.payload;
            })
            .addCase(fetchUserBehavior.rejected, (state, action) => {
                state.loading.userBehavior = false;
                state.error.userBehavior = action.error.message;
            });
        
        // fetchSecurityEvents
        builder
            .addCase(fetchSecurityEvents.pending, (state) => {
                state.loading.securityEvents = true;
                state.error.securityEvents = null;
            })
            .addCase(fetchSecurityEvents.fulfilled, (state, action) => {
                state.loading.securityEvents = false;
                state.securityEvents = action.payload;
            })
            .addCase(fetchSecurityEvents.rejected, (state, action) => {
                state.loading.securityEvents = false;
                state.error.securityEvents = action.error.message;
            });
        
        // fetchUsageStatistics
        builder
            .addCase(fetchUsageStatistics.pending, (state) => {
                state.loading.usageStatistics = true;
                state.error.usageStatistics = null;
            })
            .addCase(fetchUsageStatistics.fulfilled, (state, action) => {
                state.loading.usageStatistics = false;
                state.usageStatistics = action.payload;
            })
            .addCase(fetchUsageStatistics.rejected, (state, action) => {
                state.loading.usageStatistics = false;
                state.error.usageStatistics = action.error.message;
            });
        
        // exportBehaviorData
        builder
            .addCase(exportBehaviorData.pending, (state) => {
                state.loading.export = true;
                state.error.export = null;
                state.success.export = false;
            })
            .addCase(exportBehaviorData.fulfilled, (state) => {
                state.loading.export = false;
                state.success.export = true;
            })
            .addCase(exportBehaviorData.rejected, (state, action) => {
                state.loading.export = false;
                state.error.export = action.error.message;
                state.success.export = false;
            });
        
        // cleanupBehaviorData
        builder
            .addCase(cleanupBehaviorData.pending, (state) => {
                state.loading.cleanup = true;
                state.error.cleanup = null;
                state.success.cleanup = false;
            })
            .addCase(cleanupBehaviorData.fulfilled, (state, action) => {
                state.loading.cleanup = false;
                state.success.cleanup = true;
            })
            .addCase(cleanupBehaviorData.rejected, (state, action) => {
                state.loading.cleanup = false;
                state.error.cleanup = action.error.message;
                state.success.cleanup = false;
            });
    }
});

// Selectors
export const selectBehaviorAnalytics = (state) => state.behavior.analytics;
export const selectUserBehavior = (state) => state.behavior.userBehavior;
export const selectSecurityEvents = (state) => state.behavior.securityEvents;
export const selectUsageStatistics = (state) => state.behavior.usageStatistics;

export const selectBehaviorLoading = (state) => state.behavior.loading;
export const selectBehaviorError = (state) => state.behavior.error;
export const selectBehaviorSuccess = (state) => state.behavior.success;

export const selectBehaviorFilters = (state) => state.behavior.filters;

export const selectAnalyticsLoading = (state) => state.behavior.loading.analytics;
export const selectUserBehaviorLoading = (state) => state.behavior.loading.userBehavior;
export const selectSecurityEventsLoading = (state) => state.behavior.loading.securityEvents;
export const selectUsageStatisticsLoading = (state) => state.behavior.loading.usageStatistics;

export const selectAnalyticsError = (state) => state.behavior.error.analytics;
export const selectUserBehaviorError = (state) => state.behavior.error.userBehavior;
export const selectSecurityEventsError = (state) => state.behavior.error.securityEvents;
export const selectUsageStatisticsError = (state) => state.behavior.error.usageStatistics;

// Export actions
export const {
    setPeriodFilter,
    setSchoolFilter,
    setEventTypeFilter,
    clearFilters,
    clearError,
    clearSuccess,
    clearAllErrors,
    clearAllSuccess,
    resetUserBehavior,
    resetSecurityEvents,
    resetUsageStatistics
} = behaviorSlice.actions;

// Export reducer
export default behaviorSlice.reducer;
