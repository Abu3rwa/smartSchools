import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import {
  respondToSubRequestThunk,
  selectRespond,
  clearRespondState,
} from '../../store/slices/substitutionsSlice';

const SubstitutionRespond = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const dispatch = useDispatch();
  const { loading, error, success, lastRequest } = useSelector(selectRespond);
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');

  const hasToken = useMemo(() => !!token, [token]);

  const handleRespond = (act) => {
    if (!token) return;
    if (act === 'DECLINE' && !note.trim()) return;
    setAction(act);
    dispatch(respondToSubRequestThunk({ token, action: act, note: note.trim() || undefined }));
  };

  if (!hasToken) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          background: 'var(--bg-primary, #0f0f1a)',
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 400, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            Invalid link
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No token provided. Please use the link from the email you received.
          </Typography>
          <Button component={Link} to="/" variant="contained">
            Go to dashboard
          </Button>
        </Paper>
      </Box>
    );
  }

  if (success) {
    const getPersonName = (p) => {
      if (!p || typeof p !== 'object') return '—';
      return `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || '—';
    };
    const dateStr = lastRequest?.date
      ? new Date(lastRequest.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : '';
    const absentName = getPersonName(lastRequest?.absentTeacherId);

    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          background: 'var(--bg-primary, #0f0f1a)',
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 440, textAlign: 'center' }}>
          <Typography variant="h6" color="success.main" gutterBottom>
            Response recorded
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Thank you for your response.
          </Typography>
          {absentName && dateStr && (
            <Typography variant="body2" sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <strong>{absentName}</strong> on {dateStr}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button component={Link} to="/portal" variant="contained">
              Go to portal
            </Button>
            <Button component={Link} to="/portal/substitutions" variant="outlined">
              My sub requests
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        background: 'var(--bg-primary, #0f0f1a)',
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 440 }}>
        <Typography variant="h6" gutterBottom>
          Substitution Request
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          You have been selected as a substitute teacher. Please confirm or decline below.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          multiline
          rows={3}
          label="Note (required for Decline)"
          placeholder="Add a note..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={loading}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => handleRespond('DECLINE')}
            disabled={loading || !note.trim()}
            sx={{ minHeight: 44 }}
          >
            {loading && action === 'DECLINE' ? <CircularProgress size={22} /> : 'Decline'}
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => handleRespond('CONFIRM')}
            disabled={loading}
            sx={{ minHeight: 44 }}
          >
            {loading && action === 'CONFIRM' ? <CircularProgress size={22} /> : 'Confirm'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default SubstitutionRespond;
