import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  fetchCandidates,
  createSubRequest,
  fetchSubRequests,
  fetchSubRequestById,
  cancelSubRequest,
  respondToSubRequest,
  respondToSubRequestAuth,
  fetchSubPendingCount,
} from '../../api/substitutionsApi';

export const fetchSubCandidates = createAsyncThunk(
  'substitutions/fetchSubCandidates',
  async ({ absentTeacherId, date }, { rejectWithValue }) => {
    try {
      return await fetchCandidates({ absentTeacherId, date });
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch candidates');
    }
  }
);

export const createSubRequestThunk = createAsyncThunk(
  'substitutions/createSubRequest',
  async (payload, { rejectWithValue }) => {
    try {
      return await createSubRequest(payload);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to create request');
    }
  }
);

export const fetchSubRequestsThunk = createAsyncThunk(
  'substitutions/fetchSubRequests',
  async (filters = {}, { rejectWithValue }) => {
    try {
      return await fetchSubRequests(filters);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch requests');
    }
  }
);

export const fetchSubRequestByIdThunk = createAsyncThunk(
  'substitutions/fetchSubRequestById',
  async (id, { rejectWithValue }) => {
    try {
      return await fetchSubRequestById(id);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch request');
    }
  }
);

export const cancelSubRequestThunk = createAsyncThunk(
  'substitutions/cancelSubRequest',
  async ({ id, note }, { rejectWithValue }) => {
    try {
      return await cancelSubRequest({ id, note });
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to cancel request');
    }
  }
);

export const fetchSubPendingCountThunk = createAsyncThunk(
  'substitutions/fetchSubPendingCount',
  async (_, { rejectWithValue }) => {
    try {
      return await fetchSubPendingCount();
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch count');
    }
  }
);

export const respondToSubRequestThunk = createAsyncThunk(
  'substitutions/respondToSubRequest',
  async ({ token, action, note }, { rejectWithValue }) => {
    try {
      return await respondToSubRequest({ token, action, note });
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to respond');
    }
  }
);

export const respondToSubRequestAuthThunk = createAsyncThunk(
  'substitutions/respondToSubRequestAuth',
  async ({ id, action, note }, { rejectWithValue }) => {
    try {
      return await respondToSubRequestAuth({ id, action, note });
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to respond');
    }
  }
);

const initialState = {
  candidates: { loading: false, error: null, data: null },
  create: { loading: false, error: null, success: false, requestId: null },
  list: { loading: false, error: null, items: [], pagination: null },
  detail: { loading: false, error: null, item: null },
  respond: { loading: false, error: null, success: false, lastRequest: null },
  respondInPortal: { loading: false, error: null, success: false, lastRequest: null },
  pendingCount: { loading: false, count: 0 },
};

