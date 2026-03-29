import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../config/api";

// ─── Thunks ─────────────────────────────────────────────────────────────────

export const uploadMaterials = createAsyncThunk(
  "presentations/uploadMaterials",
  async (files, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await api.post("/presentations/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Upload failed"
      );
    }
  }
);

export const generatePresentation = createAsyncThunk(
  "presentations/generate",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.post("/presentations/generate", payload);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Generation failed"
      );
    }
  }
);

export const fetchPresentations = createAsyncThunk(
  "presentations/fetchAll",
  async (params = {}, { rejectWithValue }) => {
    try {
      const res = await api.get("/presentations", { params });
      return res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to load presentations"
      );
    }
  }
);

export const fetchPresentation = createAsyncThunk(
  "presentations/fetchOne",
  async (id, { rejectWithValue }) => {
    try {
      const res = await api.get(`/presentations/${id}`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to load presentation"
      );
    }
  }
);

export const updatePresentation = createAsyncThunk(
  "presentations/update",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await api.put(`/presentations/${id}`, data);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Update failed"
      );
    }
  }
);

export const updateSlide = createAsyncThunk(
  "presentations/updateSlide",
  async ({ id, slideIndex, data }, { rejectWithValue }) => {
    try {
      const res = await api.put(
        `/presentations/${id}/slides/${slideIndex}`,
        data
      );
      return { slideIndex, slide: res.data.data };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Slide update failed"
      );
    }
  }
);

export const regenerateSlide = createAsyncThunk(
  "presentations/regenerateSlide",
  async ({ id, slideIndex, prompt, keepLayout }, { rejectWithValue }) => {
    try {
      const res = await api.post(
        `/presentations/${id}/slides/${slideIndex}/regenerate`,
        { prompt, keepLayout }
      );
      return { slideIndex, slide: res.data.data.slide };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Regeneration failed"
      );
    }
  }
);

export const reorderSlides = createAsyncThunk(
  "presentations/reorder",
  async ({ id, slideOrder }, { rejectWithValue }) => {
    try {
      const res = await api.put(`/presentations/${id}/reorder`, {
        slideOrder,
      });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Reorder failed"
      );
    }
  }
);

export const deletePresentation = createAsyncThunk(
  "presentations/delete",
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/presentations/${id}`);
      return id;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Delete failed"
      );
    }
  }
);

export const fetchTemplates = createAsyncThunk(
  "presentations/fetchTemplates",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get("/presentations/templates");
      return res.data.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to load templates"
      );
    }
  }
);

// ─── Slice ──────────────────────────────────────────────────────────────────

const presentationSlice = createSlice({
  name: "presentations",
  initialState: {
    list: [],
    pagination: null,
    current: null,
    templates: [],
    uploadedMaterials: [],
    loading: false,
    generating: false,
    regenerating: false,
    uploading: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearCurrent: (state) => {
      state.current = null;
    },
    clearUploadedMaterials: (state) => {
      state.uploadedMaterials = [];
    },
    setActiveSlide: (state, action) => {
      state.activeSlideIndex = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Upload materials
      .addCase(uploadMaterials.pending, (state) => {
        state.uploading = true;
        state.error = null;
      })
      .addCase(uploadMaterials.fulfilled, (state, action) => {
        state.uploading = false;
        state.uploadedMaterials = [
          ...state.uploadedMaterials,
          ...action.payload,
        ];
      })
      .addCase(uploadMaterials.rejected, (state, action) => {
        state.uploading = false;
        state.error = action.payload;
      })

      // Generate
      .addCase(generatePresentation.pending, (state) => {
        state.generating = true;
        state.error = null;
      })
      .addCase(generatePresentation.fulfilled, (state, action) => {
        state.generating = false;
        state.current = action.payload;
        state.uploadedMaterials = [];
      })
      .addCase(generatePresentation.rejected, (state, action) => {
        state.generating = false;
        state.error = action.payload;
      })

      // Fetch list
      .addCase(fetchPresentations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPresentations.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.data;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchPresentations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch single
      .addCase(fetchPresentation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPresentation.fulfilled, (state, action) => {
        state.loading = false;
        state.current = action.payload;
      })
      .addCase(fetchPresentation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update meta
      .addCase(updatePresentation.fulfilled, (state, action) => {
        state.current = action.payload;
        const idx = state.list.findIndex(
          (p) => p._id === action.payload._id
        );
        if (idx !== -1) state.list[idx] = action.payload;
      })

      // Update slide
      .addCase(updateSlide.pending, (state) => {
        state.error = null;
      })
      .addCase(updateSlide.fulfilled, (state, action) => {
        if (state.current) {
          state.current.slides[action.payload.slideIndex] =
            action.payload.slide;
        }
      })

      // Regenerate slide
      .addCase(regenerateSlide.pending, (state) => {
        state.regenerating = true;
        state.error = null;
      })
      .addCase(regenerateSlide.fulfilled, (state, action) => {
        state.regenerating = false;
        if (state.current) {
          state.current.slides[action.payload.slideIndex] =
            action.payload.slide;
        }
      })
      .addCase(regenerateSlide.rejected, (state, action) => {
        state.regenerating = false;
        state.error = action.payload;
      })

      // Reorder
      .addCase(reorderSlides.fulfilled, (state, action) => {
        state.current = action.payload;
      })

      // Delete
      .addCase(deletePresentation.fulfilled, (state, action) => {
        state.list = state.list.filter((p) => p._id !== action.payload);
        if (state.current?._id === action.payload) state.current = null;
      })

      // Templates
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.templates = action.payload;
      });
  },
});

export const {
  clearError,
  clearCurrent,
  clearUploadedMaterials,
  setActiveSlide,
} = presentationSlice.actions;
export default presentationSlice.reducer;
