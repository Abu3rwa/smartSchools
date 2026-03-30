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
      return res.data?.data ?? res.data;
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
      return res.data?.data ?? res.data;
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
      return res.data?.data ?? res.data;
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
      return res.data?.data ?? res.data;
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
      return res.data?.data ?? res.data;
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
      const payload = res.data?.data ?? res.data;
      return { slideIndex, slide: payload?.slide ?? payload };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Slide update failed"
      );
    }
  }
);

export const patchSlide = createAsyncThunk(
  "presentations/patchSlide",
  async ({ id, slideIndex, operations, version }, { rejectWithValue }) => {
    try {
      const res = await api.patch(
        `/presentations/${id}/slides/${slideIndex}/patch`,
        { operations, version }
      );
      const payload = res.data?.data ?? res.data;
      return {
        slideIndex,
        slide: payload?.slide ?? payload,
        version: payload?.version,
      };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Patch update failed"
      );
    }
  }
);

export const applyLayoutToSlide = createAsyncThunk(
  "presentations/applyLayoutToSlide",
  async ({ id, slideIndex, layout, preserveContent = true }, { rejectWithValue }) => {
    try {
      const res = await api.post(
        `/presentations/${id}/slides/${slideIndex}/apply-layout`,
        { layout, preserveContent }
      );
      const payload = res.data?.data ?? res.data;
      return {
        slideIndex,
        slide: payload?.slide ?? payload,
        version: payload?.version,
      };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Apply layout failed"
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
      const payload = res.data?.data ?? res.data;
      return { slideIndex, slide: payload?.slide ?? payload };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Regeneration failed"
      );
    }
  }
);

export const textAssistSlide = createAsyncThunk(
  "presentations/textAssistSlide",
  async ({ id, slideIndex, action, selectedText, customPrompt }, { rejectWithValue }) => {
    try {
      const res = await api.post(
        `/presentations/${id}/slides/${slideIndex}/text-assist`,
        { action, selectedText, customPrompt }
      );
      const payload = res.data?.data ?? res.data;
      return {
        assistedText: payload?.assistedText || "",
        tokenUsage: payload?.tokenUsage || null,
      };
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Text assist failed"
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
      return res.data?.data ?? res.data;
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
      return res.data?.data ?? res.data;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to load templates"
      );
    }
  }
);

export const fetchComments = createAsyncThunk(
  "presentations/fetchComments",
  async ({ id, slideIndex, resolved }, { rejectWithValue }) => {
    try {
      const params = {};
      if (slideIndex != null) params.slideIndex = slideIndex;
      if (resolved != null) params.resolved = String(Boolean(resolved));
      const res = await api.get(`/presentations/${id}/comments`, { params });
      const payload = res.data?.data ?? res.data;
      return payload?.comments || [];
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to load comments"
      );
    }
  }
);

export const addComment = createAsyncThunk(
  "presentations/addComment",
  async ({ id, message, slideIndex }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/presentations/${id}/comments`, {
        message,
        slideIndex,
      });
      const payload = res.data?.data ?? res.data;
      return payload?.comment || payload;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to add comment"
      );
    }
  }
);

export const resolveComment = createAsyncThunk(
  "presentations/resolveComment",
  async ({ id, commentId, resolved = true }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/presentations/${id}/comments/${commentId}`, {
        resolved,
      });
      const payload = res.data?.data ?? res.data;
      return payload?.comment || payload;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to resolve comment"
      );
    }
  }
);

