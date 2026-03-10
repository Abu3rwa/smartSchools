import { HiOutlineInbox } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
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
}) => {
    const { t } = useTranslation(['messages']);

    return (
        <div className="thread-list">
            <div className="thread-list-header">
                <div className="thread-list-title">
                    <HiOutlineInbox size={18} />
                    <span>{t('messages:list.inbox')}</span>
                    {unreadCount > 0 && <span className="unread-pill">{unreadCount}</span>}
                </div>
                <label className="toggle">
                    <input type="checkbox" checked={unreadOnly} onChange={onToggleUnread} />
                    <span>{t('messages:list.unreadOnly')}</span>
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
                        <p>{t('messages:list.emptyTitle')}</p>
                        <span className="text-muted">{t('messages:list.emptySubtitle')}</span>
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
                        <span className="thread-participants">{thread.participantsLabel || t('messages:list.parentFallback')}</span>
                        <span className="thread-preview">{thread.preview || t('messages:list.noMessages')}</span>
                        {thread.unreadCount > 0 && (
                            <span className="thread-unread">
                                {t('messages:list.newCount', { count: thread.unreadCount })}
                            </span>
                        )}
                    </button>
                ))}

                {loadingMore && <div className="loading-more">{t('messages:list.loadingMore')}</div>}
            </div>
        </div>
    );
};

export default ThreadList;
