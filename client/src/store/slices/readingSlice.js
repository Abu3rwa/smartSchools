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
  async (textId, { rejectWithValue }) => {
    try {
      const res = await readingService.getSimplified(textId);
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

// Get student level
export const fetchStudentLevel = createAsyncThunk(
  'reading/fetchStudentLevel',
  async (studentId, { rejectWithValue }) => {
    try {
      const res = await readingService.getStudentLevel(studentId);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch level');
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
    studentLevel: null,
    loading: false,
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
      })
      .addCase(updateProgress.fulfilled, (state) => {
        state.studentLevel = null;
      })
      .addCase(fetchStudentLevel.fulfilled, (state, { payload }) => {
        state.studentLevel = payload;
      });
  },
});

export const { clearSimplifiedContent, clearCurrentText, clearError } = readingSlice.actions;
export const selectReadingTexts = (state) => state.reading.texts;
export const selectCurrentReadingText = (state) => state.reading.currentText;
export const selectReadingAssignments = (state) => state.reading.assignments;
export const selectMyReadingAssignments = (state) => state.reading.myAssignments;
export const selectSimplifiedContent = (state) => state.reading.simplifiedContent;
export const selectStudentLevel = (state) => state.reading.studentLevel;
export const selectReadingLoading = (state) => state.reading.loading;
export const selectReadingUploading = (state) => state.reading.uploading;
export const selectReadingError = (state) => state.reading.error;

export default readingSlice.reducer;
