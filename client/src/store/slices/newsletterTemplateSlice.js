import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import newsletterTemplateService from '../../services/newsletterTemplateService';

/* ── Thunks ────────────────────────────────────────────────────── */

export const fetchTemplates = createAsyncThunk(
  'newsletterTemplates/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await newsletterTemplateService.listTemplates();
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch templates');
    }
  }
);

export const fetchTemplate = createAsyncThunk(
  'newsletterTemplates/fetchOne',
  async (id, { rejectWithValue }) => {
    try {
      const res = await newsletterTemplateService.getTemplate(id);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch template');
    }
  }
);

export const createTemplate = createAsyncThunk(
  'newsletterTemplates/create',
  async (data, { rejectWithValue }) => {
    try {
      const res = await newsletterTemplateService.createTemplate(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create template');
    }
  }
);

export const updateTemplate = createAsyncThunk(
  'newsletterTemplates/update',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await newsletterTemplateService.updateTemplate(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update template');
    }
  }
);

export const deleteTemplate = createAsyncThunk(
  'newsletterTemplates/delete',
  async (id, { rejectWithValue }) => {
    try {
      await newsletterTemplateService.deleteTemplate(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete template');
    }
  }
);

export const duplicateTemplate = createAsyncThunk(
  'newsletterTemplates/duplicate',
  async (id, { rejectWithValue }) => {
    try {
      const res = await newsletterTemplateService.duplicateTemplate(id);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to duplicate template');
    }
  }
);

export const setDefaultTemplate = createAsyncThunk(
  'newsletterTemplates/setDefault',
  async (id, { rejectWithValue }) => {
    try {
      const res = await newsletterTemplateService.setDefault(id);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to set default');
    }
  }
);

/* ── Slice ──────────────────────────────────────────────────────── */

const newsletterTemplateSlice = createSlice({
  name: 'newsletterTemplates',
  initialState: {
    templates: [],
    current: null,
    loading: false,
    saving: false,
    error: null,
  },
  reducers: {
    clearCurrentTemplate(state) {
      state.current = null;
    },
    setCurrentTemplate(state, action) {
      state.current = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      /* fetchAll */
      .addCase(fetchTemplates.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchTemplates.fulfilled, (state, action) => { state.loading = false; state.templates = action.payload; })
      .addCase(fetchTemplates.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      /* fetchOne */
      .addCase(fetchTemplate.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchTemplate.fulfilled, (state, action) => { state.loading = false; state.current = action.payload; })
      .addCase(fetchTemplate.rejected, (state, action) => { state.loading = false; state.error = action.payload; })

      /* create */
      .addCase(createTemplate.pending, (state) => { state.saving = true; state.error = null; })
      .addCase(createTemplate.fulfilled, (state, action) => {
        state.saving = false;
        state.templates.unshift(action.payload);
        state.current = action.payload;
      })
      .addCase(createTemplate.rejected, (state, action) => { state.saving = false; state.error = action.payload; })

      /* update */
      .addCase(updateTemplate.pending, (state) => { state.saving = true; state.error = null; })
      .addCase(updateTemplate.fulfilled, (state, action) => {
        state.saving = false;
        state.current = action.payload;
        const idx = state.templates.findIndex((t) => t._id === action.payload._id);
        if (idx >= 0) state.templates[idx] = action.payload;
      })
      .addCase(updateTemplate.rejected, (state, action) => { state.saving = false; state.error = action.payload; })

      /* delete */
      .addCase(deleteTemplate.fulfilled, (state, action) => {
        state.templates = state.templates.filter((t) => t._id !== action.payload);
        if (state.current?._id === action.payload) state.current = null;
      })

      /* duplicate */
      .addCase(duplicateTemplate.fulfilled, (state, action) => {
        state.templates.unshift(action.payload);
      })

      /* setDefault */
      .addCase(setDefaultTemplate.fulfilled, (state, action) => {
        state.templates.forEach((t) => { t.isDefault = t._id === action.payload._id; });
        if (state.current?._id === action.payload._id) state.current.isDefault = true;
      });
  },
});

export const { clearCurrentTemplate, setCurrentTemplate } = newsletterTemplateSlice.actions;

export const selectTemplates = (state) => state.newsletterTemplates.templates;
export const selectCurrentTemplate = (state) => state.newsletterTemplates.current;
export const selectTemplatesLoading = (state) => state.newsletterTemplates.loading;
export const selectTemplatesSaving = (state) => state.newsletterTemplates.saving;
export const selectTemplatesError = (state) => state.newsletterTemplates.error;

export default newsletterTemplateSlice.reducer;
