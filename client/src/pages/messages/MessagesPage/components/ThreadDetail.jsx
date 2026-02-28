import { HiOutlineChatAlt2 } from 'react-icons/hi';
import { formatTimestamp } from '../utils/messagePresentation';

const ThreadDetail = ({
    selectedThread,
    threadDetail,
    loadingDetail,
    groupedThreadMessages,
    showOlderMessages,
    showYesterdayMessages,
    onToggleOlder,
    onToggleYesterday,
    messageListRef,
    messageListEndRef,
    onBack,
    replyBody,
    onReplyBodyChange,
    onSendReply,
    sendingReply
}) => {
    const grouped = groupedThreadMessages || { older: [], yesterday: [], today: [] };

    return (
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
                            <button type="button" className="detail-back" onClick={onBack}>
                                Back to conversations
                            </button>
                            <h2>{threadDetail.thread?.subject || selectedThread.subject}</h2>
                            <p className="text-muted">
                                {threadDetail.thread?.participantsLabel || selectedThread.participantsLabel}
                            </p>
                        </div>
                        {threadDetail.thread?.isClosed && <span className="closed-pill">Closed</span>}
                    </div>
                    <div className="message-list" ref={messageListRef}>
                        {grouped.older.length > 0 && (
                            <div className="message-section">
                                <button type="button" className="message-section-toggle" onClick={onToggleOlder}>
                                    <span>{showOlderMessages ? 'Hide older messages' : 'Show older messages'}</span>
                                    <span className="message-section-count">{grouped.older.length}</span>
                                </button>
                                {showOlderMessages &&
                                    grouped.older.map((message) => (
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

                        {grouped.yesterday.length > 0 && (
                            <div className="message-section">
                                <button type="button" className="message-section-toggle" onClick={onToggleYesterday}>
                                    <span>{showYesterdayMessages ? 'Hide yesterday messages' : 'Show yesterday messages'}</span>
                                    <span className="message-section-count">{grouped.yesterday.length}</span>
                                </button>
                                {showYesterdayMessages &&
                                    grouped.yesterday.map((message) => (
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
                                <span className="message-section-count">{grouped.today.length}</span>
                            </div>
                            {grouped.today.map((message) => (
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
                            {grouped.today.length === 0 && (
                                <div className="thread-empty compact">
                                    <p>No messages today yet.</p>
                                </div>
                            )}
                        </div>
                        <div ref={messageListEndRef} />
                    </div>
                    {threadDetail.thread?.isClosed ? (
                        <div className="reply-closed">This conversation is closed.</div>
                    ) : (
                        <div className="reply-box">
                            <textarea
                                value={replyBody}
                                onChange={onReplyBodyChange}
                                placeholder="Type your reply..."
                                rows={3}
                            />
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={onSendReply}
                                disabled={sendingReply || replyBody.trim().length === 0}
                            >
                                {sendingReply ? 'Sending...' : 'Send Reply'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ThreadDetail;