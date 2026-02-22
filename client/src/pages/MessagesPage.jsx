import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineInbox, HiOutlineChatAlt2, HiOutlineX } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    buildMessagesRealtimeUrl,
    createMessageThread,
    fetchMessageClasses,
    fetchMessageParents,
    fetchMessageThreads,
    fetchMessageThreadById,
    markMessageThreadRead,
    replyToMessageThread
} from '../api/messagesApi';
import { MessagesRealtimeService } from '../services/messagesRealtimeService';
import './MessagesPage.css';

const formatTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'MMM d, yyyy');
};

const formatStudentNames = (studentNames) => {
    if (!Array.isArray(studentNames) || studentNames.length === 0) return '';
    return studentNames.join(', ');
};

const formatClassLabel = (classOption) => {
    if (!classOption) return 'Class';
    if (classOption.label) return classOption.label;

    const parts = [];
    if (classOption.name) parts.push(classOption.name);
    if (classOption.grade != null) parts.push(`Grade ${classOption.grade}`);
    if (classOption.section) parts.push(classOption.section);
    return parts.join(' · ') || 'Class';
};

const DAY_MS = 24 * 60 * 60 * 1000;

const getStartOfLocalDay = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const groupMessagesByAge = (messages = []) => {
    const today = [];
    const yesterday = [];
    const older = [];
    const todayStart = getStartOfLocalDay(new Date());
    if (!todayStart) {
        return { today, yesterday, older };
    }

    for (const message of messages) {
        const messageStart = getStartOfLocalDay(message?.createdAt);
        if (!messageStart) {
            older.push(message);
            continue;
        }

        const diffDays = Math.floor((todayStart.getTime() - messageStart.getTime()) / DAY_MS);
        if (diffDays <= 0) {
            today.push(message);
            continue;
        }
        if (diffDays === 1) {
            yesterday.push(message);
            continue;
        }
        older.push(message);
    }

    return { today, yesterday, older };
};

