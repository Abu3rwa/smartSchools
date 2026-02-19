import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';
import {
  Box,
  Button,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import PageContainer from '../../components/layout/PageContainer';
import AssignmentsTable from '../../components/substitutions/AssignmentsTable';
import Timeline from '../../components/substitutions/Timeline';
import StatusChip from '../../components/substitutions/StatusChip';
import {
  fetchSubRequestByIdThunk,
  cancelSubRequestThunk,
  selectDetail,
  respondToSubRequestAuthThunk,
  selectRespondInPortal,
} from '../../store/slices/substitutionsSlice';
import toast from 'react-hot-toast';

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const getPersonName = (p) => {
  if (!p) return '—';
  if (typeof p === 'object') {
    const first = p.firstName || '';
    const last = p.lastName || '';
    return `${first} ${last}`.trim() || p.email || '—';
  }
  return '—';
};

const getCoverageLabel = (coverageType) =>
  coverageType === 'SINGLE_TEACHER_ALL_PERIODS' ? 'Single teacher' : 'Per period';

const formatTime12 = (value) => {
  if (!value || typeof value !== 'string') return value || '';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
};

const formatTimeRange12 = (start, end) => {
  if (!start || !end) return '';
  return `${formatTime12(start)} - ${formatTime12(end)}`;
};

const getPeriodTitle = (p) => {
  const period = p?.periodId;
  if (!period) return '—';
  if (typeof period === 'object') {
    const name = period.name || 'Period';
    const start = p?.startTime || period.startTime;
    const end = p?.endTime || period.endTime;
    if (start && end) return `${name} (${formatTimeRange12(start, end)})`;
    return name;
  }
  return '—';
};

const getEntityName = (value, fallback = '—') => {
  if (!value) return fallback;
  if (typeof value === 'object') return value.name || fallback;
  return fallback;
};

const SummaryItem = ({ label, value }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2">
      <strong>{value}</strong>
    </Typography>
  </Box>
);

const SubRequestDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const { loading, error, item } = useSelector(selectDetail);
  const respondInPortal = useSelector(selectRespondInPortal);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [teacherNote, setTeacherNote] = useState('');
  const [teacherAction, setTeacherAction] = useState(null);

  useEffect(() => {
    if (id) dispatch(fetchSubRequestByIdThunk(id));
  }, [id, dispatch]);

  const handleCancel = () => {
    if (!id) return;
    setCancelling(true);
    dispatch(cancelSubRequestThunk({ id, note: cancelNote }))
      .then((result) => {
        if (cancelSubRequestThunk.fulfilled.match(result)) {
          toast.success('Request cancelled');
          setCancelModal(false);
          setCancelNote('');
        } else {
          toast.error(result.payload || 'Failed to cancel');
        }
      })
      .finally(() => setCancelling(false));
  };

  if (loading && !item) {
    return (
      <PageContainer>
        <Box sx={{ py: 3 }}>
          <Skeleton variant="text" width="40%" height={40} sx={{ mb: 2 }} />
          <Skeleton variant="rectangular" height={120} sx={{ mb: 2 }} />
          <Skeleton variant="rectangular" height={200} />
        </Box>
      </PageContainer>
    );
  }

  if (error && !item) {
    return (
      <PageContainer>
        <Alert severity="error" sx={{ mt: 3 }}>
          {error}
        </Alert>
        <Button onClick={() => navigate('/portal/substitutions')}>Back to list</Button>
      </PageContainer>
    );
  }

  if (!item) {
    return null;
  }

  const canCancel = item.status === 'SUBMITTED' && (user?.role === 'admin' || user?.role === 'department_principal');

  const isTeacher = user?.role === 'teacher';
  const displayAssignments = isTeacher && item.assignments
    ? item.assignments.filter((a) => {
        const subId = a.substituteTeacherId?._id || a.substituteTeacherId;
        return subId?.toString() === user?._id?.toString();
      })
    : item.assignments;

  const assignmentCounts = (displayAssignments || []).reduce(
    (acc, assignment) => {
      const status = assignment?.status || 'PENDING';
      if (status === 'CONFIRMED') acc.confirmed += 1;
      else if (status === 'DECLINED') acc.declined += 1;
      else acc.pending += 1;
      return acc;
    },
    { pending: 0, confirmed: 0, declined: 0 }
  );

  const hasPendingForTeacher =
    isTeacher &&
    (displayAssignments || []).some((assignment) => (assignment?.status || 'PENDING') === 'PENDING');

  const handleTeacherRespond = (action) => {
    if (!id || !hasPendingForTeacher) return;
    if (action === 'DECLINE' && !teacherNote.trim()) return;
    setTeacherAction(action);
    dispatch(
      respondToSubRequestAuthThunk({
        id,
        action,
        note: teacherNote.trim() || undefined,
      }),
    )
      .unwrap()
      .then(() => {
        toast.success(action === 'CONFIRM' ? 'Substitution confirmed' : 'Substitution declined');
      })
      .catch((err) => {
        toast.error(err || 'Failed to submit response');
      })
      .finally(() => {
        setTeacherAction(null);
      });
  };

  return (
    <PageContainer>
      <Box sx={{ py: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Typography variant="h4" gutterBottom>
              Sub Request Detail
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDate(item.date)} · {getPersonName(item.absentTeacherId)} · {getCoverageLabel(item.coverageType)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 1 }}>
            <StatusChip status={item.status} />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`Pending: ${assignmentCounts.pending}`} />
              <Chip size="small" color="success" label={`Confirmed: ${assignmentCounts.confirmed}`} />
              {assignmentCounts.declined > 0 && (
                <Chip size="small" color="error" label={`Declined: ${assignmentCounts.declined}`} />
              )}
            </Stack>
          </Box>
        </Box>

        <Box
          sx={{
            mb: 3,
            p: 2,
            borderRadius: 1,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          }}
        >
          <SummaryItem label="Created by" value={getPersonName(item.createdBy)} />
          <SummaryItem label="Created at" value={formatDateTime(item.createdAt)} />
          <SummaryItem label="Expires at" value={formatDateTime(item.expiresAt)} />
          <SummaryItem label="Coverage" value={getCoverageLabel(item.coverageType)} />
          <SummaryItem label="Absent teacher" value={getPersonName(item.absentTeacherId)} />
          <SummaryItem label="Request date" value={formatDate(item.date)} />
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Principal Note
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
            {item.principalNote || 'No note provided'}
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Subbing Materials
          </Typography>
          {item.materialsLink ? (
            <Typography variant="body2">
              <a href={item.materialsLink} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                {item.materialsLink}
              </a>
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No materials link provided
            </Typography>
          )}
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Requested Periods
          </Typography>
          {item.periods?.length ? (
            <TableContainer component={Paper} variant="outlined" sx={{ overflow: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Period</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell>Subject</TableCell>
                    <TableCell>Room</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {item.periods.map((period, idx) => (
                    <TableRow key={period?.periodId?._id || period?.periodId || idx}>
                      <TableCell>{getPeriodTitle(period)}</TableCell>
                      <TableCell>{getEntityName(period.classId)}</TableCell>
                      <TableCell>{getEntityName(period.subjectId)}</TableCell>
                      <TableCell>{getEntityName(period.roomId)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No period details available
            </Typography>
          )}
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Assignments ({displayAssignments?.length || 0})
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Manage which teachers are covering each period for this request.
          </Typography>
          <AssignmentsTable assignments={displayAssignments} showSubstituteColumn={!isTeacher} />
        </Box>

        {isTeacher && (
          <Box
            sx={{
              mb: 3,
              p: 2,
              borderRadius: 1,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Your response
            </Typography>
            {hasPendingForTeacher && item.status === 'SUBMITTED' ? (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Confirm if you can cover these periods, or decline with a short note.
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={4}
                  label="Your note (required to decline)"
                  placeholder="Add any context for the principal..."
                  value={teacherNote}
                  onChange={(e) => setTeacherNote(e.target.value)}
                  disabled={respondInPortal.loading}
                  sx={{ mb: 2 }}
                />
                <Stack direction="row" spacing={1.5} flexWrap="wrap" justifyContent="flex-end">
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => handleTeacherRespond('DECLINE')}
                    disabled={respondInPortal.loading || !teacherNote.trim()}
                  >
                    {respondInPortal.loading && teacherAction === 'DECLINE'
                      ? 'Submitting...'
                      : 'Decline'}
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => handleTeacherRespond('CONFIRM')}
                    disabled={respondInPortal.loading}
                  >
                    {respondInPortal.loading && teacherAction === 'CONFIRM'
                      ? 'Submitting...'
                      : 'Confirm'}
                  </Button>
                </Stack>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                You have already responded to this request.
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Timeline
          </Typography>
          <Timeline timeline={item.timeline} />
        </Box>

        <Box
          sx={{
            mt: 2,
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          <Button variant="text" onClick={() => navigate('/portal/substitutions')}>
            Back to list
          </Button>
          {canCancel && (
            <Button variant="outlined" color="error" onClick={() => setCancelModal(true)}>
              Cancel Request
            </Button>
          )}
        </Box>
      </Box>

      <Dialog open={cancelModal} onClose={() => !cancelling && setCancelModal(false)}>
        <DialogTitle>Cancel Substitution Request</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Note (optional)"
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            disabled={cancelling}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => !cancelling && setCancelModal(false)} disabled={cancelling}>
            Close
          </Button>
          <Button color="error" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling...' : 'Cancel Request'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};

export default SubRequestDetail;
