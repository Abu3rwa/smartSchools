import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import schoolCalendarService from '../../services/schoolCalendarService';

const normalizeCategoryParam = (category) => {
    const normalized = String(category || 'ALL').trim().toUpperCase();
    return normalized === 'ALL' ? null : normalized;
};

export const buildCalendarMonthCacheKey = ({ from, to, category = 'ALL', search = '' }) => {
    const normalizedCategory = String(category || 'ALL').trim().toUpperCase() || 'ALL';
    const normalizedSearch = String(search || '').trim().toLowerCase();
    return `${from}|${to}|${normalizedCategory}|${normalizedSearch}`;
};

export const buildCalendarUpcomingCacheKey = ({ from = '', category = 'ALL', limit = 10 }) => {
    const normalizedCategory = String(category || 'ALL').trim().toUpperCase() || 'ALL';
    return `${from}|${normalizedCategory}|${limit}`;
};

export const fetchCalendarMonthEvents = createAsyncThunk(
    'calendar/fetchMonthEvents',
    async (arg, { rejectWithValue }) => {
        try {
            const {
                from,
                to,
                category = 'ALL',
                page = 1,
                limit = 100,
                search = ''
            } = arg;
            const cacheKey = buildCalendarMonthCacheKey({ from, to, category, search });
            const categoryParam = normalizeCategoryParam(category);
            const response = await schoolCalendarService.listEvents({
                from,
                to,
                category: categoryParam || undefined,
                search: search || undefined,
                page,
                limit
            });
            return {
                cacheKey,
                data: response?.data || { items: [], pagination: { page, limit, total: 0, hasMore: false } }
            };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load calendar events');
        }
    },
    {
        condition: (arg, { getState }) => {
            if (arg?.force) return true;
            const state = getState();
            const cacheKey = buildCalendarMonthCacheKey(arg);
            return !state.calendar.monthEventsByKey[cacheKey];
        }
    }
);

export const fetchUpcomingCalendarEvents = createAsyncThunk(
    'calendar/fetchUpcomingEvents',
    async (arg = {}, { rejectWithValue }) => {
        try {
            const {
                from = '',
                category = 'ALL',
                limit = 10
            } = arg;
            const cacheKey = buildCalendarUpcomingCacheKey({ from, category, limit });
            const categoryParam = normalizeCategoryParam(category);
            const response = await schoolCalendarService.getUpcomingEvents({
                from: from || undefined,
                category: categoryParam || undefined,
                limit
            });
            return {
                cacheKey,
                data: response?.data || { items: [] }
            };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load upcoming events');
        }
    },
    {
        condition: (arg, { getState }) => {
            if (arg?.force) return true;
            const state = getState();
            const cacheKey = buildCalendarUpcomingCacheKey(arg || {});
            return !state.calendar.upcomingByKey[cacheKey];
        }
    }
);

export const fetchCalendarNotificationPreferences = createAsyncThunk(
    'calendar/fetchNotificationPreferences',
    async (_, { rejectWithValue }) => {
        try {
            const response = await schoolCalendarService.getNotificationPreferences();
            return response?.data?.preferences;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load notification preferences');
        }
    }
);

export const updateCalendarNotificationPreferences = createAsyncThunk(
    'calendar/updateNotificationPreferences',
    async (payload, { rejectWithValue }) => {
        try {
            const response = await schoolCalendarService.updateNotificationPreferences(payload);
            return response?.data?.preferences;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update notification preferences');
        }
    }
);

export const createCalendarEvent = createAsyncThunk(
    'calendar/createEvent',
    async (payload, { rejectWithValue }) => {
        try {
            const response = await schoolCalendarService.createEvent(payload);
            return response?.data?.event;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create event');
        }
    }
);

export const updateCalendarEvent = createAsyncThunk(
    'calendar/updateEvent',
    async ({ eventId, payload }, { rejectWithValue }) => {
        try {
            const response = await schoolCalendarService.updateEvent(eventId, payload);
            return response?.data?.event;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update event');
        }
    }
);

export const cancelCalendarEvent = createAsyncThunk(
    'calendar/cancelEvent',
    async (eventId, { rejectWithValue }) => {
        try {
            const response = await schoolCalendarService.cancelEvent(eventId);
            return response?.data?.event;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to cancel event');
        }
    }
);

const initialState = {
    monthEventsByKey: {},
    upcomingByKey: {},
    preferences: null,
    loadingMonthByKey: {},
    loadingUpcomingByKey: {},
    preferencesLoading: false,
    mutationLoading: false,
    error: null
};

