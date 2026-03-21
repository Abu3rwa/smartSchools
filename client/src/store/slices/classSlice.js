import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import classService from '../../services/classService';
import api from '../../config/api';

const normalizeClassesPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.classes)) return payload.classes;
  if (Array.isArray(payload?.data?.classes)) return payload.data.classes;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export const fetchClasses = createAsyncThunk('classes/fetchClasses', async (params = {}) => {
  const response = await classService.getClasses(params);
  return response;
});

export const fetchClass = createAsyncThunk(
  'classes/fetchClass',
  async (classId) => {
    const response = await classService.getClass(classId);
    return response;
  }
);

// Alias for backward compatibility if any
export const fetchSingleClass = fetchClass;

export const createClass = createAsyncThunk('classes/createClass', async (newClass) => {
  const response = await classService.createClass(newClass);
  return response;
});

export const deleteClass = createAsyncThunk(
  'classes/deleteClass',
  async ({ id, deleteMode }) => {
    await classService.deleteClass(id, deleteMode);
    return id;
  }
);

export const updateClass = createAsyncThunk(
  'classes/updateClass',
  async ({ id, data }) => {
    const response = await classService.updateClass(id, data);
    return response;
  }
);

export const addSubjectToClass = createAsyncThunk(
  'classes/addSubjectToClass',
  async ({ classId, subjectId, teacherId }, { rejectWithValue }) => {
    try {
      const response = await classService.addSubjectToClass(classId, subjectId, teacherId);
      return response.data?.class || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to add subject');
    }
  }
);

export const removeSubjectFromClass = createAsyncThunk(
  'classes/removeSubjectFromClass',
  async ({ classId, subjectId }, { rejectWithValue }) => {
    try {
      const response = await classService.removeSubjectFromClass(classId, subjectId);
      return response.data?.class || response.data || response;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to remove subject');
    }
  }
);

export const fetchClassAnalytics = createAsyncThunk(
  'classes/fetchClassAnalytics',
  async ({ classId, academicYear }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/classes/${classId}/analytics`, { params: { academicYear } });
      return response.data?.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch analytics');
    }
  }
);

export const fetchClassInsights = createAsyncThunk(
  'classes/fetchClassInsights',
  async (params, { rejectWithValue }) => {
    try {
      const { classId, ...rest } = params;
      const response = await api.get(`/classes/${classId}/insights`, { params: rest });
      return response.data?.data || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to generate insights');
    }
  }
);

const initialState = {
  classes: [],
  selectedClass: null,
  status: 'idle',
  error: null,
  analytics: null,
  analyticsLoading: false,
  insights: null,
  insightsLoading: false
};

const classesSlice = createSlice({
  name: 'classes',
  initialState,
  reducers: {
    clearClassAnalyticsData: (state) => {
      state.analytics = null;
      state.insights = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchClasses.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchClasses.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.classes = normalizeClassesPayload(action.payload);
      })
      .addCase(fetchClasses.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(fetchClass.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchClass.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const data = action.payload?.data || action.payload;
        const cls = data.class || data;
        state.selectedClass = {
          ...cls,
          students: data.students || cls.students || []
        };
      })
      .addCase(fetchClass.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(createClass.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(createClass.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const newCls = action.payload?.data?.class || action.payload?.class || action.payload;
        if (newCls && newCls._id) {
          state.classes.push(newCls);
        }
      })
      .addCase(createClass.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(deleteClass.fulfilled, (state, action) => {
        state.classes = state.classes.filter(
          (classItem) => classItem._id !== action.payload
        );
      })
      .addCase(updateClass.fulfilled, (state, action) => {
        const updatedCls = action.payload?.data?.class || action.payload?.class || action.payload;
        if (updatedCls && updatedCls._id) {
          const index = state.classes.findIndex(
            (classItem) => classItem._id === updatedCls._id
          );
          if (index !== -1) {
            state.classes[index] = updatedCls;
          }
          if (state.selectedClass && state.selectedClass._id === updatedCls._id) {
            state.selectedClass = {
              ...updatedCls,
              students: updatedCls.students || state.selectedClass.students || []
            };
          }
        }
      })
      .addCase(addSubjectToClass.fulfilled, (state, action) => {
        if (state.selectedClass && state.selectedClass._id === action.payload?._id) {
          state.selectedClass = {
            ...action.payload,
            students: action.payload.students || state.selectedClass.students || []
          };
        }
      })
      .addCase(removeSubjectFromClass.fulfilled, (state, action) => {
        if (state.selectedClass && state.selectedClass._id === action.payload?._id) {
          state.selectedClass = {
            ...action.payload,
            students: action.payload.students || state.selectedClass.students || []
          };
        }
      })
      .addCase(fetchClassAnalytics.pending, (state) => {
        state.analyticsLoading = true;
      })
      .addCase(fetchClassAnalytics.fulfilled, (state, action) => {
        state.analyticsLoading = false;
        state.analytics = action.payload;
      })
      .addCase(fetchClassAnalytics.rejected, (state) => {
        state.analyticsLoading = false;
      })
      .addCase(fetchClassInsights.pending, (state) => {
        state.insightsLoading = true;
      })
      .addCase(fetchClassInsights.fulfilled, (state, action) => {
        state.insightsLoading = false;
        state.insights = action.payload;
      })
      .addCase(fetchClassInsights.rejected, (state) => {
        state.insightsLoading = false;
      });
  },
});

export const { clearClassAnalyticsData } = classesSlice.actions;

export const selectClasses = (state) =>
  Array.isArray(state?.classes?.classes) ? state.classes.classes : [];

export const selectCurrentClass = (state) => state.classes.selectedClass;
export const selectClassStudents = (state) => state.classes.selectedClass?.students || [];
export const selectClassesLoading = (state) => state.classes.status === 'loading';
export const selectClassesError = (state) => state.classes.error;

export const selectClassAnalytics = (state) => state.classes.analytics;
export const selectClassInsights = (state) => state.classes.insights;
export const selectClassAnalyticsLoading = (state) => state.classes.analyticsLoading;
export const selectClassInsightsLoading = (state) => state.classes.insightsLoading;

export default classesSlice.reducer;
