import { HiOutlineX } from 'react-icons/hi';
import { format } from 'date-fns';
import DOMPurify from 'isomorphic-dompurify';
import { useTranslation } from 'react-i18next';

const NotificationDetailsModal = ({
  notification,
  onClose,
  getStatusIcon,
  getTypeLabel,
  getStatusLabel,
}) => {
  const { t } = useTranslation(['notifications']);
  if (!notification) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="email-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="email-modal-header">
          <h2 id="notification-details-title">{t('notifications:modal.title')}</h2>
          <button className="icon-btn muted" onClick={onClose} aria-label={t('notifications:modal.closeAria')}>
            <HiOutlineX size={24} />
          </button>
        </div>
        <div className="email-modal-body">
          <div className="email-meta">
            <div className="meta-row">
              <span className="meta-label">{t('notifications:modal.status')}:</span>
              <span className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getStatusIcon(notification.status)}
                {getStatusLabel(notification.status, t)}
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">{t('notifications:modal.type')}:</span>
              <span className="meta-value notification-type">{getTypeLabel(notification.type, t)}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">{t('notifications:modal.date')}:</span>
              <span className="meta-value">{format(new Date(notification.createdAt), 'PPpp')}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">{t('notifications:modal.recipient')}:</span>
              <span className="meta-value">{notification.recipientEmail}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">{t('notifications:modal.student')}:</span>
              <span className="meta-value">{notification.student?.firstName} {notification.student?.lastName}</span>
            </div>
          </div>

          <hr className="email-divider" />

          <div className="email-content">
            <h3>{notification.subject}</h3>
            <div className="email-body-text">
              {(notification.htmlContent || notification.body) ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(notification.htmlContent || notification.body),
                  }}
                />
              ) : notification.message ? (
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {notification.message}
                </p>
              ) : (
                <p className="text-muted">{t('notifications:modal.noContent')}</p>
              )}
            </div>
            {notification.error && (
              <div className="email-error">
                <strong>{t('notifications:modal.errorProcessing')}:</strong>
                <p>{notification.error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationDetailsModal;
