import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../config/api';
import { selectIsAuthenticated } from '../store/slices/authSlice';

const GoogleReauthPrompt = () => {
  const location = useLocation();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleReconnectRequired = () => {
      setError('');
      setOpen(true);
    };
    window.addEventListener('google-reauth-required', handleReconnectRequired);
    return () => window.removeEventListener('google-reauth-required', handleReconnectRequired);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reconnectError = params.get('gmail_error');
    if (!reconnectError) return;
    setError(reconnectError === 'access_denied'
      ? 'Google sign-in was cancelled. Reconnect to send email from your own account.'
      : `Google sign-in could not be completed (${reconnectError}). Please try again.`);
    setOpen(true);
  }, [location.search]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let checking = false;
    const checkGoogleAuthorization = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const response = await api.get('/auth/gmail/status');
        if (response.data?.requiresReauth) {
          window.dispatchEvent(new CustomEvent('google-reauth-required'));
        }
      } catch {
        // Sending actions surface authorization errors directly; this monitor only checks refresh-token health.
      } finally {
        checking = false;
      }
    };
    void checkGoogleAuthorization();
    const intervalId = window.setInterval(() => void checkGoogleAuthorization(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', checkGoogleAuthorization);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkGoogleAuthorization);
    };
  }, [isAuthenticated]);

  const reconnectGoogle = async () => {
    setConnecting(true);
    setError('');
    try {
      const returnTo = location.pathname === '/portal/spelling'
        ? 'spelling'
        : location.pathname === '/portal/notifications' ? 'notifications' : 'settings';
      const response = await api.get('/auth/gmail/url', { params: { returnTo } });
      const authUrl = response.data?.authUrl;
      if (!authUrl) throw new Error('Google did not provide a sign-in link. Please try again.');
      window.location.assign(authUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to start Google sign-in.');
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !connecting && setOpen(false)} aria-labelledby="google-reauth-title">
      <DialogTitle id="google-reauth-title">Reconnect your Google account</DialogTitle>
      <DialogContent>
        <p>
          Your Google authorization is missing, expired, or no longer allows email sending. The email was not sent.
          Sign in again to send as your own account, then retry. The app will not send it from an administrator or SMTP account.
        </p>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)} disabled={connecting}>Not now</Button>
        <Button onClick={() => void reconnectGoogle()} variant="contained" disabled={connecting}>
          {connecting ? 'Connecting…' : 'Sign in with Google'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GoogleReauthPrompt;
