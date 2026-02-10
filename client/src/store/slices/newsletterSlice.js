import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// Teacher/Admin shared
export const ensureIssue = createAsyncThunk(
  'newsletters/ensureIssue',
  async ({ classId, academicYear, weekStart }, { rejectWithValue }) => {
    try {
      const res = await api.post('/newsletters/issues/ensure', { classId, academicYear, weekStart });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to ensure issue');
    }
  }
);

export const fetchIssue = createAsyncThunk(
  'newsletters/fetchIssue',
  async ({ classId, academicYear, weekStart }, { rejectWithValue }) => {
    try {
      const res = await api.get('/newsletters/issues', { params: { classId, academicYear, weekStart } });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch issue');
    }
  }
);

// Teacher
export const generateSection = createAsyncThunk(
  'newsletters/generateSection',
  async ({ classId, subjectId, academicYear, weekStart, language, selectedLessonPlanIds }, { rejectWithValue }) => {
    try {
      const res = await api.post('/newsletters/sections/generate', {
        classId,
        subjectId,
        academicYear,
        weekStart,
        language,
        selectedLessonPlanIds
      });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to generate section');
    }
  }
);

export const submitSection = createAsyncThunk(
  'newsletters/submitSection',
  async ({ sectionId }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/newsletters/sections/${sectionId}/submit`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to submit section');
    }
  }
);

// Admin
export const fetchAdminIssues = createAsyncThunk(
  'newsletters/fetchAdminIssues',
  async ({ classId, academicYear, weekStart }, { rejectWithValue }) => {
    try {
      const res = await api.get('/newsletters/admin/issues', { params: { classId, academicYear, weekStart } });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch admin issues');
    }
  }
);

export const fetchAdminIssueDetails = createAsyncThunk(
  'newsletters/fetchAdminIssueDetails',
  async ({ issueId }, { rejectWithValue }) => {
    try {
      const res = await api.get(`/newsletters/admin/issues/${issueId}`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch issue details');
    }
  }
);

export const approveAdminSection = createAsyncThunk(
  'newsletters/approveAdminSection',
  async ({ sectionId, notes }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/newsletters/admin/sections/${sectionId}/approve`, { notes });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to approve section');
    }
  }
);

export const rejectAdminSection = createAsyncThunk(
  'newsletters/rejectAdminSection',
  async ({ sectionId, notes }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/newsletters/admin/sections/${sectionId}/reject`, { notes });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to reject section');
    }
  }
);

export const updateAdminExclusions = createAsyncThunk(
  'newsletters/updateAdminExclusions',
  async ({ issueId, excludedSubjectIds }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/newsletters/admin/issues/${issueId}/exclusions`, { excludedSubjectIds });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update exclusions');
    }
  }
);