export const deleteComment = createAsyncThunk(
  "presentations/deleteComment",
  async ({ id, commentId }, { rejectWithValue }) => {
    try {
      await api.delete(`/presentations/${id}/comments/${commentId}`);
      return commentId;
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Failed to delete comment"
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
    patching: false,
    autosaveStatus: "idle",
    textAssisting: false,
    lastTextAssist: null,
    comments: [],
    commentsLoading: false,
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
        const uploaded = Array.isArray(action.payload)
          ? action.payload
          : action.payload?.extractions || [];
        state.uploadedMaterials = [
          ...state.uploadedMaterials,
          ...uploaded,
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
        state.current = action.payload?.presentation || action.payload || null;
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
        const listPayload = action.payload;
        state.list = Array.isArray(listPayload)
          ? listPayload
          : listPayload?.presentations || listPayload?.data || [];
        state.pagination = listPayload?.pagination || null;
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
        state.current = action.payload?.presentation || action.payload || null;
      })
      .addCase(fetchPresentation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update meta
      .addCase(updatePresentation.fulfilled, (state, action) => {
        const updated = action.payload?.presentation || action.payload;
        state.current = updated || null;
        if (!updated || !Array.isArray(state.list)) return;
        const idx = state.list.findIndex(
          (p) => p._id === updated._id
        );
        if (idx !== -1) state.list[idx] = updated;
      })

      // Update slide
      .addCase(updateSlide.pending, (state) => {
        state.error = null;
      })
      .addCase(updateSlide.fulfilled, (state, action) => {
        if (state.current && Array.isArray(state.current.slides)) {
          state.current.slides[action.payload.slideIndex] =
            action.payload.slide;
        }
      })

      // Patch slide
      .addCase(patchSlide.pending, (state) => {
        state.patching = true;
        state.autosaveStatus = "saving";
        state.error = null;
      })
      .addCase(patchSlide.fulfilled, (state, action) => {
        state.patching = false;
        state.autosaveStatus = "saved";
        if (state.current && Array.isArray(state.current.slides)) {
          state.current.slides[action.payload.slideIndex] =
            action.payload.slide;
        }
        if (state.current?.generation && action.payload.version) {
          state.current.generation.version = action.payload.version;
        }
      })
      .addCase(patchSlide.rejected, (state, action) => {
        state.patching = false;
        state.autosaveStatus = "error";
        state.error = action.payload;
      })

      // Apply layout
      .addCase(applyLayoutToSlide.pending, (state) => {
        state.patching = true;
        state.error = null;
      })
      .addCase(applyLayoutToSlide.fulfilled, (state, action) => {
        state.patching = false;
        if (state.current && Array.isArray(state.current.slides)) {
          state.current.slides[action.payload.slideIndex] =
            action.payload.slide;
        }
        if (state.current?.generation && action.payload.version) {
          state.current.generation.version = action.payload.version;
        }
      })
      .addCase(applyLayoutToSlide.rejected, (state, action) => {
        state.patching = false;
        state.error = action.payload;
      })

      // Regenerate slide
      .addCase(regenerateSlide.pending, (state) => {
        state.regenerating = true;
        state.error = null;
      })
      .addCase(regenerateSlide.fulfilled, (state, action) => {
        state.regenerating = false;
        if (state.current && Array.isArray(state.current.slides)) {
          state.current.slides[action.payload.slideIndex] =
            action.payload.slide;
        }
      })
      .addCase(regenerateSlide.rejected, (state, action) => {
        state.regenerating = false;
        state.error = action.payload;
      })

      // Text assist
      .addCase(textAssistSlide.pending, (state) => {
        state.textAssisting = true;
        state.error = null;
      })
      .addCase(textAssistSlide.fulfilled, (state, action) => {
        state.textAssisting = false;
        state.lastTextAssist = action.payload;
      })
      .addCase(textAssistSlide.rejected, (state, action) => {
        state.textAssisting = false;
        state.error = action.payload;
      })

      // Reorder
      .addCase(reorderSlides.fulfilled, (state, action) => {
        if (!state.current) return;
        if (Array.isArray(action.payload?.slides)) {
          state.current.slides = action.payload.slides;
          return;
        }
        if (Array.isArray(action.payload)) {
          state.current.slides = action.payload;
        }
      })

      // Delete
      .addCase(deletePresentation.fulfilled, (state, action) => {
        state.list = Array.isArray(state.list)
          ? state.list.filter((p) => p._id !== action.payload)
          : [];
        if (state.current?._id === action.payload) state.current = null;
      })

      // Templates
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.templates = Array.isArray(action.payload)
          ? action.payload
          : action.payload?.templates || [];
      })

      // Comments
      .addCase(fetchComments.pending, (state) => {
        state.commentsLoading = true;
        state.error = null;
      })
      .addCase(fetchComments.fulfilled, (state, action) => {
        state.commentsLoading = false;
        state.comments = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchComments.rejected, (state, action) => {
        state.commentsLoading = false;
        state.error = action.payload;
      })
      .addCase(addComment.fulfilled, (state, action) => {
        if (action.payload) state.comments.push(action.payload);
      })
      .addCase(resolveComment.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated?._id) return;
        const idx = state.comments.findIndex((comment) => comment._id === updated._id);
        if (idx !== -1) state.comments[idx] = updated;
      })
      .addCase(deleteComment.fulfilled, (state, action) => {
        state.comments = state.comments.filter((comment) => comment._id !== action.payload);
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
