import { createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Student Login / Account Thunks ───

export const createStudentLogin = createAsyncThunk(
    'students/createStudentLogin',
    async ({ studentId, email }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/create-login`, { email });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create student login');
        }
    }
);

export const resetStudentPassword = createAsyncThunk(
    'students/resetStudentPassword',
    async (studentId, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/reset-password`);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to reset password');
        }
    }
);

export const bulkCreateStudentLogin = createAsyncThunk(
    'students/bulkCreateStudentLogin',
    async (studentIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/students/bulk-create-login', { studentIds });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create logins');
        }
    }
);

export const sendStudentLoginInvite = createAsyncThunk(
    'students/sendStudentLoginInvite',
    async ({ studentId, email }, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/send-login-invite`, { email });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send student invite');
        }
    }
);

export const bulkSendStudentLoginInvites = createAsyncThunk(
    'students/bulkSendStudentLoginInvites',
    async (studentIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/students/bulk-send-login-invites', { studentIds });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send student invites');
        }
    }
);

// ─── Parent Credential Thunks ───

export const sendParentCredentials = createAsyncThunk(
    'students/sendParentCredentials',
    async (studentId, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/send-parent-credentials`);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send parent credentials');
        }
    }
);

export const sendParentLoginInvite = createAsyncThunk(
    'students/sendParentLoginInvite',
    async (studentId, { rejectWithValue }) => {
        try {
            const response = await api.post(`/students/${studentId}/send-parent-login-invite`);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send parent invite');
        }
    }
);

export const bulkSendParentLoginInvites = createAsyncThunk(
    'students/bulkSendParentLoginInvites',
    async (studentIds, { rejectWithValue }) => {
        try {
            const response = await api.post('/students/bulk-send-parent-login-invites', { studentIds });
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to send parent invites');
        }
    }
);
