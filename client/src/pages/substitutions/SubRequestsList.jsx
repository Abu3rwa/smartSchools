import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';
import {
  Box,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  MenuItem,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  Typography,
} from '@mui/material';
import toast from 'react-hot-toast';
import PageContainer from '../../components/layout/PageContainer';
import StatusChip from '../../components/substitutions/StatusChip';
import {
  fetchSubRequestsThunk,
  cancelSubRequestThunk,
  selectList,
} from '../../store/slices/substitutionsSlice';
import {
  fetchTeachers,
  selectTeachers,
  selectTeachersLoading,
} from '../../store/slices/teacherSlice';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
];

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

const SubRequestsList = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, items, pagination } = useSelector(selectList);
  const teachers = useSelector(selectTeachers);
  const teachersLoading = useSelector(selectTeachersLoading);
  const user = useSelector(selectUser);
  const canCreate = user?.role === 'admin' || user?.role === 'department_principal';

  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [substituteTeacherId, setSubstituteTeacherId] = useState('');
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (canCreate) dispatch(fetchTeachers());
  }, [dispatch, canCreate]);

  const loadRequests = () => {
    const filters = {};
    if (statusFilter) filters.status = statusFilter;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (absentTeacherId) filters.absentTeacherId = absentTeacherId;
    if (substituteTeacherId) filters.substituteTeacherId = substituteTeacherId;
    filters.limit = 50;
    dispatch(fetchSubRequestsThunk(filters));
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const teacherOptions = teachers
    .filter((t) => t.user)
    .map((t) => ({ id: t.user._id, name: `${t.user.firstName || ''} ${t.user.lastName || ''}`.trim() }));

  const handleCancel = () => {
    if (!cancelModal) return;
    setCancelling(true);
    dispatch(cancelSubRequestThunk({ id: cancelModal._id, note: cancelNote }))
      .then((result) => {
        if (cancelSubRequestThunk.fulfilled.match(result)) {
          toast.success('Request cancelled');
          setCancelModal(null);
          setCancelNote('');
          loadRequests();
        } else {
          toast.error(result.payload || 'Failed to cancel');
        }
      })
      .finally(() => setCancelling(false));
  };

  return (
    <PageContainer>
      <Box sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Box>
            <h1 style={{ marginBottom: 8, fontSize: '1.75rem' }}>Sub Requests List</h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              View and manage substitution requests.
            </p>
          </Box>
          {canCreate && (
            <Button variant="contained" onClick={() => navigate('/portal/substitutions/create')}>
              Create Sub Request
            </Button>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField
            select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 140 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <MenuItem key={o.value || 'all'} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 140 }}
          />
          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 140 }}
          />
          {canCreate && (
            <>
              <TextField
                select
                label="Absent Teacher"
                value={absentTeacherId}
                onChange={(e) => setAbsentTeacherId(e.target.value)}
                size="small"
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">All</MenuItem>
                {teacherOptions.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name || 'Unknown'}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Substitute Teacher"
                value={substituteTeacherId}
                onChange={(e) => setSubstituteTeacherId(e.target.value)}
                size="small"
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">All</MenuItem>
                {teacherOptions.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name || 'Unknown'}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
          <Button variant="contained" onClick={loadRequests} disabled={loading}>
            {loading ? <CircularProgress size={22} /> : 'Apply Filters'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && items.length === 0 ? (
          <Box sx={{ py: 2 }}>
            <Skeleton variant="rectangular" height={48} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={200} />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              {(statusFilter || startDate || endDate || (canCreate && (absentTeacherId || substituteTeacherId)))
                ? 'No requests match your filters. Try adjusting or clearing filters.'
                : 'No substitution requests found.'}
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Absent Teacher</TableCell>
                  <TableCell>Coverage Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created By</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r._id} hover>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell>{getPersonName(r.absentTeacherId)}</TableCell>
                    <TableCell>
                      {r.coverageType === 'SINGLE_TEACHER_ALL_PERIODS' ? 'Single' : 'Per period'}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={r.status} />
                    </TableCell>
                    <TableCell>{getPersonName(r.createdBy)}</TableCell>
                    <TableCell>{formatDate(r.updatedAt)}</TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => navigate(`/portal/substitutions/${r._id}`)}>
                        View
                      </Button>
                      {r.status === 'SUBMITTED' && (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => setCancelModal(r)}
                          sx={{ ml: 1 }}
                        >
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Dialog open={!!cancelModal} onClose={() => !cancelling && setCancelModal(null)}>
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
            <Button onClick={() => !cancelling && setCancelModal(null)} disabled={cancelling}>
              Close
            </Button>
            <Button color="error" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling...' : 'Cancel Request'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </PageContainer>
  );
};

export default SubRequestsList;
