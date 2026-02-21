import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineInbox, HiOutlineChatAlt2, HiOutlineX } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    createMessageThread,
    fetchMessageParents,
    fetchMessageThreads,
    fetchMessageThreadById,
    markMessageThreadRead,
    replyToMessageThread
} from '../api/messagesApi';
import './MessagesPage.css';

const formatTimestamp = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'MMM d, yyyy');
};

const MessagesPage = () => {
    const listRef = useRef(null);
    const messageListRef = useRef(null);
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

    const [showCompose, setShowCompose] = useState(false);
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeSearch, setComposeSearch] = useState('');
    const [composeLoading, setComposeLoading] = useState(false);
    const [parentOptions, setParentOptions] = useState([]);
    const [selectedParents, setSelectedParents] = useState([]);
    const [loadingParents, setLoadingParents] = useState(false);

    const hasMore = useMemo(() => pagination.page < pagination.totalPages, [pagination]);

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
        setSelectedThreadId(null);
        setThreadDetail(null);
        loadThreads({ page: 1, append: false });
    }, [unreadOnly]);

    useEffect(() => {
        const handleFocus = () => {
            loadThreads({ page: 1, append: false, silent: true });
            refreshThreadDetail(selectedThreadId);
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [selectedThreadId, unreadOnly]);

    useEffect(() => {
        let isMounted = true;

        const tick = async () => {
            if (!isMounted || document.visibilityState !== 'visible') return;
            await loadThreads({ page: 1, append: false, silent: true });
            await refreshThreadDetail(selectedThreadId);
        };

        const intervalId = window.setInterval(tick, 30000);
        return () => {
            isMounted = false;
            window.clearInterval(intervalId);
        };
    }, [selectedThreadId, unreadOnly]);

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
        setComposeSubject('');
        setComposeBody('');
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
    }, [threadDetail?.messages?.length]);

    const handleSelectParent = (parent) => {
        setSelectedParents((prev) => {
            if (prev.some((item) => item.id === parent.id)) return prev;
            return [...prev, parent];
        });
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
        if (selectedParents.length === 0) {
            toast.error('Select at least one parent');
            return;
        }

        setComposeLoading(true);
        try {
            const payload = {
                subject: composeSubject.trim(),
                body: composeBody.trim(),
                recipientUserIds: selectedParents.map((parent) => parent.id)
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

            toast.success('Message sent');
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

    return (
        <div className="messages-page">
            <div className="page-header">
                <div>
                    <h1>Messages</h1>
                    <p className="text-muted">Communicate with parents in a shared inbox</p>
                </div>
                <div className="messages-header-actions">
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
                                <span className="text-muted">Start a new thread to reach parents.</span>
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
                                {threadDetail.messages?.map((message) => (
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
                                {threadDetail.messages?.length === 0 && (
                                    <div className="thread-empty">
                                        <p>No messages yet.</p>
                                    </div>
                                )}
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
                                <label>To</label>
                                <input
                                    type="text"
                                    placeholder="Search parents by name or email"
                                    value={composeSearch}
                                    onChange={(event) => setComposeSearch(event.target.value)}
                                />
                                <div className="compose-selection">
                                    {selectedParents.map((parent) => (
                                        <span key={parent.id} className="compose-chip">
                                            {parent.displayName}
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
                                        <span className="text-muted">Select one or more parents</span>
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
                                            <span className="text-muted">{parent.email}</span>
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