export const sendAdminIssue = createAsyncThunk(
  'newsletters/sendAdminIssue',
  async ({ issueId }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/newsletters/admin/issues/${issueId}/send`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to send issue');
    }
  }
);

const initialState = {
  teacher: {
    issue: null,
    sections: [],
    generating: false,
    submitting: false,
    loading: false,
    error: null,
    lastGeneratedSection: null,
  },
  admin: {
    issues: [],
    issueDetails: null,
    loading: false,
    error: null,
    sending: false,
  }
};

const newsletterSlice = createSlice({
  name: 'newsletters',
  initialState,
  reducers: {
    clearTeacherError: (state) => {
      state.teacher.error = null;
    },
    clearAdminError: (state) => {
      state.admin.error = null;
    },
    clearAdminIssueDetails: (state) => {
      state.admin.issueDetails = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Teacher issue fetch
      .addCase(fetchIssue.pending, (state) => {
        state.teacher.loading = true;
        state.teacher.error = null;
      })
      .addCase(fetchIssue.fulfilled, (state, action) => {
        state.teacher.loading = false;
        state.teacher.issue = action.payload.issue;
        state.teacher.sections = action.payload.sections || [];
      })
      .addCase(fetchIssue.rejected, (state, action) => {
        state.teacher.loading = false;
        state.teacher.error = action.payload;
      })
      // Teacher generate
      .addCase(generateSection.pending, (state) => {
        state.teacher.generating = true;
        state.teacher.error = null;
      })
      .addCase(generateSection.fulfilled, (state, action) => {
        state.teacher.generating = false;
        state.teacher.issue = action.payload.issue;
        state.teacher.lastGeneratedSection = action.payload.section;
        // Update/insert in section list
        const section = action.payload.section;
        const idx = state.teacher.sections.findIndex((s) => s._id === section?._id);
        if (idx >= 0) state.teacher.sections[idx] = section;
        else state.teacher.sections.unshift(section);
      })
      .addCase(generateSection.rejected, (state, action) => {
        state.teacher.generating = false;
        state.teacher.error = action.payload;
      })
      // Teacher submit
      .addCase(submitSection.pending, (state) => {
        state.teacher.submitting = true;
        state.teacher.error = null;
      })
      .addCase(submitSection.fulfilled, (state, action) => {
        state.teacher.submitting = false;
        const updated = action.payload.section;
        const idx = state.teacher.sections.findIndex((s) => s._id === updated?._id);
        if (idx >= 0) state.teacher.sections[idx] = updated;
      })
      .addCase(submitSection.rejected, (state, action) => {
        state.teacher.submitting = false;
        state.teacher.error = action.payload;
      })
      // Admin list
      .addCase(fetchAdminIssues.pending, (state) => {
        state.admin.loading = true;
        state.admin.error = null;
      })
      .addCase(fetchAdminIssues.fulfilled, (state, action) => {
        state.admin.loading = false;
        state.admin.issues = action.payload.issues || [];
      })
      .addCase(fetchAdminIssues.rejected, (state, action) => {
        state.admin.loading = false;
        state.admin.error = action.payload;
      })
      // Admin details
      .addCase(fetchAdminIssueDetails.pending, (state) => {
        state.admin.loading = true;
        state.admin.error = null;
      })
      .addCase(fetchAdminIssueDetails.fulfilled, (state, action) => {
        state.admin.loading = false;
        state.admin.issueDetails = action.payload;
      })
      .addCase(fetchAdminIssueDetails.rejected, (state, action) => {
        state.admin.loading = false;
        state.admin.error = action.payload;
      })
      // Admin approve/reject/exclusions (refresh issueDetails on success)
      .addCase(approveAdminSection.fulfilled, (state, action) => {
        const updated = action.payload.section;
        const details = state.admin.issueDetails;
        if (!details) return;
        const idx = details.sections?.findIndex((s) => s._id === updated?._id);
        if (idx >= 0) details.sections[idx] = updated;
      })
      .addCase(rejectAdminSection.fulfilled, (state, action) => {
        const updated = action.payload.section;
        const details = state.admin.issueDetails;
        if (!details) return;
        const idx = details.sections?.findIndex((s) => s._id === updated?._id);
        if (idx >= 0) details.sections[idx] = updated;
      })
      .addCase(updateAdminExclusions.fulfilled, (state, action) => {
        const updatedIssue = action.payload.issue;
        const details = state.admin.issueDetails;
        if (details?.issue?._id === updatedIssue?._id) {
          details.issue = updatedIssue;
        }
      })
      .addCase(sendAdminIssue.pending, (state) => {
        state.admin.sending = true;
        state.admin.error = null;
      })
      .addCase(sendAdminIssue.fulfilled, (state, action) => {
        state.admin.sending = false;
        state.admin.lastSendResult = action.payload;
      })
      .addCase(sendAdminIssue.rejected, (state, action) => {
        state.admin.sending = false;
        state.admin.error = action.payload;
      });
  }
});

export const {
  clearTeacherError,
  clearAdminError,
  clearAdminIssueDetails
} = newsletterSlice.actions;

export const selectTeacherNewsletter = (state) => state.newsletters.teacher;
export const selectAdminNewsletter = (state) => state.newsletters.admin;

export default newsletterSlice.reducer;

