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
  async ({ classId, subjectId, academicYear, weekStart, language, selectedLessonPlanIds, customPrompt, regenerateWithFeedback }, { rejectWithValue }) => {
    try {
      const res = await api.post('/newsletters/sections/generate', {
        classId,
        subjectId,
        academicYear,
        weekStart,
        language,
        selectedLessonPlanIds,
        customPrompt,
        regenerateWithFeedback
      });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to generate section');
    }
  }
);

export const updateSectionContent = createAsyncThunk(
  'newsletters/updateSectionContent',
  async ({ sectionId, content, customPrompt }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/newsletters/sections/${sectionId}/content`, { content, customPrompt });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update section content');
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

export const fetchAdminSentIssues = createAsyncThunk(
  'newsletters/fetchAdminSentIssues',
  async ({ classId, academicYear, page, limit }, { rejectWithValue }) => {
    try {
      const res = await api.get('/newsletters/admin/sent', { params: { classId, academicYear, page, limit } });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch sent issues');
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

export const previewAdminIssue = createAsyncThunk(
  'newsletters/previewAdminIssue',
  async ({ issueId }, { rejectWithValue }) => {
    try {
      const res = await api.get(`/newsletters/admin/issues/${issueId}/preview`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to preview issue');
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

export const approveAllSubmittedForIssue = createAsyncThunk(
  'newsletters/approveAllSubmittedForIssue',
  async ({ issueId, notes }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/newsletters/admin/issues/${issueId}/approve-submitted`, { notes });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to bulk approve issue');
    }
  }
);

export const approveAllSubmittedForWeek = createAsyncThunk(
  'newsletters/approveAllSubmittedForWeek',
  async ({ classId, academicYear, weekStart, notes }, { rejectWithValue }) => {
    try {
      const res = await api.post('/newsletters/admin/issues/approve-submitted', { classId, academicYear, weekStart, notes });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to bulk approve week');
    }
  }
);

export const fetchParentNewsletterHistory = createAsyncThunk(
  'newsletters/fetchParentNewsletterHistory',
  async ({ childId, academicYear, page, limit }, { rejectWithValue }) => {
    try {
      const res = await api.get('/newsletters/parent/history', { params: { childId, academicYear, page, limit } });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch parent newsletter history');
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
    sentIssues: [],
    sentPagination: null,
    issueDetails: null,
    summary: null,
    progress: [],
    preview: null,
    loading: false,
    error: null,
    sending: false,
  }
  ,
  parent: {
    historyIssues: [],
    children: [],
    pagination: null,
    loading: false,
    error: null,
  },
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
      state.admin.preview = null;
    },
    clearParentNewsletterError: (state) => {
      state.parent.error = null;
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
      .addCase(updateSectionContent.fulfilled, (state, action) => {
        const updated = action.payload.section;
        if (!updated) return;

        const teacherIdx = state.teacher.sections.findIndex((s) => s._id === updated?._id);
        if (teacherIdx >= 0) {
          state.teacher.sections[teacherIdx] = updated;
        }

        const adminSections = state.admin.issueDetails?.sections || [];
        const adminIdx = adminSections.findIndex((s) => s._id === updated?._id);
        if (adminIdx >= 0) {
          adminSections[adminIdx] = updated;
        }
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
        state.admin.summary = action.payload.summary || null;
        state.admin.progress = action.payload.progress || [];
      })
      .addCase(fetchAdminIssues.rejected, (state, action) => {
        state.admin.loading = false;
        state.admin.error = action.payload;
      })
      // Admin sent list
      .addCase(fetchAdminSentIssues.pending, (state) => {
        state.admin.loading = true;
        state.admin.error = null;
      })
      .addCase(fetchAdminSentIssues.fulfilled, (state, action) => {
        state.admin.loading = false;
        state.admin.sentIssues = action.payload.issues || [];
        state.admin.sentPagination = action.payload.pagination || null;
      })
      .addCase(fetchAdminSentIssues.rejected, (state, action) => {
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
        state.admin.preview = null;
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
      .addCase(previewAdminIssue.fulfilled, (state, action) => {
        state.admin.preview = action.payload;
      })
      .addCase(approveAllSubmittedForIssue.pending, (state) => {
        state.admin.loading = true;
        state.admin.error = null;
      })
      .addCase(approveAllSubmittedForIssue.fulfilled, (state) => {
        state.admin.loading = false;
      })
      .addCase(approveAllSubmittedForIssue.rejected, (state, action) => {
        state.admin.loading = false;
        state.admin.error = action.payload;
      })
      .addCase(approveAllSubmittedForWeek.pending, (state) => {
        state.admin.loading = true;
        state.admin.error = null;
      })
      .addCase(approveAllSubmittedForWeek.fulfilled, (state) => {
        state.admin.loading = false;
      })
      .addCase(approveAllSubmittedForWeek.rejected, (state, action) => {
        state.admin.loading = false;
        state.admin.error = action.payload;
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
      })
      // Parent history
      .addCase(fetchParentNewsletterHistory.pending, (state) => {
        state.parent.loading = true;
        state.parent.error = null;
      })
      .addCase(fetchParentNewsletterHistory.fulfilled, (state, action) => {
        state.parent.loading = false;
        state.parent.historyIssues = action.payload.issues || [];
        state.parent.children = action.payload.children || [];
        state.parent.pagination = action.payload.pagination || null;
      })
      .addCase(fetchParentNewsletterHistory.rejected, (state, action) => {
        state.parent.loading = false;
        state.parent.error = action.payload;
      });
  }
});

export const {
  clearTeacherError,
  clearAdminError,
  clearAdminIssueDetails,
  clearParentNewsletterError
} = newsletterSlice.actions;

export const selectTeacherNewsletter = (state) => state.newsletters.teacher;
export const selectAdminNewsletter = (state) => state.newsletters.admin;
export const selectParentNewsletter = (state) => state.newsletters.parent;

export default newsletterSlice.reducer;