const substitutionsSlice = createSlice({
  name: 'substitutions',
  initialState,
  reducers: {
    clearCreateState: (state) => {
      state.create = initialState.create;
    },
    clearRespondState: (state) => {
      state.respond = initialState.respond;
      state.respondInPortal = initialState.respondInPortal;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchSubCandidates
      .addCase(fetchSubCandidates.pending, (state) => {
        state.candidates.loading = true;
        state.candidates.error = null;
        state.candidates.data = null;
      })
      .addCase(fetchSubCandidates.fulfilled, (state, action) => {
        state.candidates.loading = false;
        state.candidates.data = action.payload;
        state.candidates.error = null;
      })
      .addCase(fetchSubCandidates.rejected, (state, action) => {
        state.candidates.loading = false;
        state.candidates.error = action.payload;
        state.candidates.data = null;
      })
      // createSubRequest
      .addCase(createSubRequestThunk.pending, (state) => {
        state.create.loading = true;
        state.create.error = null;
        state.create.success = false;
        state.create.requestId = null;
      })
      .addCase(createSubRequestThunk.fulfilled, (state, action) => {
        state.create.loading = false;
        state.create.success = true;
        state.create.requestId = action.payload._id;
        state.create.error = null;
      })
      .addCase(createSubRequestThunk.rejected, (state, action) => {
        state.create.loading = false;
        state.create.error = action.payload;
        state.create.success = false;
        state.create.requestId = null;
      })
      // fetchSubRequests
      .addCase(fetchSubRequestsThunk.pending, (state) => {
        state.list.loading = true;
        state.list.error = null;
      })
      .addCase(fetchSubRequestsThunk.fulfilled, (state, action) => {
        state.list.loading = false;
        state.list.items = action.payload.requests || [];
        state.list.pagination = action.payload.pagination || null;
        state.list.error = null;
      })
      .addCase(fetchSubRequestsThunk.rejected, (state, action) => {
        state.list.loading = false;
        state.list.error = action.payload;
        state.list.items = [];
      })
      // fetchSubRequestById
      .addCase(fetchSubRequestByIdThunk.pending, (state) => {
        state.detail.loading = true;
        state.detail.error = null;
      })
      .addCase(fetchSubRequestByIdThunk.fulfilled, (state, action) => {
        state.detail.loading = false;
        state.detail.item = action.payload;
        state.detail.error = null;
      })
      .addCase(fetchSubRequestByIdThunk.rejected, (state, action) => {
        state.detail.loading = false;
        state.detail.error = action.payload;
        state.detail.item = null;
      })
      // cancelSubRequest
      .addCase(cancelSubRequestThunk.fulfilled, (state, action) => {
        if (state.detail.item?._id === action.payload._id) {
          state.detail.item = action.payload;
        }
        const idx = state.list.items.findIndex((r) => r._id === action.payload._id);
        if (idx >= 0) state.list.items[idx] = action.payload;
      })
      // respondToSubRequest
      .addCase(respondToSubRequestThunk.pending, (state) => {
        state.respond.loading = true;
        state.respond.error = null;
        state.respond.success = false;
      })
      .addCase(respondToSubRequestThunk.fulfilled, (state, action) => {
        state.respond.loading = false;
        state.respond.success = true;
        state.respond.error = null;
        state.respond.lastRequest = action.payload ?? null;
      })
      .addCase(respondToSubRequestThunk.rejected, (state, action) => {
        state.respond.loading = false;
        state.respond.error = action.payload;
        state.respond.success = false;
      })
      .addCase(fetchSubPendingCountThunk.fulfilled, (state, action) => {
        state.pendingCount.count = action.payload ?? 0;
        state.pendingCount.loading = false;
      })
      .addCase(fetchSubPendingCountThunk.pending, (state) => {
        state.pendingCount.loading = true;
      })
      .addCase(fetchSubPendingCountThunk.rejected, (state) => {
        state.pendingCount.loading = false;
      })
      // respondToSubRequestAuth (in-portal)
      .addCase(respondToSubRequestAuthThunk.pending, (state) => {
        state.respondInPortal.loading = true;
        state.respondInPortal.error = null;
        state.respondInPortal.success = false;
      })
      .addCase(respondToSubRequestAuthThunk.fulfilled, (state, action) => {
        state.respondInPortal.loading = false;
        state.respondInPortal.success = true;
        state.respondInPortal.error = null;
        state.respondInPortal.lastRequest = action.payload ?? null;

        const updated = action.payload;
        if (!updated?._id) return;

        if (state.detail.item?._id === updated._id) {
          state.detail.item = updated;
        }
        const idx = state.list.items.findIndex((r) => r._id === updated._id);
        if (idx >= 0) state.list.items[idx] = updated;
      })
      .addCase(respondToSubRequestAuthThunk.rejected, (state, action) => {
        state.respondInPortal.loading = false;
        state.respondInPortal.error = action.payload;
        state.respondInPortal.success = false;
      });
  },
});

export const { clearCreateState, clearRespondState } = substitutionsSlice.actions;

export const selectCandidates = (state) => state.substitutions.candidates;
export const selectCreate = (state) => state.substitutions.create;
export const selectList = (state) => state.substitutions.list;
export const selectDetail = (state) => state.substitutions.detail;
export const selectRespond = (state) => state.substitutions.respond;
export const selectRespondInPortal = (state) => state.substitutions.respondInPortal;
export const selectPendingCount = (state) => state.substitutions.pendingCount;

export default substitutionsSlice.reducer;
