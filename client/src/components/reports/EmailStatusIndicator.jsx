import React from 'react';
import './ReportComponents.css';

const EmailStatusIndicator = ({ status, message }) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'sent':
        return { className: 'sent', label: 'Sent', icon: '✓' };
      case 'failed':
        return { className: 'failed', label: 'Failed', icon: '✗' };
      case 'pending':
        return { className: 'pending', label: 'Pending', icon: '⏳' };
      case 'bounced':
        return { className: 'failed', label: 'Bounced', icon: '⚠' };
      default:
        return { className: 'pending', label: 'Unknown', icon: '?' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`email-status-indicator ${statusInfo.className}`}>
      <span className={`status-dot ${statusInfo.className}`}></span>
      <span>{statusInfo.label}</span>
      {message && (
        <span style={{ marginLeft: '8px', opacity: 0.7 }}>{message}</span>
      )}
    </div>
  );
};

export default EmailStatusIndicator;
