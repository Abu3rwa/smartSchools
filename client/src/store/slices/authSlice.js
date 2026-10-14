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
        if (response.data.data.refreshToken) {
          localStorage.setItem('refreshToken', response.data.data.refreshToken);
        }
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
        if (response.data.data.refreshToken) {
          localStorage.setItem('refreshToken', response.data.data.refreshToken);
        }
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
      const params = new URLSearchParams();
      if (schoolSlug) {
        params.set('schoolSlug', schoolSlug);
      }
      if (typeof window !== 'undefined' && window.location?.origin) {
        params.set('frontendOrigin', window.location.origin);
      }
      const query = params.toString();
      const url = query ? `/auth/google/url?${query}` : '/auth/google/url';
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
      localStorage.removeItem('refreshToken');

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
  async (userId, { rejectWithValue, dispatch, getState }) => {
    try {
      const isSchoolAdminPreview = getState().auth.user?.role === 'admin';
      const adminToken = localStorage.getItem('token');
      if (adminToken) {
        localStorage.setItem('adminToken', adminToken);
        localStorage.setItem('adminUser', localStorage.getItem('user') || '');
        localStorage.setItem('adminRefreshToken', localStorage.getItem('refreshToken') || '');
      }

      const response = await api.post('/auth/impersonate', { userId });

      if (response.data.success) {
        const { user, token, readOnlyPreview } = response.data.data;
        
        localStorage.removeItem('behavior_session_id');
        localStorage.setItem('token', token);
        localStorage.removeItem('refreshToken');
        localStorage.setItem('user', JSON.stringify(user));
        if (isSchoolAdminPreview && readOnlyPreview) {
          localStorage.setItem('supportPreview', 'true');
        } else {
          localStorage.removeItem('supportPreview');
        }
        
        dispatch(setCredentials({ user, token }));
        
        return { user, token, readOnlyPreview: Boolean(readOnlyPreview) };
      }
    } catch (error) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      localStorage.removeItem('adminRefreshToken');
      localStorage.removeItem('supportPreview');
      return rejectWithValue(error.response?.data?.message || 'Impersonation failed');
    }
  }
);

export const stopImpersonation = createAsyncThunk(
  'auth/stopImpersonation',
  async (_, { rejectWithValue, dispatch }) => {
    let auditFailure = null;
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        // If there's no admin token, just log out to be safe
        dispatch(logout());
        return;
      }

      if (localStorage.getItem('supportPreview') === 'true') {
        try {
          await api.post('/auth/preview/end');
        } catch (error) {
          auditFailure = error.response?.data?.message || 'The preview ended locally, but its end time could not be recorded.';
        }
      }

      localStorage.removeItem('behavior_session_id');
      localStorage.setItem('token', adminToken);
      const adminRefreshToken = localStorage.getItem('adminRefreshToken');
      if (adminRefreshToken) localStorage.setItem('refreshToken', adminRefreshToken);
      else localStorage.removeItem('refreshToken');
      const adminUser = localStorage.getItem('adminUser');
      if (adminUser) localStorage.setItem('user', adminUser);
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      localStorage.removeItem('adminRefreshToken');
      localStorage.removeItem('supportPreview');

      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (response.data.success) {
        const { user } = response.data.data;
        localStorage.setItem('user', JSON.stringify(user));
        dispatch(setCredentials({ user, token: adminToken }));
        if (auditFailure) return rejectWithValue(auditFailure);
        return { user, token: adminToken };
      }
    } catch {
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

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async ({ currentPassword, newPassword }, { rejectWithValue }) => {
    try {
      const response = await api.put('/auth/password', { currentPassword, newPassword });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to change password');
    }
  }
);

// Switch active role (multi-role users)
export const switchRole = createAsyncThunk(
  'auth/switchRole',
  async (role, { rejectWithValue, dispatch }) => {
    try {
      const response = await api.post('/auth/switch-role', { role });
      if (response.data.success) {
        const { user, token, profile } = response.data.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        dispatch(setCredentials({ user, token }));
        return { user, token, profile };
      }
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to switch role');
    }
  }
);

// Get initial state from localStorage
const getInitialState = () => {
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');
  const user = localStorage.getItem('user');
  const adminToken = localStorage.getItem('adminToken');
  const isReadOnlyPreview = localStorage.getItem('supportPreview') === 'true';
  return {
    user: user ? JSON.parse(user) : null,
    teacherProfile: null,
    token: token || null,
    refreshToken: refreshToken || null,
    isAuthenticated: !!token,
    isImpersonating: !!adminToken,
    isReadOnlyPreview,
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
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      localStorage.removeItem('adminRefreshToken');
      localStorage.removeItem('supportPreview');
      localStorage.removeItem('behavior_session_id');
      state.user = null;
      state.teacherProfile = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.isImpersonating = false;
      state.isReadOnlyPreview = false;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setCredentials: (state, action) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken || state.refreshToken || null;
      state.isAuthenticated = true;
      state.isImpersonating = !!localStorage.getItem('adminToken');
      state.isReadOnlyPreview = localStorage.getItem('supportPreview') === 'true';
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
        state.refreshToken = action.payload.refreshToken || null;
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
        state.refreshToken = action.payload.refreshToken || null;
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
        state.refreshToken = null;
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
      .addCase(impersonateUser.fulfilled, (state) => {
        state.loading = false;
        state.isImpersonating = true;
        state.isReadOnlyPreview = localStorage.getItem('supportPreview') === 'true';
      })
      .addCase(impersonateUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Stop Impersonation
      .addCase(stopImpersonation.pending, (state) => {
        state.loading = true;
      })
      .addCase(stopImpersonation.fulfilled, (state) => {
        state.loading = false;
        state.isImpersonating = false;
        state.isReadOnlyPreview = false;
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
        state.error = action.payload || 'Unable to refresh the current user right now';
      })
      // Update profile
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload.user;
      })
      .addCase(changePassword.fulfilled, (state) => {
        if (state.user) {
          state.user.mustChangePassword = false;
          localStorage.setItem('user', JSON.stringify(state.user));
        }
      })
      // Switch Role
      .addCase(switchRole.pending, (state) => {
        state.roleSwitching = true;
      })
      .addCase(switchRole.fulfilled, (state, action) => {
        state.roleSwitching = false;
        state.user = action.payload.user;
        state.teacherProfile = action.payload.profile || null;
      })
      .addCase(switchRole.rejected, (state, action) => {
        state.roleSwitching = false;
        state.error = action.payload;
      });
  }
});

export const { logout, clearError, setCredentials, } = authSlice.actions;

// Selectors
export const selectAuth = (state) => state.auth;
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectIsImpersonating = (state) => state.auth.isImpersonating;
export const selectIsReadOnlySupportPreview = (state) => state.auth.isReadOnlyPreview;
export const selectIsAdmin = (state) => state.auth.user?.role === 'admin';
export const selectIsTeacher = (state) => state.auth.user?.role === 'teacher';
export const selectCanEditClass = (state) =>
    ['admin', 'department_principal'].includes(state.auth.user?.role || '');
export const selectTeacherProfile = (state) => state.auth.teacherProfile;
export const selectUserRoles = (state) => state.auth.user?.roles || [state.auth.user?.role].filter(Boolean);
export const selectHasMultipleRoles = (state) => (state.auth.user?.roles?.length || 0) > 1;
export const selectRoleSwitching = (state) => !!state.auth.roleSwitching;
export const selectCanImpersonate = (state) => ['super_admin', 'admin'].includes(state.auth.user?.role || '');

export default authSlice.reducer;
