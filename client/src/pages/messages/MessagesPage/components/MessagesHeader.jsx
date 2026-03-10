import { HiOutlinePlus, HiOutlineRefresh } from 'react-icons/hi';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const MessagesHeader = ({
    realtimeConnected,
    lastUpdatedAt,
    onRefresh,
    onCompose,
    showComposeButton
}) => (
}) => {
    const { t } = useTranslation(['messages']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('messages:header.title')}</h1>
                <p className="text-muted">{t('messages:header.subtitle')}</p>
            </div>
            <div className="messages-header-actions">
                <span className={`messages-live-pill ${realtimeConnected ? 'online' : 'offline'}`}>
                    <span className="messages-live-dot" />
                    {realtimeConnected ? t('messages:header.live') : t('messages:header.offline')}
                </span>
                {lastUpdatedAt && (
                    <span className="messages-updated text-muted">
                        {t('messages:header.updatedAt', { time: format(lastUpdatedAt, 'HH:mm') })}
                    </span>
                )}
                <button className="btn btn-secondary" onClick={onRefresh}>
                    <HiOutlineRefresh size={18} />
                    {t('messages:header.refresh')}
                </button>
                {showComposeButton && (
                    <button className="btn btn-primary" onClick={onCompose}>
                        <HiOutlinePlus size={18} />
                        {t('messages:header.newMessage')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default MessagesHeader;
