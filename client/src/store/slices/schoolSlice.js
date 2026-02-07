import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Fetch all active schools (public)
export const fetchSchools = createAsyncThunk(
  'schools/fetchSchools',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/landing/schools');
      return response.data.data.schools;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch schools');
    }
  }
);

// Fetch single school by slug (public)
export const fetchSchoolBySlug = createAsyncThunk(
  'schools/fetchBySlug',
  async (slug, { rejectWithValue }) => {
    try {
      const response = await api.get(`/landing/school/${slug}`);
      return response.data.data.school;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'School not found');
    }
  }
);

// Register a new school (public)
export const registerSchool = createAsyncThunk(
  'schools/register',
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post('/public/register-school', data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Registration failed');
    }
  }
);

const schoolSlice = createSlice({
  name: 'schools',
  initialState: {
    schools: [],
    currentSchool: null,
    loading: false,
    error: null
  },
  reducers: {
    clearSchoolError: (state) => {
      state.error = null;
    },
    clearCurrentSchool: (state) => {
      state.currentSchool = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch schools
      .addCase(fetchSchools.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSchools.fulfilled, (state, action) => {
        state.loading = false;
        state.schools = action.payload;
      })
      .addCase(fetchSchools.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch by slug
      .addCase(fetchSchoolBySlug.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSchoolBySlug.fulfilled, (state, action) => {
        state.loading = false;
        state.currentSchool = action.payload;
      })
      .addCase(fetchSchoolBySlug.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Register school
      .addCase(registerSchool.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerSchool.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(registerSchool.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { clearSchoolError, clearCurrentSchool } = schoolSlice.actions;

export const selectSchools = (state) => state.schools.schools;
export const selectCurrentSchool = (state) => state.schools.currentSchool;
export const selectSchoolLoading = (state) => state.schools.loading;
export const selectSchoolError = (state) => state.schools.error;

export default schoolSlice.reducer;
