import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import PageContainer from '../../components/layout/PageContainer';
import AssignmentsTable from '../../components/substitutions/AssignmentsTable';
import Timeline from '../../components/substitutions/Timeline';
import StatusChip from '../../components/substitutions/StatusChip';
import {
  fetchSubRequestByIdThunk,
  cancelSubRequestThunk,
  selectDetail,
} from '../../store/slices/substitutionsSlice';
import toast from 'react-hot-toast';

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const getPersonName = (p) => {
  if (!p) return '—';
  if (typeof p === 'object') {
    const first = p.firstName || '';
    const last = p.lastName || '';
    return `${first} ${last}`.trim() || p.email || '—';
  }
  return '—';
};

const SubRequestDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const { loading, error, item } = useSelector(selectDetail);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

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
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
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

  return (
    <PageContainer>
      <Box sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="h4" gutterBottom>
              Sub Request Detail
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDate(item.date)} · {getPersonName(item.absentTeacherId)} ·{' '}
              {item.coverageType === 'SINGLE_TEACHER_ALL_PERIODS' ? 'Single teacher' : 'Per period'}
            </Typography>
          </Box>
          <StatusChip status={item.status} />
        </Box>

        {item.principalNote && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Principal Note
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {item.principalNote}
            </Typography>
          </Box>
        )}

        {item.materialsLink && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Subbing Materials
            </Typography>
            <Typography variant="body2">
              <a href={item.materialsLink} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                {item.materialsLink}
              </a>
            </Typography>
          </Box>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Assignments
          </Typography>
          <AssignmentsTable assignments={displayAssignments} showSubstituteColumn={!isTeacher} />
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Timeline
          </Typography>
          <Timeline timeline={item.timeline} />
        </Box>

        {canCancel && (
          <Button variant="outlined" color="error" onClick={() => setCancelModal(true)}>
            Cancel Request
          </Button>
        )}

        <Button sx={{ ml: 2 }} onClick={() => navigate('/portal/substitutions')}>
          Back to list
        </Button>
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
