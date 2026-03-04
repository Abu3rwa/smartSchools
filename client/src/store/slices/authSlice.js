import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.success) {
        localStorage.removeItem('behavior_session_id');
        localStorage.setItem('token', response.data.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.data.user));
        return response.data.data;
      }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/register', userData);
      if (response.data.success) {
        localStorage.removeItem('behavior_session_id');
        localStorage.setItem('token', response.data.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.data.user));
        return response.data.data;
      }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Registration failed');
    }
  }
);
// Google Login - redirects to Google OAuth
export const googleLogin = createAsyncThunk(
  'auth/googleLogin',
  async (schoolSlug = null, { rejectWithValue }) => {
    try {
      const url = schoolSlug
        ? `/auth/google/url?schoolSlug=${schoolSlug}`
        : '/auth/google/url';
      const response = await api.get(url);
      if (response.data.success) {
        window.location.href = response.data.authUrl;
        return null;
      }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to start Google login');
    }
  }
);

// Handle Google OAuth callback - called from callback page with token from URL
export const googleLoginCallback = createAsyncThunk(
  'auth/googleLoginCallback',
  async (token, { rejectWithValue }) => {
    try {
      // Save token to localStorage
      localStorage.removeItem('behavior_session_id');
      localStorage.setItem('token', token);

      // Fetch user data with the new token
      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        localStorage.setItem('user', JSON.stringify(response.data.data.user));
        return {
          user: response.data.data.user,
          token: token
        };
      }
    } catch (error) {
      localStorage.removeItem('token');
      return rejectWithValue(error.response?.data?.message || 'Failed to complete Google login');
    }
  }
);

export const impersonateUser = createAsyncThunk(
  'auth/impersonateUser',
  async (userId, { rejectWithValue, dispatch }) => {
    try {
      // 1. Store the current super_admin token
      const adminToken = localStorage.getItem('token');
      if (adminToken) {
        localStorage.setItem('adminToken', adminToken);
      }

      // 2. Call the impersonation endpoint
      const response = await api.post('/auth/impersonate', { userId });

      if (response.data.success) {
        const { user, token } = response.data.data;
        
        // 3. Set the new user and token in localStorage and state
        localStorage.removeItem('behavior_session_id');
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // 4. Dispatch setCredentials to update the store immediately
        dispatch(setCredentials({ user, token }));
        
        return { user, token };
      }
    } catch (error) {
      // If it fails, remove the stored adminToken
      localStorage.removeItem('adminToken');
      return rejectWithValue(error.response?.data?.message || 'Impersonation failed');
    }
  }
);

export const stopImpersonation = createAsyncThunk(
  'auth/stopImpersonation',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        // If there's no admin token, just log out to be safe
        dispatch(logout());
        return;
      }

      // 1. Restore the admin token
      localStorage.removeItem('behavior_session_id');
      localStorage.setItem('token', adminToken);
      localStorage.removeItem('adminToken');

      // 2. Fetch the admin's user data
      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (response.data.success) {
        const { user } = response.data.data;
        localStorage.setItem('user', JSON.stringify(user));
        dispatch(setCredentials({ user, token: adminToken }));
        return { user, token: adminToken };
      }
    } catch (error) {
      // If fetching the user fails, log out completely
      dispatch(logout());
      return rejectWithValue('Could not restore admin session. Please log in again.');
    }
  }
);


export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        return response.data.data;
      }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch user');
    }
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (profileData, { rejectWithValue }) => {
    try {
      const isFormData = typeof FormData !== 'undefined' && profileData instanceof FormData;
      const response = await api.put('/auth/profile', profileData, isFormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : undefined);
      if (response.data.success) {
        localStorage.setItem('user', JSON.stringify(response.data.data.user));
        return response.data.data;
      }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update profile');
    }
  }
);

// Get initial state from localStorage
const getInitialState = () => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  const adminToken = localStorage.getItem('adminToken');
  return {
    user: user ? JSON.parse(user) : null,
    teacherProfile: null,
    token: token || null,
    isAuthenticated: !!token,
    isImpersonating: !!adminToken,
    loading: false,
    error: null
  };
};

const authSlice = createSlice({
  name: 'auth',
  initialState: getInitialState(),
  reducers: {
    logout: (state) => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('behavior_session_id');
      state.user = null;
      state.teacherProfile = null;
      state.token = null;
      state.isAuthenticated = false;
      state.isImpersonating = false;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setCredentials: (state, action) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.isImpersonating = !!localStorage.getItem('adminToken');
    }
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.teacherProfile = action.payload.teacherProfile;
        state.token = action.payload.token;
        state.isAuthenticated = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Register
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Google login (just starts redirect, doesn't set user)
      .addCase(googleLogin.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(googleLogin.fulfilled, (state) => {
        // Page will redirect, so we just keep loading true
        state.loading = true;
      })
      .addCase(googleLogin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Google login callback (handles the token after redirect)
      .addCase(googleLoginCallback.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(googleLoginCallback.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
      })
      .addCase(googleLoginCallback.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Impersonation
      .addCase(impersonateUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(impersonateUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isImpersonating = true;
      })
      .addCase(impersonateUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Stop Impersonation
      .addCase(stopImpersonation.pending, (state) => {
        state.loading = true;
      })
      .addCase(stopImpersonation.fulfilled, (state, action) => {
        state.loading = false;
        state.isImpersonating = false;
      })
      .addCase(stopImpersonation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch current user
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.teacherProfile = action.payload.profile;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading = false;
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('behavior_session_id');
      })
      // Update profile
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload.user;
      });
  }
});

export const { logout, clearError, setCredentials, } = authSlice.actions;

// Selectors
export const selectAuth = (state) => state.auth;
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectIsImpersonating = (state) => state.auth.isImpersonating;
export const selectIsAdmin = (state) => state.auth.user?.role === 'admin';
export const selectIsTeacher = (state) => state.auth.user?.role === 'teacher';
export const selectCanEditClass = (state) =>
    ['admin', 'department_principal'].includes(state.auth.user?.role || '');
export const selectTeacherProfile = (state) => state.auth.teacherProfile;

export default authSlice.reducer;
