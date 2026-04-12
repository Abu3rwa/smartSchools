import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as assessmentApi from '../../api/standardAssessmentApi';

// ── Thunks: Feature 1 - Pool Library ──

export const fetchPool = createAsyncThunk(
  'standardAssessment/fetchPool',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchPool(params);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const createAssessmentFromPool = createAsyncThunk(
  'standardAssessment/createFromPool',
  async (data, { rejectWithValue }) => {
    try {
      return await assessmentApi.createAssessmentFromPool(data);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

// ── Thunks: Feature 2 - Progress Table ──

export const fetchProgressTable = createAsyncThunk(
  'standardAssessment/fetchProgressTable',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchProgressTable(params);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const sendProgressTable = createAsyncThunk(
  'standardAssessment/sendProgressTable',
  async (data, { rejectWithValue }) => {
    try {
      return await assessmentApi.sendProgressTable(data);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

// ── Thunks: Feature 3 - Narrative Reports ──

export const generateNarrative = createAsyncThunk(
  'standardAssessment/generateNarrative',
  async (data, { rejectWithValue }) => {
    try {
      return await assessmentApi.generateNarrative(data);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const fetchNarrative = createAsyncThunk(
  'standardAssessment/fetchNarrative',
  async (id, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchNarrative(id);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const updateNarrative = createAsyncThunk(
  'standardAssessment/updateNarrative',
  async ({ id, data, updates }, { rejectWithValue }) => {
    try {
      return await assessmentApi.updateNarrative(id, data || updates || {});
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const sendNarrative = createAsyncThunk(
  'standardAssessment/sendNarrative',
  async ({ id, data, ...rest }, { rejectWithValue }) => {
    try {
      return await assessmentApi.sendNarrative(id, data || rest || {});
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const fetchNarratives = createAsyncThunk(
  'standardAssessment/fetchNarratives',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchNarratives(params);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

// ── Thunks: Feature 4 - Live Edit ──

export const fetchEditImpact = createAsyncThunk(
  'standardAssessment/fetchEditImpact',
  async (assignmentId, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchEditImpact(assignmentId);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const patchAssessment = createAsyncThunk(
  'standardAssessment/patchAssessment',
  async ({ assignmentId, id, data, updates }, { rejectWithValue }) => {
    try {
      const targetId = assignmentId || id;
      return await assessmentApi.patchAssessment(targetId, data || updates || {});
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const createRevision = createAsyncThunk(
  'standardAssessment/createRevision',
  async ({ assignmentId, id, data }, { rejectWithValue }) => {
    try {
      const targetId = assignmentId || id;
      return await assessmentApi.createRevision(targetId, data);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const publishRevision = createAsyncThunk(
  'standardAssessment/publishRevision',
  async ({ assignmentId, id, versionNumber, version }, { rejectWithValue }) => {
    try {
      const targetId = assignmentId || id;
      const targetVersion = versionNumber || version;
      return await assessmentApi.publishRevision(targetId, targetVersion);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const fetchRevisions = createAsyncThunk(
  'standardAssessment/fetchRevisions',
  async (assignmentId, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchRevisions(assignmentId);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

// ── Thunks: Settings & Audit ──

export const fetchAuditLogs = createAsyncThunk(
  'standardAssessment/fetchAuditLogs',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchAuditLogs(params);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const fetchSettings = createAsyncThunk(
  'standardAssessment/fetchSettings',
  async (section, { rejectWithValue }) => {
    try {
      return await assessmentApi.fetchSettings(section);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const updateSettings = createAsyncThunk(
  'standardAssessment/updateSettings',
  async ({ section, updates }, { rejectWithValue }) => {
    try {
      return await assessmentApi.updateSettings(section, updates);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const exportAuditLogs = createAsyncThunk(
  'standardAssessment/exportAuditLogs',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await assessmentApi.exportAuditLogs(params);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

// ── Slice ──

const initialState = {
  // Pool
  pool: { questions: [], pagination: null, loading: false, error: null },
  // Progress
  progressTable: { rows: [], loading: false, error: null },
  sendResult: { loading: false, error: null, data: null, success: false },
  // Narrative
  narratives: { items: [], list: [], pagination: null, loading: false, error: null },
  currentNarrative: { data: null, loading: false, error: null },
  narrativeGeneration: { loading: false, error: null, data: null },
  // Live Edit
  editImpact: { data: null, loading: false, error: null },
  revisions: { items: [], list: [], loading: false, error: null },
  // Audit
  auditLogs: { items: [], list: [], pagination: null, loading: false, error: null },
  settings: { data: null, loading: false, error: null },
  exportAudit: { loading: false, error: null },
};

const standardAssessmentSlice = createSlice({
  name: 'standardAssessment',
  initialState,
  reducers: {
    clearPoolError(state) { state.pool.error = null; },
    clearSendResult(state) { state.sendResult = { loading: false, error: null, data: null, success: false }; },
    clearNarrativeGeneration(state) { state.narrativeGeneration = { loading: false, error: null, data: null }; },
    clearEditImpact(state) { state.editImpact = { data: null, loading: false, error: null }; },
    resetCurrentNarrative(state) { state.currentNarrative = { data: null, loading: false, error: null }; },
  },
  extraReducers: (builder) => {
    // Pool
    builder
      .addCase(fetchPool.pending, (state) => { state.pool.loading = true; state.pool.error = null; })
      .addCase(fetchPool.fulfilled, (state, action) => {
        state.pool.loading = false;
        state.pool.questions = action.payload.questions || [];
        state.pool.pagination = action.payload.pagination || null;
      })
      .addCase(fetchPool.rejected, (state, action) => {
        state.pool.loading = false;
        state.pool.error = action.payload;
      });

    builder
      .addCase(createAssessmentFromPool.pending, (state) => { state.pool.loading = true; state.pool.error = null; })
      .addCase(createAssessmentFromPool.fulfilled, (state) => { state.pool.loading = false; })
      .addCase(createAssessmentFromPool.rejected, (state, action) => {
        state.pool.loading = false;
        state.pool.error = action.payload;
      });

    // Progress Table
    builder
      .addCase(fetchProgressTable.pending, (state) => { state.progressTable.loading = true; state.progressTable.error = null; })
      .addCase(fetchProgressTable.fulfilled, (state, action) => {
        state.progressTable.loading = false;
        state.progressTable.rows = action.payload.rows || [];
      })
      .addCase(fetchProgressTable.rejected, (state, action) => {
        state.progressTable.loading = false;
        state.progressTable.error = action.payload;
      });

    builder
      .addCase(sendProgressTable.pending, (state) => { state.sendResult.loading = true; state.sendResult.error = null; })
      .addCase(sendProgressTable.fulfilled, (state, action) => {
        state.sendResult.loading = false;
        state.sendResult.data = action.payload;
        state.sendResult.success = true;
      })
      .addCase(sendProgressTable.rejected, (state, action) => {
        state.sendResult.loading = false;
        state.sendResult.error = action.payload;
        state.sendResult.success = false;
      });

    // Narratives
    builder
      .addCase(fetchNarratives.pending, (state) => { state.narratives.loading = true; state.narratives.error = null; })
      .addCase(fetchNarratives.fulfilled, (state, action) => {
        state.narratives.loading = false;
        state.narratives.items = action.payload.narratives || [];
        state.narratives.list = action.payload.narratives || [];
        state.narratives.pagination = action.payload.pagination || null;
      })
      .addCase(fetchNarratives.rejected, (state, action) => {
        state.narratives.loading = false;
        state.narratives.error = action.payload;
      });

    builder
      .addCase(generateNarrative.pending, (state) => { state.narrativeGeneration.loading = true; state.narrativeGeneration.error = null; })
      .addCase(generateNarrative.fulfilled, (state, action) => {
        state.narrativeGeneration.loading = false;
        state.narrativeGeneration.data = action.payload;
      })
      .addCase(generateNarrative.rejected, (state, action) => {
        state.narrativeGeneration.loading = false;
        state.narrativeGeneration.error = action.payload;
      });

    builder
      .addCase(fetchNarrative.pending, (state) => { state.currentNarrative.loading = true; state.currentNarrative.error = null; })
      .addCase(fetchNarrative.fulfilled, (state, action) => {
        state.currentNarrative.loading = false;
        state.currentNarrative.data = action.payload;
      })
      .addCase(fetchNarrative.rejected, (state, action) => {
        state.currentNarrative.loading = false;
        state.currentNarrative.error = action.payload;
      });

    // Live Edit
    builder
      .addCase(fetchEditImpact.pending, (state) => { state.editImpact.loading = true; state.editImpact.error = null; })
      .addCase(fetchEditImpact.fulfilled, (state, action) => {
        state.editImpact.loading = false;
        state.editImpact.data = action.payload;
      })
      .addCase(fetchEditImpact.rejected, (state, action) => {
        state.editImpact.loading = false;
        state.editImpact.error = action.payload;
      });

    builder
      .addCase(patchAssessment.pending, (state) => { state.editImpact.loading = true; state.editImpact.error = null; })
      .addCase(patchAssessment.fulfilled, (state) => {
        state.editImpact.loading = false;
      })
      .addCase(patchAssessment.rejected, (state, action) => {
        state.editImpact.loading = false;
        state.editImpact.error = action.payload;
      });

    builder
      .addCase(createRevision.pending, (state) => { state.revisions.loading = true; state.revisions.error = null; })
      .addCase(createRevision.fulfilled, (state) => {
        state.revisions.loading = false;
      })
      .addCase(createRevision.rejected, (state, action) => {
        state.revisions.loading = false;
        state.revisions.error = action.payload;
      });

    builder
      .addCase(publishRevision.pending, (state) => { state.revisions.loading = true; state.revisions.error = null; })
      .addCase(publishRevision.fulfilled, (state) => {
        state.revisions.loading = false;
      })
      .addCase(publishRevision.rejected, (state, action) => {
        state.revisions.loading = false;
        state.revisions.error = action.payload;
      });

    builder
      .addCase(fetchRevisions.pending, (state) => { state.revisions.loading = true; state.revisions.error = null; })
      .addCase(fetchRevisions.fulfilled, (state, action) => {
        state.revisions.loading = false;
        state.revisions.items = action.payload.revisions || [];
        state.revisions.list = action.payload.revisions || [];
      })
      .addCase(fetchRevisions.rejected, (state, action) => {
        state.revisions.loading = false;
        state.revisions.error = action.payload;
      });

    // Audit
    builder
      .addCase(fetchAuditLogs.pending, (state) => { state.auditLogs.loading = true; state.auditLogs.error = null; })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        state.auditLogs.loading = false;
        state.auditLogs.items = action.payload.logs || [];
        state.auditLogs.list = action.payload.logs || [];
        state.auditLogs.pagination = action.payload.pagination || null;
      })
      .addCase(fetchAuditLogs.rejected, (state, action) => {
        state.auditLogs.loading = false;
        state.auditLogs.error = action.payload;
      });

    builder
      .addCase(fetchSettings.pending, (state) => { state.settings.loading = true; state.settings.error = null; })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.settings.loading = false;
        state.settings.data = action.payload;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.settings.loading = false;
        state.settings.error = action.payload;
      });

    builder
      .addCase(updateSettings.pending, (state) => { state.settings.loading = true; state.settings.error = null; })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.settings.loading = false;
        state.settings.data = action.payload;
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.settings.loading = false;
        state.settings.error = action.payload;
      });

    builder
      .addCase(exportAuditLogs.pending, (state) => { state.exportAudit.loading = true; state.exportAudit.error = null; })
      .addCase(exportAuditLogs.fulfilled, (state) => {
        state.exportAudit.loading = false;
      })
      .addCase(exportAuditLogs.rejected, (state, action) => {
        state.exportAudit.loading = false;
        state.exportAudit.error = action.payload;
      });
  },
});

export const {
  clearPoolError,
  clearSendResult,
  clearNarrativeGeneration,
  clearEditImpact,
  resetCurrentNarrative,
} = standardAssessmentSlice.actions;

export default standardAssessmentSlice.reducer;