const clearCalendarCache = (state) => {
    state.monthEventsByKey = {};
    state.upcomingByKey = {};
    state.loadingMonthByKey = {};
    state.loadingUpcomingByKey = {};
};

const calendarSlice = createSlice({
    name: 'calendar',
    initialState,
    reducers: {
        clearCalendarError: (state) => {
            state.error = null;
        },
        clearCalendarCaches: (state) => {
            clearCalendarCache(state);
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchCalendarMonthEvents.pending, (state, action) => {
                const cacheKey = buildCalendarMonthCacheKey(action.meta.arg);
                state.loadingMonthByKey[cacheKey] = true;
                state.error = null;
            })
            .addCase(fetchCalendarMonthEvents.fulfilled, (state, action) => {
                const { cacheKey, data } = action.payload;
                state.loadingMonthByKey[cacheKey] = false;
                state.monthEventsByKey[cacheKey] = {
                    ...data,
                    loadedAt: new Date().toISOString()
                };
            })
            .addCase(fetchCalendarMonthEvents.rejected, (state, action) => {
                const cacheKey = buildCalendarMonthCacheKey(action.meta.arg);
                state.loadingMonthByKey[cacheKey] = false;
                state.error = action.payload || 'Failed to load calendar events';
            })
            .addCase(fetchUpcomingCalendarEvents.pending, (state, action) => {
                const cacheKey = buildCalendarUpcomingCacheKey(action.meta.arg || {});
                state.loadingUpcomingByKey[cacheKey] = true;
                state.error = null;
            })
            .addCase(fetchUpcomingCalendarEvents.fulfilled, (state, action) => {
                const { cacheKey, data } = action.payload;
                state.loadingUpcomingByKey[cacheKey] = false;
                state.upcomingByKey[cacheKey] = {
                    ...data,
                    loadedAt: new Date().toISOString()
                };
            })
            .addCase(fetchUpcomingCalendarEvents.rejected, (state, action) => {
                const cacheKey = buildCalendarUpcomingCacheKey(action.meta.arg || {});
                state.loadingUpcomingByKey[cacheKey] = false;
                state.error = action.payload || 'Failed to load upcoming events';
            })
            .addCase(fetchCalendarNotificationPreferences.pending, (state) => {
                state.preferencesLoading = true;
            })
            .addCase(fetchCalendarNotificationPreferences.fulfilled, (state, action) => {
                state.preferencesLoading = false;
                state.preferences = action.payload || state.preferences;
            })
            .addCase(fetchCalendarNotificationPreferences.rejected, (state, action) => {
                state.preferencesLoading = false;
                state.error = action.payload || 'Failed to load notification preferences';
            })
            .addCase(updateCalendarNotificationPreferences.pending, (state) => {
                state.preferencesLoading = true;
                state.error = null;
            })
            .addCase(updateCalendarNotificationPreferences.fulfilled, (state, action) => {
                state.preferencesLoading = false;
                state.preferences = action.payload || state.preferences;
            })
            .addCase(updateCalendarNotificationPreferences.rejected, (state, action) => {
                state.preferencesLoading = false;
                state.error = action.payload || 'Failed to update notification preferences';
            })
            .addCase(createCalendarEvent.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(createCalendarEvent.fulfilled, (state) => {
                state.mutationLoading = false;
                clearCalendarCache(state);
            })
            .addCase(createCalendarEvent.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload || 'Failed to create event';
            })
            .addCase(updateCalendarEvent.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(updateCalendarEvent.fulfilled, (state) => {
                state.mutationLoading = false;
                clearCalendarCache(state);
            })
            .addCase(updateCalendarEvent.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload || 'Failed to update event';
            })
            .addCase(cancelCalendarEvent.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(cancelCalendarEvent.fulfilled, (state) => {
                state.mutationLoading = false;
                clearCalendarCache(state);
            })
            .addCase(cancelCalendarEvent.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload || 'Failed to cancel event';
            });
    }
});

export const { clearCalendarError, clearCalendarCaches } = calendarSlice.actions;

export const selectCalendarState = (state) => state.calendar;
export const selectCalendarPreferences = (state) => state.calendar.preferences;
export const selectCalendarMutationLoading = (state) => state.calendar.mutationLoading;
export const selectCalendarError = (state) => state.calendar.error;

export const selectMonthEventsEntry = (state, key) => state.calendar.monthEventsByKey[key];
export const selectMonthEventsLoading = (state, key) => state.calendar.loadingMonthByKey[key] === true;
export const selectUpcomingEventsEntry = (state, key) => state.calendar.upcomingByKey[key];
export const selectUpcomingEventsLoading = (state, key) => state.calendar.loadingUpcomingByKey[key] === true;

export default calendarSlice.reducer;
