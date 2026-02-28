import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    fetchMessageThreads,
    fetchMessageThreadById,
    markMessageThreadRead,
    replyToMessageThread
} from '../../../../api/messagesApi';

const useMessagesData = ({ pageLimit }) => {
    const [threads, setThreads] = useState([]);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: pageLimit,
        total: 0,
        totalPages: 1
    });
    const [unreadCount, setUnreadCount] = useState(0);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [loadingThreads, setLoadingThreads] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selectedThreadId, setSelectedThreadId] = useState(null);
    const [threadDetail, setThreadDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    const hasMore = useMemo(() => pagination.page < pagination.totalPages, [pagination.page, pagination.totalPages]);

    const loadThreads = useCallback(async ({ page = 1, append = false, silent = false } = {}) => {
        if (append) {
            setLoadingMore(true);
        } else if (!silent) {
            setLoadingThreads(true);
        }

        try {
            const data = await fetchMessageThreads({ page, limit: pagination.limit, unreadOnly });
            setPagination(data.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
            setUnreadCount(data.unreadCount || 0);
            setThreads((prev) => (append ? [...prev, ...(data.items || [])] : (data.items || [])));
            setLastUpdatedAt(new Date());
            return data;
        } catch (error) {
            if (!silent) {
                toast.error(error.message || 'Failed to load messages');
            }
            return null;
        } finally {
            if (!silent) {
                setLoadingThreads(false);
            }
            setLoadingMore(false);
        }
    }, [pagination.limit, unreadOnly]);

    const refreshThreadDetail = useCallback(async (threadId) => {
        if (!threadId) return;
        try {
            const detail = await fetchMessageThreadById(threadId);
            setThreadDetail(detail);
        } catch (error) {
            // Keep silent during background refresh
        }
    }, []);

    const handleSelectThread = useCallback(async (thread) => {
        setSelectedThreadId(thread.id);
        setLoadingDetail(true);
        try {
            const detail = await fetchMessageThreadById(thread.id);
            setThreadDetail(detail);
            setReplyBody('');

            if ((thread.unreadCount || 0) > 0) {
                await markMessageThreadRead(thread.id);
                setThreads((prev) => prev.map((item) => (
                    item.id === thread.id ? { ...item, unreadCount: 0, isRead: true } : item
                )));
                setUnreadCount((prev) => Math.max(prev - (thread.unreadCount || 0), 0));
            }
        } catch (error) {
            toast.error(error.message || 'Failed to load thread');
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    const handleSendReply = useCallback(async () => {
        if (!selectedThreadId || !replyBody.trim()) {
            return;
        }
        setSendingReply(true);
        try {
            const result = await replyToMessageThread({
                threadId: selectedThreadId,
                body: replyBody.trim()
            });

            const newMessage = result.message;
            setThreadDetail((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    messages: [...(prev.messages || []), newMessage]
                };
            });

            setThreads((prev) => prev.map((item) => (
                item.id === selectedThreadId
                    ? {
                        ...item,
                        preview: newMessage?.body || item.preview,
                        lastMessageAt: newMessage?.createdAt || item.lastMessageAt
                    }
                    : item
            )));

            setReplyBody('');
        } catch (error) {
            toast.error(error.message || 'Failed to send reply');
        } finally {
            setSendingReply(false);
        }
    }, [replyBody, selectedThreadId]);

    useEffect(() => {
        setSelectedThreadId(null);
        setThreadDetail(null);
        loadThreads({ page: 1, append: false });
    }, [unreadOnly, loadThreads]);

    return {
        threads,
        pagination,
        unreadCount,
        unreadOnly,
        setUnreadOnly,
        loadingThreads,
        loadingMore,
        selectedThreadId,
        setSelectedThreadId,
        threadDetail,
        setThreadDetail,
        loadingDetail,
        replyBody,
        setReplyBody,
        sendingReply,
        lastUpdatedAt,
        hasMore,
        loadThreads,
        refreshThreadDetail,
        handleSelectThread,
        handleSendReply
    };
};

export default useMessagesData;