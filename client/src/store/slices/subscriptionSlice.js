import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const fetchSubscriptions = createAsyncThunk(
    'subscriptions/fetchSubscriptions',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/subscriptions', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

export const fetchSubscriptionById = createAsyncThunk(
    'subscriptions/fetchSubscriptionById',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/subscriptions/${id}`);
            return response.data.data.subscription;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

export const createSubscription = createAsyncThunk(
    'subscriptions/createSubscription',
    async (subscriptionData, { rejectWithValue }) => {
        try {
            const response = await api.post('/subscriptions', subscriptionData);
            return response.data.data.subscription;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

export const updateSubscription = createAsyncThunk(
    'subscriptions/updateSubscription',
    async ({ id, updateData }, { rejectWithValue }) => {
        try {
            const response = await api.put(`/subscriptions/${id}`, updateData);
            return response.data.data.subscription;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

export const cancelSubscription = createAsyncThunk(
    'subscriptions/cancelSubscription',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.delete(`/subscriptions/${id}`);
            return response.data.data.subscription;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

export const fetchSubscriptionAnalytics = createAsyncThunk(
    'subscriptions/fetchSubscriptionAnalytics',
    async (period = 'month', { rejectWithValue }) => {
        try {
            const response = await api.get(`/subscriptions/analytics?period=${period}`);
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

export const recordPayment = createAsyncThunk(
    'subscriptions/recordPayment',
    async ({ id, amount, notes, receiptNumber }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/subscriptions/${id}/payments`, {
                amount, notes, receiptNumber
            });
            return response.data.data.subscription;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

export const fetchBillingHistory = createAsyncThunk(
    'subscriptions/fetchBillingHistory',
    async (id, { rejectWithValue }) => {
        try {
            const response = await api.get(`/subscriptions/${id}/invoices`);
            return response.data.data.invoices;
        } catch (error) {
            return rejectWithValue(error.response.data.message);
        }
    }
);

// Initial state
const initialState = {
    subscriptions: [],
    currentSubscription: null,
    analytics: null,
    billingHistory: [],
    pagination: {
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
    },
    statistics: {
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        trialSubscriptions: 0,
        totalRevenue: 0,
        starterCount: 0,
        professionalCount: 0,
        enterpriseCount: 0
    },
    loading: false,
    error: null,
    success: null
};

// Slice
const subscriptionSlice = createSlice({
    name: 'subscriptions',
    initialState,
    reducers: {
        clearError: (state) => {
            state.error = null;
        },
        clearSuccess: (state) => {
            state.success = null;
        },
        resetCurrentSubscription: (state) => {
            state.currentSubscription = null;
        },
        setFilters: (state, action) => {
            state.filters = { ...state.filters, ...action.payload };
        }
    },
    extraReducers: (builder) => {
        builder
            // Fetch subscriptions
            .addCase(fetchSubscriptions.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSubscriptions.fulfilled, (state, action) => {
                state.loading = false;
                state.subscriptions = action.payload.subscriptions;
                state.pagination = action.payload.pagination;
                state.statistics = action.payload.statistics;
            })
            .addCase(fetchSubscriptions.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            
            // Fetch subscription by ID
            .addCase(fetchSubscriptionById.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSubscriptionById.fulfilled, (state, action) => {
                state.loading = false;
                state.currentSubscription = action.payload;
            })
            .addCase(fetchSubscriptionById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            
            // Create subscription
            .addCase(createSubscription.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(createSubscription.fulfilled, (state, action) => {
                state.loading = false;
                state.subscriptions.unshift(action.payload);
                state.success = 'Subscription created successfully';
            })
            .addCase(createSubscription.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            
            // Update subscription
            .addCase(updateSubscription.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(updateSubscription.fulfilled, (state, action) => {
                state.loading = false;
                const index = state.subscriptions.findIndex(
                    sub => sub._id === action.payload._id
                );
                if (index !== -1) {
                    state.subscriptions[index] = action.payload;
                }
                if (state.currentSubscription?._id === action.payload._id) {
                    state.currentSubscription = action.payload;
                }
                state.success = 'Subscription updated successfully';
            })
            .addCase(updateSubscription.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            
            // Cancel subscription
            .addCase(cancelSubscription.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(cancelSubscription.fulfilled, (state, action) => {
                state.loading = false;
                const index = state.subscriptions.findIndex(
                    sub => sub._id === action.payload._id
                );
                if (index !== -1) {
                    state.subscriptions[index] = action.payload;
                }
                if (state.currentSubscription?._id === action.payload._id) {
                    state.currentSubscription = action.payload;
                }
                state.success = 'Subscription cancelled successfully';
            })
            .addCase(cancelSubscription.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            
            // Fetch analytics
            .addCase(fetchSubscriptionAnalytics.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSubscriptionAnalytics.fulfilled, (state, action) => {
                state.loading = false;
                state.analytics = action.payload;
            })
            .addCase(fetchSubscriptionAnalytics.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            
            // Record cash payment
            .addCase(recordPayment.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(recordPayment.fulfilled, (state, action) => {
                state.loading = false;
                if (state.currentSubscription?._id === action.payload._id) {
                    state.currentSubscription = action.payload;
                }
                const index = state.subscriptions.findIndex(
                    sub => sub._id === action.payload._id
                );
                if (index !== -1) {
                    state.subscriptions[index] = action.payload;
                }
                state.success = 'Cash payment recorded successfully';
            })
            .addCase(recordPayment.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            
            // Fetch billing history
            .addCase(fetchBillingHistory.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchBillingHistory.fulfilled, (state, action) => {
                state.loading = false;
                state.billingHistory = action.payload;
            })
            .addCase(fetchBillingHistory.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

// Actions
export const {
    clearError,
    clearSuccess,
    resetCurrentSubscription,
    setFilters
} = subscriptionSlice.actions;

// Selectors
export const selectSubscriptions = (state) => state.subscriptions.subscriptions;
export const selectCurrentSubscription = (state) => state.subscriptions.currentSubscription;
export const selectSubscriptionAnalytics = (state) => state.subscriptions.analytics;
export const selectBillingHistory = (state) => state.subscriptions.billingHistory;
export const selectSubscriptionPagination = (state) => state.subscriptions.pagination;
export const selectSubscriptionStatistics = (state) => state.subscriptions.statistics;
export const selectSubscriptionLoading = (state) => state.subscriptions.loading;
export const selectSubscriptionError = (state) => state.subscriptions.error;
export const selectSubscriptionSuccess = (state) => state.subscriptions.success;

// Reducer
export default subscriptionSlice.reducer;
