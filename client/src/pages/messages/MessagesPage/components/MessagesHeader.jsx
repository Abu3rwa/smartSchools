import { HiOutlinePlus, HiOutlineRefresh } from 'react-icons/hi';
import { format } from 'date-fns';

const MessagesHeader = ({
    realtimeConnected,
    lastUpdatedAt,
    onRefresh,
    onCompose,
    showComposeButton
}) => (
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
            <button className="btn btn-secondary" onClick={onRefresh}>
                <HiOutlineRefresh size={18} />
                Refresh
            </button>
            {showComposeButton && (
                <button className="btn btn-primary" onClick={onCompose}>
                    <HiOutlinePlus size={18} />
                    New Message
                </button>
            )}
        </div>
    </div>
);

export default MessagesHeader;