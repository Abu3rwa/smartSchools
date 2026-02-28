import { HiOutlineX } from 'react-icons/hi';
import { format } from 'date-fns';

const NotificationDetailsModal = ({
  notification,
  onClose,
  getStatusIcon,
  getTypeLabel,
}) => {
  if (!notification) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="email-modal" onClick={(e) => e.stopPropagation()}>
        <div className="email-modal-header">
          <h2>Notification Details</h2>
          <button className="icon-btn muted" onClick={onClose}>
            <HiOutlineX size={24} />
          </button>
        </div>
        <div className="email-modal-body">
          <div className="email-meta">
            <div className="meta-row">
              <span className="meta-label">Status:</span>
              <span className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getStatusIcon(notification.status)}
                {notification.status}
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Type:</span>
              <span className="meta-value notification-type">{getTypeLabel(notification.type)}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Date:</span>
              <span className="meta-value">{format(new Date(notification.createdAt), 'PPpp')}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Recipient:</span>
              <span className="meta-value">{notification.recipientEmail}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Student:</span>
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
                    __html: notification.htmlContent || notification.body,
                  }}
                />
              ) : notification.message ? (
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {notification.message}
                </p>
              ) : (
                <p className="text-muted">No content available.</p>
              )}
            </div>
            {notification.error && (
              <div className="email-error">
                <strong>Error processing message:</strong>
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