const MessagesPage = () => {
    const listRef = useRef(null);
    const messageListRef = useRef(null);
    const realtimeServiceRef = useRef(null);
    const realtimeSyncTimerRef = useRef(null);
    const realtimeSyncThreadIdsRef = useRef(new Set());
    const selectedThreadIdRef = useRef(null);
    const loadThreadsRef = useRef(null);
    const refreshThreadDetailRef = useRef(null);
    const backgroundListSyncRef = useRef(false);
    const backgroundDetailSyncRef = useRef(false);
    const [threads, setThreads] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
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
    const [realtimeConnected, setRealtimeConnected] = useState(false);
    const [showYesterdayMessages, setShowYesterdayMessages] = useState(false);
    const [showOlderMessages, setShowOlderMessages] = useState(false);

    const [showCompose, setShowCompose] = useState(false);
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeSearch, setComposeSearch] = useState('');
    const [composeLoading, setComposeLoading] = useState(false);
    const [classOptions, setClassOptions] = useState([]);
    const [selectedClassIds, setSelectedClassIds] = useState([]);
    const [includeClassParents, setIncludeClassParents] = useState(true);
    const [includeClassStudents, setIncludeClassStudents] = useState(true);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [parentOptions, setParentOptions] = useState([]);
    const [selectedParents, setSelectedParents] = useState([]);
    const [loadingParents, setLoadingParents] = useState(false);

    const hasMore = useMemo(() => pagination.page < pagination.totalPages, [pagination]);
    const groupedThreadMessages = useMemo(
        () => groupMessagesByAge(threadDetail?.messages || []),
        [threadDetail?.messages]
    );
    const latestMessageId = useMemo(() => {
        const messages = threadDetail?.messages || [];
        if (messages.length === 0) return '';
        return messages[messages.length - 1]?.id || '';
    }, [threadDetail?.messages]);

    const scheduleRealtimeSync = useCallback((threadId = '') => {
        const normalizedThreadId = String(threadId || '').trim();
        if (normalizedThreadId) {
            realtimeSyncThreadIdsRef.current.add(normalizedThreadId);
        }

        if (realtimeSyncTimerRef.current) {
            return;
        }

        realtimeSyncTimerRef.current = window.setTimeout(async () => {
            realtimeSyncTimerRef.current = null;
            const pendingThreadIds = new Set(realtimeSyncThreadIdsRef.current);
            realtimeSyncThreadIdsRef.current.clear();

            if (typeof loadThreadsRef.current === 'function') {
                await loadThreadsRef.current({ page: 1, append: false, silent: true });
            }

            const activeThreadId = selectedThreadIdRef.current;
            if (!activeThreadId) return;
            if (pendingThreadIds.size > 0 && !pendingThreadIds.has(activeThreadId)) return;

            if (typeof refreshThreadDetailRef.current === 'function') {
                await refreshThreadDetailRef.current(activeThreadId);
            }
        }, 350);
    }, []);

    const loadThreads = async ({ page = 1, append = false, silent = false } = {}) => {
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
    };

    const refreshThreadDetail = async (threadId) => {
        if (!threadId) return;
        try {
            const detail = await fetchMessageThreadById(threadId);
            setThreadDetail(detail);
        } catch (error) {
            // Keep silent during background refresh
        }
    };

    useEffect(() => {
        selectedThreadIdRef.current = selectedThreadId;
    }, [selectedThreadId]);

    useEffect(() => {
        setShowYesterdayMessages(false);
        setShowOlderMessages(false);
    }, [selectedThreadId]);

    useEffect(() => {
        loadThreadsRef.current = loadThreads;
    }, [loadThreads]);

    useEffect(() => {
        refreshThreadDetailRef.current = refreshThreadDetail;
    }, [refreshThreadDetail]);

    useEffect(() => {
        const realtimeService = new MessagesRealtimeService({
            onConnectionChange: (connected) => setRealtimeConnected(connected),
            onEvent: (event) => {
                const eventThreadId = event?.data?.threadId;
                scheduleRealtimeSync(eventThreadId);
            }
        });
        realtimeServiceRef.current = realtimeService;

        const realtimeUrl = buildMessagesRealtimeUrl();
        if (realtimeUrl) {
            realtimeService.connect(realtimeUrl);
        }

        return () => {
            if (realtimeSyncTimerRef.current) {
                window.clearTimeout(realtimeSyncTimerRef.current);
                realtimeSyncTimerRef.current = null;
            }
            realtimeSyncThreadIdsRef.current.clear();
            realtimeService.dispose();
            realtimeServiceRef.current = null;
            setRealtimeConnected(false);
        };
    }, [scheduleRealtimeSync]);

    useEffect(() => {
        setSelectedThreadId(null);
        setThreadDetail(null);
        loadThreads({ page: 1, append: false });
    }, [unreadOnly]);

    useEffect(() => {
        const handleFocus = () => {
            const realtimeUrl = buildMessagesRealtimeUrl();
            if (realtimeUrl && realtimeServiceRef.current) {
                realtimeServiceRef.current.connect(realtimeUrl);
            }
            loadThreads({ page: 1, append: false, silent: true });
            refreshThreadDetail(selectedThreadId);
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [selectedThreadId, unreadOnly]);

    useEffect(() => {
        let cancelled = false;

        const tick = async () => {
            if (cancelled || document.visibilityState !== 'visible') return;

            if (!backgroundListSyncRef.current && typeof loadThreadsRef.current === 'function') {
                backgroundListSyncRef.current = true;
                try {
                    await loadThreadsRef.current({ page: 1, append: false, silent: true });
                } finally {
                    backgroundListSyncRef.current = false;
                }
            }

            const activeThreadId = selectedThreadIdRef.current;
            if (!activeThreadId) return;
            if (backgroundDetailSyncRef.current || typeof refreshThreadDetailRef.current !== 'function') return;

            backgroundDetailSyncRef.current = true;
            try {
                await refreshThreadDetailRef.current(activeThreadId);
            } finally {
                backgroundDetailSyncRef.current = false;
            }
        };

        const intervalMs = 4000;
        const intervalId = window.setInterval(() => {
            void tick();
        }, intervalMs);
        void tick();

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [realtimeConnected]);

    const handleScroll = () => {
        const container = listRef.current;
        if (!container || loadingMore || loadingThreads || !hasMore) return;

        const threshold = 40;
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - threshold) {
            loadThreads({ page: pagination.page + 1, append: true });
        }
    };

    const handleSelectThread = async (thread) => {
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
    };

    useEffect(() => {
        if (!showCompose) return;
        setComposeSearch('');
        setParentOptions([]);
        setSelectedParents([]);
        setSelectedClassIds([]);
        setIncludeClassParents(true);
        setIncludeClassStudents(true);
        setComposeSubject('');
        setComposeBody('');
    }, [showCompose]);

    useEffect(() => {
        if (!showCompose) return undefined;

        let cancelled = false;
        const loadClassOptions = async () => {
            setLoadingClasses(true);
            try {
                const data = await fetchMessageClasses({ limit: 200 });
                if (!cancelled) {
                    setClassOptions(data.classes || []);
                }
            } catch (error) {
                if (!cancelled) {
                    toast.error(error.message || 'Failed to load classes');
                }
            } finally {
                if (!cancelled) {
                    setLoadingClasses(false);
                }
            }
        };

        loadClassOptions();
        return () => {
            cancelled = true;
        };
    }, [showCompose]);

    useEffect(() => {
        if (!showCompose) return undefined;

        const handle = window.setTimeout(async () => {
            setLoadingParents(true);
            try {
                const data = await fetchMessageParents({ search: composeSearch, limit: 10 });
                setParentOptions(data.parents || []);
            } catch (error) {
                toast.error(error.message || 'Failed to load parents');
            } finally {
                setLoadingParents(false);
            }
        }, 300);

        return () => window.clearTimeout(handle);
    }, [composeSearch, showCompose]);

    useEffect(() => {
        if (!messageListRef.current) return;
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }, [selectedThreadId, latestMessageId]);

    const handleSelectParent = (parent) => {
        setSelectedParents((prev) => {
            if (prev.some((item) => item.id === parent.id)) return prev;
            return [...prev, parent];
        });
    };

    const handleToggleClass = (classId) => {
        setSelectedClassIds((prev) => (
            prev.includes(classId)
                ? prev.filter((id) => id !== classId)
                : [...prev, classId]
        ));
    };

    const handleRemoveParent = (parentId) => {
        setSelectedParents((prev) => prev.filter((item) => item.id !== parentId));
    };

    const handleCreateThread = async (event) => {
        event.preventDefault();
        if (!composeSubject.trim()) {
            toast.error('Subject is required');
            return;
        }
        if (!composeBody.trim()) {
            toast.error('Message body is required');
            return;
        }
        if (selectedParents.length === 0 && selectedClassIds.length === 0) {
            toast.error('Select at least one recipient or class');
            return;
        }
        if (selectedClassIds.length > 0 && !includeClassParents && !includeClassStudents) {
            toast.error('Enable at least one class audience: parents or students');
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
                    ? `Message sent to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`
                    : 'Message sent'
            );
        } catch (error) {
            toast.error(error.message || 'Failed to send message');
        } finally {
            setComposeLoading(false);
        }
    };

    const handleSendReply = async () => {
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
        <div className="messages-page">
            <div className="page-header">
                <div>
                    <h1>Messages</h1>
                    <p className="text-muted">Communicate with parents and students in a shared inbox</p>
                </div>
                <div className="messages-header-actions">
                    <span className={`messages-live-pill ${realtimeConnected ? 'online' : 'offline'}`}>
                        <span className="messages-live-dot" />
                        {realtimeConnected ? 'Live' : 'Offline'}
                    </span>
                    {lastUpdatedAt && (
                        <span className="messages-updated text-muted">
                            Updated {format(lastUpdatedAt, 'HH:mm')}
                        </span>
                    )}
                    <button className="btn btn-secondary" onClick={() => loadThreads({ page: 1 })}>
                        <HiOutlineRefresh size={18} />
                        Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowCompose(true)}>
                        <HiOutlinePlus size={18} />
                        New Message
                    </button>
                </div>
            </div>

            <div className="messages-layout">
                <div className="thread-list">
                    <div className="thread-list-header">
                        <div className="thread-list-title">
                            <HiOutlineInbox size={18} />
                            <span>Inbox</span>
                            {unreadCount > 0 && <span className="unread-pill">{unreadCount}</span>}
                        </div>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={unreadOnly}
                                onChange={(e) => setUnreadOnly(e.target.checked)}
                            />
                            <span>Unread only</span>
                        </label>
                    </div>

                    <div className="thread-list-body" ref={listRef} onScroll={handleScroll}>
                        {loadingThreads && (
                            <div className="loading-container">
                                <div className="spinner"></div>
                            </div>
                        )}

                        {!loadingThreads && threads.length === 0 && (
                            <div className="thread-empty">
                                <HiOutlineInbox size={28} />
                                <p>No conversations yet</p>
                                <span className="text-muted">Start a new thread to reach families and students.</span>
                            </div>
                        )}

                        {threads.map((thread) => (
                            <button
                                key={thread.id}
                                type="button"
                                className={`thread-item ${thread.unreadCount > 0 ? 'unread' : ''} ${
                                    selectedThreadId === thread.id ? 'active' : ''
                                }`}
                                onClick={() => handleSelectThread(thread)}
                            >
                                <div className="thread-row">
                                    <span className="thread-subject">{thread.subject}</span>
                                    <span className="thread-date">{formatTimestamp(thread.lastMessageAt)}</span>
                                </div>
                                <span className="thread-participants">{thread.participantsLabel || 'Parent'}</span>
                                <span className="thread-preview">{thread.preview || 'No messages yet.'}</span>
                                {thread.unreadCount > 0 && (
                                    <span className="thread-unread">{thread.unreadCount} new</span>
                                )}
                            </button>
                        ))}

                        {loadingMore && (
                            <div className="loading-more">Loading more...</div>
                        )}
                    </div>
                </div>

                <div className="thread-detail">
                    {!selectedThread && !loadingDetail && (
                        <div className="detail-empty">
                            <HiOutlineChatAlt2 size={32} />
                            <h3>Select a conversation</h3>
                            <p className="text-muted">Choose a thread from the inbox to read messages.</p>
                        </div>
                    )}

                    {loadingDetail && (
                        <div className="loading-container">
                            <div className="spinner"></div>
                        </div>
                    )}

                    {!loadingDetail && selectedThread && threadDetail && (
                        <>
                            <div className="detail-header">
                                <div>
                                    <h2>{threadDetail.thread?.subject || selectedThread.subject}</h2>
                                    <p className="text-muted">{threadDetail.thread?.participantsLabel || selectedThread.participantsLabel}</p>
                                </div>
                                {threadDetail.thread?.isClosed && (
                                    <span className="closed-pill">Closed</span>
                                )}
                            </div>
                            <div className="message-list" ref={messageListRef}>
                                {groupedThreadMessages.older.length > 0 && (
                                    <div className="message-section">
                                        <button
                                            type="button"
                                            className="message-section-toggle"
                                            onClick={() => setShowOlderMessages((prev) => !prev)}
                                        >
                                            <span>{showOlderMessages ? 'Hide older messages' : 'Show older messages'}</span>
                                            <span className="message-section-count">
                                                {groupedThreadMessages.older.length}
                                            </span>
                                        </button>
                                        {showOlderMessages && groupedThreadMessages.older.map((message) => (
                                            <div
                                                key={message.id}
                                                className={`message-bubble ${message.isMine ? 'mine' : ''}`}
                                            >
                                                <div className="message-meta">
                                                    <span className="message-sender">{message.senderName}</span>
                                                    <span className="message-time">{formatTimestamp(message.createdAt)}</span>
                                                </div>
                                                <p>{message.body}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {groupedThreadMessages.yesterday.length > 0 && (
                                    <div className="message-section">
                                        <button
                                            type="button"
                                            className="message-section-toggle"
                                            onClick={() => setShowYesterdayMessages((prev) => !prev)}
                                        >
                                            <span>{showYesterdayMessages ? 'Hide yesterday messages' : 'Show yesterday messages'}</span>
                                            <span className="message-section-count">
                                                {groupedThreadMessages.yesterday.length}
                                            </span>
                                        </button>
                                        {showYesterdayMessages && groupedThreadMessages.yesterday.map((message) => (
                                            <div
                                                key={message.id}
                                                className={`message-bubble ${message.isMine ? 'mine' : ''}`}
                                            >
                                                <div className="message-meta">
                                                    <span className="message-sender">{message.senderName}</span>
                                                    <span className="message-time">{formatTimestamp(message.createdAt)}</span>
                                                </div>
                                                <p>{message.body}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="message-section">
                                    <div className="message-section-header">
                                        <span>Today</span>
                                        <span className="message-section-count">
                                            {groupedThreadMessages.today.length}
                                        </span>
                                    </div>
                                    {groupedThreadMessages.today.map((message) => (
                                        <div
                                            key={message.id}
                                            className={`message-bubble ${message.isMine ? 'mine' : ''}`}
                                        >
                                            <div className="message-meta">
                                                <span className="message-sender">{message.senderName}</span>
                                                <span className="message-time">{formatTimestamp(message.createdAt)}</span>
                                            </div>
                                            <p>{message.body}</p>
                                        </div>
                                    ))}
                                    {groupedThreadMessages.today.length === 0 && (
                                        <div className="thread-empty compact">
                                            <p>No messages today yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {threadDetail.thread?.isClosed ? (
                                <div className="reply-closed">This conversation is closed.</div>
                            ) : (
                                <div className="reply-box">
                                    <textarea
                                        value={replyBody}
                                        onChange={(event) => setReplyBody(event.target.value)}
                                        placeholder="Type your reply..."
                                        rows={3}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleSendReply}
                                        disabled={sendingReply || replyBody.trim().length === 0}
                                    >
                                        {sendingReply ? 'Sending...' : 'Send Reply'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {showCompose && (
                <div className="modal-overlay" onClick={() => setShowCompose(false)}>
                    <div className="modal messages-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h2>New Message</h2>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setShowCompose(false)}
                            >
                                <HiOutlineX size={18} />
                            </button>
                        </div>
                        <form className="modal-body" onSubmit={handleCreateThread}>
                            <div className="compose-field">
                                <label>To classes</label>
                                <div className="class-selection">
                                    {loadingClasses && <div className="loading-more">Loading classes...</div>}
                                    {!loadingClasses && classOptions.length === 0 && (
                                        <div className="empty-row">No available classes</div>
                                    )}
                                    {!loadingClasses && classOptions.length > 0 && (
                                        <div className="class-options">
                                            {classOptions.map((classOption) => {
                                                const isSelected = selectedClassIds.includes(classOption.id);
                                                return (
                                                    <label
                                                        key={classOption.id}
                                                        className={`class-option ${isSelected ? 'selected' : ''}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleClass(classOption.id)}
                                                        />
                                                        <span className="class-option-main">
                                                            {formatClassLabel(classOption)}
                                                        </span>
                                                        <span className="class-option-meta">
                                                            {classOption.studentCount || 0} students · {classOption.parentCount || 0} parents
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div className="compose-audience-row">
                                    <label className="audience-toggle">
                                        <input
                                            type="checkbox"
                                            checked={includeClassParents}
                                            onChange={(event) => setIncludeClassParents(event.target.checked)}
                                        />
                                        <span>To parents</span>
                                    </label>
                                    <label className="audience-toggle">
                                        <input
                                            type="checkbox"
                                            checked={includeClassStudents}
                                            onChange={(event) => setIncludeClassStudents(event.target.checked)}
                                        />
                                        <span>To students</span>
                                    </label>
                                </div>
                                {selectedClassIds.length > 0 && (
                                    <div className="compose-class-preview text-muted">
                                        Selected {selectedClassIds.length} class{selectedClassIds.length === 1 ? '' : 'es'} ·
                                        approx. {classAudiencePreview.parents} parents · {classAudiencePreview.students} students
                                    </div>
                                )}
                            </div>

                            <div className="compose-field">
                                <label>Also send to specific parents (optional)</label>
                                <input
                                    type="text"
                                    placeholder="Search parents or child names"
                                    value={composeSearch}
                                    onChange={(event) => setComposeSearch(event.target.value)}
                                />
                                <div className="compose-selection">
                                    {selectedParents.map((parent) => (
                                        <span key={parent.id} className="compose-chip">
                                            <span>{parent.displayName}</span>
                                            {formatStudentNames(parent.studentNames) && (
                                                <span className="compose-students">
                                                    ({formatStudentNames(parent.studentNames)})
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                className="chip-remove"
                                                onClick={() => handleRemoveParent(parent.id)}
                                            >
                                                <HiOutlineX size={12} />
                                            </button>
                                        </span>
                                    ))}
                                    {selectedParents.length === 0 && (
                                        <span className="text-muted">No extra parent selected</span>
                                    )}
                                </div>
                                <div className="compose-results">
                                    {loadingParents && <div className="loading-more">Loading parents...</div>}
                                    {!loadingParents && parentOptions.length === 0 && (
                                        <div className="empty-row">No parents found</div>
                                    )}
                                    {parentOptions.map((parent) => (
                                        <button
                                            key={parent.id}
                                            type="button"
                                            className="compose-result"
                                            onClick={() => handleSelectParent(parent)}
                                        >
                                            <span>{parent.displayName}</span>
                                            {formatStudentNames(parent.studentNames) ? (
                                                <span className="compose-students">
                                                    {formatStudentNames(parent.studentNames)}
                                                </span>
                                            ) : (
                                                <span className="text-muted">{parent.email}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="compose-field">
                                <label>Subject</label>
                                <input
                                    type="text"
                                    value={composeSubject}
                                    onChange={(event) => setComposeSubject(event.target.value)}
                                    maxLength={200}
                                    placeholder="Subject"
                                />
                            </div>
                            <div className="compose-field">
                                <label>Message</label>
                                <textarea
                                    value={composeBody}
                                    onChange={(event) => setComposeBody(event.target.value)}
                                    rows={5}
                                    maxLength={5000}
                                    placeholder="Write your message..."
                                />
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowCompose(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={composeLoading}
                                >
                                    {composeLoading ? 'Sending...' : 'Send Message'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessagesPage;
