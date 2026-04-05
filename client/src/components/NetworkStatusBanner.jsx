import { useState, useEffect } from 'react';

const NetworkStatusBanner = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#92400e',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: '0.875rem',
        fontWeight: 500,
      }}
    >
      You are offline. Changes will sync when your connection returns.
    </div>
  );
};

export default NetworkStatusBanner;
