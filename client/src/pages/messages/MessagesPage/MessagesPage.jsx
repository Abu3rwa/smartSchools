import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { createMessageThread } from '../../../api/messagesApi';
import { DEFAULT_THREAD_PAGE_LIMIT } from './constants';
import { groupMessagesByAge } from './utils/messagePresentation';
import MessagesHeader from './components/MessagesHeader';
import ThreadList from './components/ThreadList';
import ThreadDetail from './components/ThreadDetail';
import MessagesFab from './components/MessagesFab';
import ComposeModal from './components/ComposeModal';
import useMessagesRealtime from './hooks/useMessagesRealtime';
import useMessageCompose from './hooks/useMessageCompose';
import useMessagesData from './hooks/useMessagesData';
import './MessagesPage.css';

const MessagesPage = () => {
    const { t } = useTranslation(['messages']);
    const listRef = useRef(null);
    const messageListRef = useRef(null);
    const messageListEndRef = useRef(null);
    const [showYesterdayMessages, setShowYesterdayMessages] = useState(false);
    const [showOlderMessages, setShowOlderMessages] = useState(false);
    const {
        showCompose,
        setShowCompose,
        composeSubject,
        setComposeSubject,
        composeBody,
        setComposeBody,
        composeSearch,
        setComposeSearch,
        composeLoading,
        setComposeLoading,
        classOptions,
        selectedClassIds,
        includeClassParents,
        setIncludeClassParents,
        includeClassStudents,
        setIncludeClassStudents,
        loadingClasses,
        parentOptions,
        selectedParents,
        loadingParents,
        handleSelectParent,
        handleToggleClass,
        handleRemoveParent
    } = useMessageCompose();

    const {
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
    } = useMessagesData({ pageLimit: DEFAULT_THREAD_PAGE_LIMIT });
    const groupedThreadMessages = useMemo(
        () => groupMessagesByAge(threadDetail?.messages || []),
        [threadDetail?.messages]
    );
    const latestMessageId = useMemo(() => {
        const messages = threadDetail?.messages || [];
        if (messages.length === 0) return '';
        return messages[messages.length - 1]?.id || '';
    }, [threadDetail?.messages]);

    const scrollMessageListToBottom = useCallback((behavior = 'auto') => {
        const container = messageListRef.current;
        if (!container) return;

        if (messageListEndRef.current && typeof messageListEndRef.current.scrollIntoView === 'function') {
            messageListEndRef.current.scrollIntoView({ block: 'end', behavior });
            return;
        }

        container.scrollTo({ top: container.scrollHeight, behavior });
    }, []);

    const { realtimeConnected } = useMessagesRealtime({
        selectedThreadId
    });

    useEffect(() => {
        setShowYesterdayMessages(false);
        setShowOlderMessages(false);
    }, [selectedThreadId]);

    const handleScroll = () => {
        const container = listRef.current;
        if (!container || loadingMore || loadingThreads || !hasMore) return;

        const threshold = 40;
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - threshold) {
            loadThreads({ page: pagination.page + 1, append: true });
        }
    };


    useEffect(() => {
        if (!selectedThreadId || loadingDetail) return undefined;
        const frameId = window.requestAnimationFrame(() => {
            scrollMessageListToBottom('auto');
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [selectedThreadId, latestMessageId, loadingDetail, scrollMessageListToBottom]);

    const handleCreateThread = async (event) => {
        event.preventDefault();
        if (!composeSubject.trim()) {
            toast.error(t('messages:toasts.subjectRequired'));
            return;
        }
        if (!composeBody.trim()) {
            toast.error(t('messages:toasts.bodyRequired'));
            return;
        }
        if (selectedParents.length === 0 && selectedClassIds.length === 0) {
            toast.error(t('messages:toasts.recipientRequired'));
            return;
        }
        if (selectedClassIds.length > 0 && !includeClassParents && !includeClassStudents) {
            toast.error(t('messages:toasts.classAudienceRequired'));
            return;
        }

        setComposeLoading(true);
        try {
            const payload = {
                subject: composeSubject.trim(),
                body: composeBody.trim(),
                recipientUserIds: selectedParents.map((parent) => parent.id),
                classIds: selectedClassIds,
                includeParents: includeClassParents,
                includeStudents: includeClassStudents
            };
            const result = await createMessageThread(payload);
            const data = await loadThreads({ page: 1, append: false });
            setShowCompose(false);

            const nextThreadId = result.threadId || result.threads?.[0]?.threadId;
            if (nextThreadId && data?.items) {
                const nextThread = data.items.find((item) => item.id === nextThreadId);
                if (nextThread) {
                    await handleSelectThread(nextThread);
                }
            }

            const recipientCount = Number(result.recipientCount || 0);
            toast.success(
                recipientCount > 0
                    ? t('messages:toasts.sentToRecipients', { count: recipientCount })
                    : t('messages:toasts.sent')
            );
        } catch (error) {
            toast.error(error.message || t('messages:toasts.sendFailed'));
        } finally {
            setComposeLoading(false);
        }
    };


    const selectedThread = useMemo(() => {
        return threads.find((item) => item.id === selectedThreadId) || null;
    }, [threads, selectedThreadId]);

    const selectedClasses = useMemo(
        () => classOptions.filter((classOption) => selectedClassIds.includes(classOption.id)),
        [classOptions, selectedClassIds]
    );

    const classAudiencePreview = useMemo(() => {
        if (selectedClasses.length === 0) {
            return { parents: 0, students: 0 };
        }
        return selectedClasses.reduce((acc, classOption) => {
            acc.parents += Number(classOption.parentCount || 0);
            acc.students += Number(classOption.studentRecipientCount || 0);
            return acc;
        }, { parents: 0, students: 0 });
    }, [selectedClasses]);

    return (
        <div className={`messages-page ${selectedThread ? 'thread-open' : ''}`}>
            <MessagesHeader
                realtimeConnected={realtimeConnected}
                lastUpdatedAt={lastUpdatedAt}
                onRefresh={() => loadThreads({ page: 1 })}
                onCompose={() => setShowCompose(true)}
                showComposeButton={!selectedThreadId}
            />

            <div className={`messages-layout ${selectedThread ? 'has-selection' : ''}`}>
                <ThreadList
                    listRef={listRef}
                    threads={threads}
                    loadingThreads={loadingThreads}
                    loadingMore={loadingMore}
                    unreadCount={unreadCount}
                    unreadOnly={unreadOnly}
                    selectedThreadId={selectedThreadId}
                    onToggleUnread={(event) => setUnreadOnly(event.target.checked)}
                    onSelectThread={handleSelectThread}
                    onScroll={handleScroll}
                />

                <ThreadDetail
                    selectedThread={selectedThread}
                    threadDetail={threadDetail}
                    loadingDetail={loadingDetail}
                    groupedThreadMessages={groupedThreadMessages}
                    showOlderMessages={showOlderMessages}
                    showYesterdayMessages={showYesterdayMessages}
                    onToggleOlder={() => setShowOlderMessages((prev) => !prev)}
                    onToggleYesterday={() => setShowYesterdayMessages((prev) => !prev)}
                    messageListRef={messageListRef}
                    messageListEndRef={messageListEndRef}
                    onBack={() => {
                        setSelectedThreadId(null);
                        setThreadDetail(null);
                    }}
                    replyBody={replyBody}
                    onReplyBodyChange={(event) => setReplyBody(event.target.value)}
                    onSendReply={handleSendReply}
                    sendingReply={sendingReply}
                />
            </div>

            <MessagesFab
                isHidden={showCompose || selectedThreadId}
                onClick={() => setShowCompose(true)}
            />

            <ComposeModal
                isOpen={showCompose}
                onClose={() => setShowCompose(false)}
                onSubmit={handleCreateThread}
                classOptions={classOptions}
                selectedClassIds={selectedClassIds}
                includeClassParents={includeClassParents}
                includeClassStudents={includeClassStudents}
                onToggleClass={handleToggleClass}
                onToggleClassParents={(event) => setIncludeClassParents(event.target.checked)}
                onToggleClassStudents={(event) => setIncludeClassStudents(event.target.checked)}
                classAudiencePreview={classAudiencePreview}
                loadingClasses={loadingClasses}
                composeSearch={composeSearch}
                onSearchChange={(event) => setComposeSearch(event.target.value)}
                selectedParents={selectedParents}
                onRemoveParent={handleRemoveParent}
                parentOptions={parentOptions}
                onSelectParent={handleSelectParent}
                loadingParents={loadingParents}
                composeSubject={composeSubject}
                onSubjectChange={(event) => setComposeSubject(event.target.value)}
                composeBody={composeBody}
                onBodyChange={(event) => setComposeBody(event.target.value)}
                composeLoading={composeLoading}
            />
        </div>
    );
};

export default MessagesPage;
