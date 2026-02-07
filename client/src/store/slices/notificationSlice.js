import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const sendGradeNotification = createAsyncThunk(
    'notifications/sendGrade',
    async ({ studentId, gradeData }, { rejectWithValue }) => {
        try {
            const response = await api.post('/notifications/grade-update', { studentId, gradeData });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send notification');
        }
    }
);

export const sendDailyReport = createAsyncThunk(
    'notifications/sendDaily',
    async ({ studentId, date }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/notifications/daily-report/${studentId}`, { date });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send report');
        }
    }
);

export const sendMonthlyReport = createAsyncThunk(
    'notifications/sendMonthly',
    async ({ studentId, month, academicYear }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/notifications/monthly-report/${studentId}`, { month, academicYear });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send report');
        }
    }
);

export const sendWeeklyReport = createAsyncThunk(
    'notifications/sendWeekly',
    async ({ studentId, weekStartDate, weekEndDate }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/notifications/weekly-report/${studentId}`, { weekStartDate, weekEndDate });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send weekly report');
        }
    }
);

export const sendDailyClassworkUpdate = createAsyncThunk(
    'notifications/sendDailyClasswork',
    async ({ studentId, date, subject, category }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/notifications/daily-classwork/${studentId}`, { date, subject, category });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send daily classwork update');
        }
    }
);



export const fetchNotificationHistory = createAsyncThunk(
    'notifications/fetchHistory',
    async (params = {}, { rejectWithValue }) => {
        try {
            const response = await api.get('/notifications', { params });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch history');
        }
    }
);

const notificationSlice = createSlice({
    name: 'notifications',
    initialState: {
        notifications: [],
        pagination: null,
        sending: false,
        loading: false,
        error: null,
        lastSent: null
    },
    reducers: {
        clearError: (state) => {
            state.error = null;
        },
        clearLastSent: (state) => {
            state.lastSent = null;
        }
    },
    extraReducers: (builder) => {
        builder
            // Send notifications
            .addCase(sendGradeNotification.pending, (state) => {
                state.sending = true;
                state.error = null;
            })
            .addCase(sendGradeNotification.fulfilled, (state, action) => {
                state.sending = false;
                state.lastSent = action.payload.notification;
            })
            .addCase(sendGradeNotification.rejected, (state, action) => {
                state.sending = false;
                state.error = action.payload;
            })
            .addCase(sendDailyReport.pending, (state) => {
                state.sending = true;
            })
            .addCase(sendDailyReport.fulfilled, (state, action) => {
                state.sending = false;
                state.lastSent = action.payload.notification;
            })
            .addCase(sendDailyReport.rejected, (state, action) => {
                state.sending = false;
                state.error = action.payload;
            })
            .addCase(sendMonthlyReport.pending, (state) => {
                state.sending = true;
            })
            .addCase(sendMonthlyReport.fulfilled, (state, action) => {
                state.sending = false;
                state.lastSent = action.payload.notification;
            })
            .addCase(sendMonthlyReport.rejected, (state, action) => {
                state.sending = false;
                state.error = action.payload;
            })
            .addCase(sendWeeklyReport.pending, (state) => {
                state.sending = true;
            })
            .addCase(sendWeeklyReport.fulfilled, (state, action) => {
                state.sending = false;
                state.lastSent = action.payload.notification;
            })
            .addCase(sendWeeklyReport.rejected, (state, action) => {
                state.sending = false;
                state.error = action.payload;
            })
            .addCase(sendDailyClassworkUpdate.pending, (state) => {
                state.sending = true;
            })
            .addCase(sendDailyClassworkUpdate.fulfilled, (state, action) => {
                state.sending = false;
                state.lastSent = action.payload.notification;
            })
            .addCase(sendDailyClassworkUpdate.rejected, (state, action) => {
                state.sending = false;
                state.error = action.payload;
            })

            // Fetch history
            .addCase(fetchNotificationHistory.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchNotificationHistory.fulfilled, (state, action) => {
                state.loading = false;
                state.notifications = action.payload.notifications;
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchNotificationHistory.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

export const { clearError, clearLastSent } = notificationSlice.actions;

export const selectNotifications = (state) => state.notifications.notifications;
export const selectNotificationSending = (state) => state.notifications.sending;
export const selectNotificationsLoading = (state) => state.notifications.loading;

export default notificationSlice.reducer;
