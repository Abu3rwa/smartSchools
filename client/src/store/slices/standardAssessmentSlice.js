import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as assessmentApi from '../../api/standardAssessmentApi';

const rejectApiError = (error, rejectWithValue) =>
  rejectWithValue(error.response?.data?.message || error.message);

export const fetchPool = createAsyncThunk(
  'standardAssessment/fetchPool',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchPool(params);
    } catch (error) {
      return rejectApiError(error, rejectWithValue);
    }
  }
);

export const createAssessmentFromPool = createAsyncThunk(
  'standardAssessment/createFromPool',
  async (data, { rejectWithValue }) => {
    try {
      return await assessmentApi.createAssessmentFromPool(data);
    } catch (error) {
      return rejectApiError(error, rejectWithValue);
    }
  }
);

export const fetchSettings = createAsyncThunk(
  'standardAssessment/fetchSettings',
  async (section, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchSettings(section);
    } catch (error) {
      return rejectApiError(error, rejectWithValue);
    }
  }
);

export const updateSettings = createAsyncThunk(
  'standardAssessment/updateSettings',
  async ({ section, updates }, { rejectWithValue }) => {
    try {
      return await assessmentApi.updateSettings(section, updates);
    } catch (error) {
      return rejectApiError(error, rejectWithValue);
    }
  }
);

const initialState = {
  pool: { questions: [], pagination: null, loading: false, error: null },
  settings: { data: null, loading: false, error: null },
};

const standardAssessmentSlice = createSlice({
  name: 'standardAssessment',
  initialState,
  reducers: {
    clearPoolError(state) {
      state.pool.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPool.pending, (state) => {
        state.pool.loading = true;
        state.pool.error = null;
      })
      .addCase(fetchPool.fulfilled, (state, action) => {
        state.pool.loading = false;
        state.pool.questions = action.payload.questions || [];
        state.pool.pagination = action.payload.pagination || null;
      })
      .addCase(fetchPool.rejected, (state, action) => {
        state.pool.loading = false;
        state.pool.error = action.payload;
      })
      .addCase(createAssessmentFromPool.pending, (state) => {
        state.pool.loading = true;
        state.pool.error = null;
      })
      .addCase(createAssessmentFromPool.fulfilled, (state) => {
        state.pool.loading = false;
      })
      .addCase(createAssessmentFromPool.rejected, (state, action) => {
        state.pool.loading = false;
        state.pool.error = action.payload;
      })
      .addCase(fetchSettings.pending, (state) => {
        state.settings.loading = true;
        state.settings.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.settings.loading = false;
        state.settings.data = action.payload;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.settings.loading = false;
        state.settings.error = action.payload;
      })
      .addCase(updateSettings.pending, (state) => {
        state.settings.loading = true;
        state.settings.error = null;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.settings.loading = false;
        state.settings.data = action.payload;
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.settings.loading = false;
        state.settings.error = action.payload;
      });
  },
});

export const { clearPoolError } = standardAssessmentSlice.actions;
export default standardAssessmentSlice.reducer;
