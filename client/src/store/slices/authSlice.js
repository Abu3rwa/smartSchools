import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.success) {
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
      const response = await api.put('/auth/profile', profileData);
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
  return {
    user: user ? JSON.parse(user) : null,
    teacherProfile: null,
    token: token || null,
    isAuthenticated: !!token,
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
      state.user = null;
      state.teacherProfile = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setCredentials: (state, action) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
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
export const selectIsAdmin = (state) => state.auth.user?.role === 'admin';
export const selectIsTeacher = (state) => state.auth.user?.role === 'teacher';
export const selectTeacherProfile = (state) => state.auth.teacherProfile;

export default authSlice.reducer;
