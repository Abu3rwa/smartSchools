import { HiOutlineInbox } from 'react-icons/hi';
import { formatTimestamp } from '../utils/messagePresentation';

const ThreadList = ({
    listRef,
    threads,
    loadingThreads,
    loadingMore,
    unreadCount,
    unreadOnly,
    selectedThreadId,
    onToggleUnread,
    onSelectThread,
    onScroll
}) => (
    <div className="thread-list">
        <div className="thread-list-header">
            <div className="thread-list-title">
                <HiOutlineInbox size={18} />
                <span>Inbox</span>
                {unreadCount > 0 && <span className="unread-pill">{unreadCount}</span>}
            </div>
            <label className="toggle">
                <input type="checkbox" checked={unreadOnly} onChange={onToggleUnread} />
                <span>Unread only</span>
            </label>
        </div>

        <div className="thread-list-body" ref={listRef} onScroll={onScroll}>
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
                    onClick={() => onSelectThread(thread)}
                >
                    <div className="thread-row">
                        <span className="thread-subject">{thread.subject}</span>
                        <span className="thread-date">{formatTimestamp(thread.lastMessageAt)}</span>
                    </div>
                    <span className="thread-participants">{thread.participantsLabel || 'Parent'}</span>
                    <span className="thread-preview">{thread.preview || 'No messages yet.'}</span>
                    {thread.unreadCount > 0 && <span className="thread-unread">{thread.unreadCount} new</span>}
                </button>
            ))}

            {loadingMore && <div className="loading-more">Loading more...</div>}
        </div>
    </div>
);

export default ThreadList;