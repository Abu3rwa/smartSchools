import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    fetchThreads,
    fetchThreadDetail,
    markThreadRead,
    sendReply,
    setSelectedThread,
    selectThreads,
    selectMessagesPagination,
    selectUnreadCount,
    selectSelectedThreadId,
    selectThreadDetail,
    selectMessagesLoading,
    selectDetailLoading,
    selectSendingReply
} from '../../../../store/slices/messagesSlice';

const useMessagesData = ({ pageLimit }) => {
    const { t } = useTranslation(['messages']);
    const dispatch = useDispatch();

    const threads = useSelector(selectThreads);
    const pagination = useSelector(selectMessagesPagination);
    const unreadCount = useSelector(selectUnreadCount);
    const selectedThreadId = useSelector(selectSelectedThreadId);
    const threadDetail = useSelector(selectThreadDetail);
    const loadingThreads = useSelector(selectMessagesLoading);
    const loadingDetail = useSelector(selectDetailLoading);
    const sendingReply = useSelector(selectSendingReply);

    const [unreadOnly, setUnreadOnly] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    const hasMore = useMemo(() => pagination.page < pagination.totalPages, [pagination.page, pagination.totalPages]);

    const loadThreads = useCallback(async ({ page = 1, append = false, silent = false } = {}) => {
        if (append) setLoadingMore(true);

        try {
            const result = await dispatch(fetchThreads({ page, limit: pageLimit, unreadOnly, silent })).unwrap();
            setLastUpdatedAt(new Date());
            return result;
        } catch (error) {
            if (!silent) {
                toast.error(error || t('messages:toasts.loadMessagesFailed'));
            }
            return null;
        } finally {
            setLoadingMore(false);
        }
    }, [dispatch, pageLimit, unreadOnly, t]);

    const refreshThreadDetail = useCallback(async (threadId) => {
        if (!threadId) return;
        try {
            await dispatch(fetchThreadDetail(threadId)).unwrap();
        } catch {
            // Keep silent during background refresh
        }
    }, [dispatch]);

    const handleSelectThread = useCallback(async (thread) => {
        dispatch(setSelectedThread(thread.id));
        setReplyBody('');

        try {
            await dispatch(fetchThreadDetail(thread.id)).unwrap();

            if ((thread.unreadCount || 0) > 0) {
                await dispatch(markThreadRead(thread.id)).unwrap();
            }
        } catch (error) {
            toast.error(error || t('messages:toasts.loadThreadFailed'));
        }
    }, [dispatch, t]);

    const handleSendReply = useCallback(async () => {
        if (!selectedThreadId || !replyBody.trim()) return;

        try {
            await dispatch(sendReply({
                threadId: selectedThreadId,
                body: replyBody.trim()
            })).unwrap();
            setReplyBody('');
        } catch (error) {
            toast.error(error || t('messages:toasts.replyFailed'));
        }
    }, [dispatch, replyBody, selectedThreadId, t]);

    useEffect(() => {
        dispatch(setSelectedThread(null));
        loadThreads({ page: 1, append: false });
    }, [unreadOnly, loadThreads, dispatch]);

    return {
        threads,
        pagination,
        unreadCount,
        unreadOnly,
        setUnreadOnly,
        loadingThreads,
        loadingMore,
        selectedThreadId,
        setSelectedThreadId: (id) => dispatch(setSelectedThread(id)),
        threadDetail,
        setThreadDetail: () => {},
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
