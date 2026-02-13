import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import revisionService from '../../services/revisionService.js';

export const fetchMyPlans = createAsyncThunk(
  'revision/fetchMyPlans',
  async (status, { rejectWithValue }) => {
    try {
      const res = await revisionService.getMyPlans(status);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch plans');
    }
  }
);

export const fetchTeacherPlans = createAsyncThunk(
  'revision/fetchTeacherPlans',
  async (params, { rejectWithValue }) => {
    try {
      const res = await revisionService.getTeacherPlans(params);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch plans');
    }
  }
);

export const fetchPlan = createAsyncThunk(
  'revision/fetchPlan',
  async (planId, { rejectWithValue }) => {
    try {
      const res = await revisionService.getPlan(planId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch plan');
    }
  }
);

export const generatePlan = createAsyncThunk(
  'revision/generatePlan',
  async (body, { rejectWithValue }) => {
    try {
      const res = await revisionService.generatePlan(body);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || 'Failed to generate plan');
    }
  }
);

export const updatePlanProgress = createAsyncThunk(
  'revision/updateProgress',
  async ({ planId, body }, { rejectWithValue }) => {
    try {
      const res = await revisionService.updateProgress(planId, body);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update progress');
    }
  }
);

export const fetchRecommendations = createAsyncThunk(
  'revision/fetchRecommendations',
  async ({ studentId, conceptId }, { rejectWithValue }) => {
    try {
      const res = await revisionService.getRecommendations(studentId, conceptId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch recommendations');
    }
  }
);

const revisionSlice = createSlice({
  name: 'revision',
  initialState: {
    plans: [],
    currentPlan: null,
    recommendations: [],
    loading: false,
    generating: false,
    error: null,
  },
  reducers: {
    clearCurrentPlan: (state) => {
      state.currentPlan = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyPlans.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyPlans.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.plans = payload || [];
      })
      .addCase(fetchMyPlans.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload;
      })
      .addCase(fetchTeacherPlans.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTeacherPlans.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.plans = payload || [];
      })
      .addCase(fetchTeacherPlans.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload;
      })
      .addCase(fetchPlan.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlan.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.currentPlan = payload;
      })
      .addCase(fetchPlan.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload;
      })
      .addCase(generatePlan.pending, (state) => {
        state.generating = true;
        state.error = null;
      })
      .addCase(generatePlan.fulfilled, (state, { payload }) => {
        state.generating = false;
        state.currentPlan = payload;
      })
      .addCase(generatePlan.rejected, (state, { payload }) => {
        state.generating = false;
        state.error = payload;
      })
      .addCase(updatePlanProgress.fulfilled, (state, { payload }) => {
        state.currentPlan = payload;
      })
      .addCase(fetchRecommendations.fulfilled, (state, { payload }) => {
        state.recommendations = payload || [];
      });
  },
});

export const { clearCurrentPlan, clearError } = revisionSlice.actions;
export const selectRevisionPlans = (state) => state.revision.plans;
export const selectCurrentPlan = (state) => state.revision.currentPlan;
export const selectRevisionLoading = (state) => state.revision.loading;
export const selectRevisionGenerating = (state) => state.revision.generating;
export const selectRevisionError = (state) => state.revision.error;
export const selectRecommendations = (state) => state.revision.recommendations;

export default revisionSlice.reducer;
