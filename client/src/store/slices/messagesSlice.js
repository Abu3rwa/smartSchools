import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
    fetchMessageThreads as apiFetchThreads,
    fetchMessageThreadById as apiFetchThreadById,
    markMessageThreadRead as apiMarkRead,
    replyToMessageThread as apiReply,
    createMessageThread as apiCreateThread
} from '../../api/messagesApi';

// ── Async thunks ──────────────────────────────────────────────

export const fetchThreads = createAsyncThunk(
    'messages/fetchThreads',
    async (params = {}, { rejectWithValue }) => {
        try {
            return await apiFetchThreads(params);
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to fetch threads');
        }
    }
);

export const fetchThreadDetail = createAsyncThunk(
    'messages/fetchThreadDetail',
    async (threadId, { rejectWithValue }) => {
        try {
            return await apiFetchThreadById(threadId);
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to fetch thread detail');
        }
    }
);

export const markThreadRead = createAsyncThunk(
    'messages/markThreadRead',
    async (threadId, { rejectWithValue }) => {
        try {
            return await apiMarkRead(threadId);
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to mark thread read');
        }
    }
);

export const sendReply = createAsyncThunk(
    'messages/sendReply',
    async ({ threadId, body }, { rejectWithValue }) => {
        try {
            return await apiReply({ threadId, body });
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to send reply');
        }
    }
);

export const createThread = createAsyncThunk(
    'messages/createThread',
    async (payload, { rejectWithValue }) => {
        try {
            return await apiCreateThread(payload);
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to create thread');
        }
    }
);

// ── Slice ─────────────────────────────────────────────────────

const initialState = {
    threads: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    unreadCount: 0,
    selectedThreadId: null,
    threadDetail: null,
    loading: false,
    detailLoading: false,
    sendingReply: false,
    creating: false,
    error: null
};

const messagesSlice = createSlice({
    name: 'messages',
    initialState,
    reducers: {
        setSelectedThread(state, action) {
            state.selectedThreadId = action.payload;
        },
        clearThreadDetail(state) {
            state.threadDetail = null;
            state.selectedThreadId = null;
        },
        updateThreadFromRealtime(state, action) {
            const { threadId } = action.payload || {};
            if (!threadId) return;
            // Mark that a realtime update came in — the hook will trigger a refetch
            state._realtimeHint = threadId;
        },
        appendThreads(state, action) {
            const items = action.payload || [];
            state.threads = [...state.threads, ...items];
        }
    },
    extraReducers: (builder) => {
        // fetchThreads
        builder
            .addCase(fetchThreads.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchThreads.fulfilled, (state, action) => {
                state.loading = false;
                state.threads = action.payload.items || [];
                state.pagination = action.payload.pagination || initialState.pagination;
                state.unreadCount = action.payload.unreadCount ?? state.unreadCount;
            })
            .addCase(fetchThreads.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });

        // fetchThreadDetail
        builder
            .addCase(fetchThreadDetail.pending, (state) => {
                state.detailLoading = true;
            })
            .addCase(fetchThreadDetail.fulfilled, (state, action) => {
                state.detailLoading = false;
                state.threadDetail = action.payload;
            })
            .addCase(fetchThreadDetail.rejected, (state) => {
                state.detailLoading = false;
            });

        // markThreadRead
        builder
            .addCase(markThreadRead.fulfilled, (state, action) => {
                const { threadId, unreadCount } = action.payload;
                state.unreadCount = unreadCount ?? Math.max(state.unreadCount - 1, 0);
                const thread = state.threads.find((t) => t.id === threadId);
                if (thread) {
                    thread.unreadCount = 0;
                    thread.isRead = true;
                }
            });

        // sendReply
        builder
            .addCase(sendReply.pending, (state) => {
                state.sendingReply = true;
            })
            .addCase(sendReply.fulfilled, (state, action) => {
                state.sendingReply = false;
                const { threadId, message: newMessage } = action.payload;

                // Append to thread detail
                if (state.threadDetail?.messages) {
                    state.threadDetail.messages.push(newMessage);
                }

                // Update thread preview in list
                const thread = state.threads.find((t) => t.id === threadId);
                if (thread && newMessage) {
                    thread.preview = newMessage.body || thread.preview;
                    thread.lastMessageAt = newMessage.createdAt || thread.lastMessageAt;
                }
            })
            .addCase(sendReply.rejected, (state) => {
                state.sendingReply = false;
            });

        // createThread
        builder
            .addCase(createThread.pending, (state) => {
                state.creating = true;
                state.error = null;
            })
            .addCase(createThread.fulfilled, (state) => {
                state.creating = false;
            })
            .addCase(createThread.rejected, (state, action) => {
                state.creating = false;
                state.error = action.payload;
            });
    }
});

export const {
    setSelectedThread,
    clearThreadDetail,
    updateThreadFromRealtime,
    appendThreads
} = messagesSlice.actions;

// ── Selectors ─────────────────────────────────────────────────

export const selectThreads = (state) => state.messages.threads;
export const selectMessagesPagination = (state) => state.messages.pagination;
export const selectUnreadCount = (state) => state.messages.unreadCount;
export const selectSelectedThreadId = (state) => state.messages.selectedThreadId;
export const selectThreadDetail = (state) => state.messages.threadDetail;
export const selectMessagesLoading = (state) => state.messages.loading;
export const selectDetailLoading = (state) => state.messages.detailLoading;
export const selectSendingReply = (state) => state.messages.sendingReply;
export const selectCreating = (state) => state.messages.creating;
export const selectMessagesError = (state) => state.messages.error;

export default messagesSlice.reducer;
