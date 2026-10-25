import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import readingService from '../../services/readingService.js';

// Teacher: upload text
export const uploadText = createAsyncThunk(
  'reading/uploadText',
  async (body, { rejectWithValue }) => {
    try {
      const res = await readingService.uploadText(body);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Upload failed');
    }
  }
);

// Teacher: list texts
export const fetchTexts = createAsyncThunk(
  'reading/fetchTexts',
  async (params, { rejectWithValue }) => {
    try {
      const res = await readingService.getTexts(params);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch texts');
    }
  }
);

// Teacher: get single text
export const fetchTextById = createAsyncThunk(
  'reading/fetchTextById',
  async (textId, { rejectWithValue }) => {
    try {
      const res = await readingService.getTextById(textId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch text');
    }
  }
);

// Teacher: create assignment
export const createAssignment = createAsyncThunk(
  'reading/createAssignment',
  async (body, { rejectWithValue }) => {
    try {
      const res = await readingService.createAssignment(body);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create assignment');
    }
  }
);

// Teacher: list assignments
export const fetchTeacherAssignments = createAsyncThunk(
  'reading/fetchTeacherAssignments',
  async (params, { rejectWithValue }) => {
    try {
      const res = await readingService.getTeacherAssignments(params);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch assignments');
    }
  }
);

// Teacher: per-student results for one assignment
export const fetchAssignmentResults = createAsyncThunk(
  'reading/fetchAssignmentResults',
  async (assignmentId, { rejectWithValue }) => {
    try {
      const res = await readingService.getAssignmentResults(assignmentId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load reading results');
    }
  }
);

// Teacher: remove an assignment for its students
export const removeAssignment = createAsyncThunk(
  'reading/removeAssignment',
  async (assignmentId, { rejectWithValue }) => {
    try {
      const res = await readingService.removeAssignment(assignmentId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to remove assignment');
    }
  }
);

// Student: my assignments
export const fetchMyAssignments = createAsyncThunk(
  'reading/fetchMyAssignments',
  async (_, { rejectWithValue }) => {
    try {
      const res = await readingService.getMyAssignments();
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch assignments');
    }
  }
);

// Get simplified content (student or teacher for student)
export const fetchSimplified = createAsyncThunk(
  'reading/fetchSimplified',
  async ({ textId, assignmentId }, { rejectWithValue }) => {
    try {
      const res = await readingService.getSimplified(textId, assignmentId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load text');
    }
  }
);

// Student: update progress
export const updateProgress = createAsyncThunk(
  'reading/updateProgress',
  async (body, { rejectWithValue }) => {
    try {
      const res = await readingService.updateProgress(body);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update progress');
    }
  }
);

const readingSlice = createSlice({
  name: 'reading',
  initialState: {
    texts: [],
    currentText: null,
    assignments: [],
    myAssignments: [],
    simplifiedContent: null,
    assignmentResults: null,
    loading: false,
    resultsLoading: false,
    uploading: false,
    error: null,
  },
  reducers: {
    clearSimplifiedContent: (state) => {
      state.simplifiedContent = null;
    },
    clearCurrentText: (state) => {
      state.currentText = null;
    },
    clearAssignmentResults: (state) => {
      state.assignmentResults = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadText.pending, (state) => {
        state.uploading = true;
        state.error = null;
      })
      .addCase(uploadText.fulfilled, (state, { payload }) => {
        state.uploading = false;
        state.texts = [payload, ...state.texts];
      })
      .addCase(uploadText.rejected, (state, { payload }) => {
        state.uploading = false;
        state.error = payload;
      })
      .addCase(fetchTexts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTexts.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.texts = payload || [];
      })
      .addCase(fetchTexts.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload;
      })
      .addCase(fetchTextById.fulfilled, (state, { payload }) => {
        state.currentText = payload;
      })
      .addCase(createAssignment.fulfilled, (state, { payload }) => {
        state.assignments = [payload, ...state.assignments];
      })
      .addCase(fetchTeacherAssignments.fulfilled, (state, { payload }) => {
        state.assignments = payload || [];
      })
      .addCase(removeAssignment.fulfilled, (state, { payload }) => {
        const target = state.assignments.find(
          (assignment) => String(assignment._id) === String(payload?._id)
        );
        if (target) target.isActive = false;
        const open = state.assignmentResults?.assignment;
        if (open && String(open._id) === String(payload?._id)) open.isActive = false;
      })
      .addCase(removeAssignment.rejected, (state, { payload }) => {
        state.error = payload;
      })
      .addCase(fetchAssignmentResults.pending, (state) => {
        state.resultsLoading = true;
        state.error = null;
      })
      .addCase(fetchAssignmentResults.fulfilled, (state, { payload }) => {
        state.resultsLoading = false;
        state.assignmentResults = payload;
      })
      .addCase(fetchAssignmentResults.rejected, (state, { payload }) => {
        state.resultsLoading = false;
        state.assignmentResults = null;
        state.error = payload;
      })
      .addCase(fetchMyAssignments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyAssignments.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.myAssignments = payload || [];
      })
      .addCase(fetchMyAssignments.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload;
      })
      .addCase(fetchSimplified.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSimplified.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.simplifiedContent = payload;
      })
      .addCase(fetchSimplified.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload;
      });
  },
});

export const { clearSimplifiedContent, clearCurrentText, clearAssignmentResults, clearError } = readingSlice.actions;
export const selectReadingTexts = (state) => state.reading.texts;
export const selectCurrentReadingText = (state) => state.reading.currentText;
export const selectReadingAssignments = (state) => state.reading.assignments;
export const selectReadingAssignmentResults = (state) => state.reading.assignmentResults;
export const selectReadingResultsLoading = (state) => state.reading.resultsLoading;
export const selectMyReadingAssignments = (state) => state.reading.myAssignments;
export const selectSimplifiedContent = (state) => state.reading.simplifiedContent;
export const selectReadingLoading = (state) => state.reading.loading;
export const selectReadingUploading = (state) => state.reading.uploading;
export const selectReadingError = (state) => state.reading.error;

export default readingSlice.reducer;
