import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  CircularProgress,
  useTheme,
  useMediaQuery,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  HiOutlinePlus,
  HiOutlineCalendar,
  HiOutlineUser,
  HiOutlineAcademicCap,
} from 'react-icons/hi';
import { format } from 'date-fns';
import {
  fetchMyPlans,
  fetchTeacherPlans,
  selectRevisionPlans,
  selectRevisionLoading,
  selectRevisionError,
} from '../store/slices/revisionSlice';
import { selectUser } from '../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import toast from 'react-hot-toast';

const RevisionPlansListPage = () => {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down('sm'));
  const isMd = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const plans = useSelector(selectRevisionPlans);
  const loading = useSelector(selectRevisionLoading);
  const error = useSelector(selectRevisionError);

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const isStudent = user?.role === 'student';

  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (isStudent) {
      dispatch(fetchMyPlans(statusFilter || undefined));
    } else if (isTeacher) {
      dispatch(fetchTeacherPlans({ status: statusFilter || undefined, academicYear }));
    }
  }, [dispatch, isStudent, isTeacher, statusFilter, academicYear]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const handleCreate = () => {
    navigate(isTeacher ? '/portal/revision/create' : '/portal/revision/create');
  };

  const getStatusColor = (status) => {
    if (status === 'active') return 'primary';
    if (status === 'completed') return 'success';
    return 'default';
  };

  const list = Array.isArray(plans) ? plans : [];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Revision Plans
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {isStudent
              ? 'Your personalized exam revision plans'
              : 'View and manage revision plans for your students'}
            {academicYear ? ` (${academicYear})` : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {isTeacher && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="abandoned">Abandoned</MenuItem>
              </Select>
            </FormControl>
          )}
          <Button
            variant="contained"
            startIcon={<HiOutlinePlus size={20} />}
            onClick={handleCreate}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {isStudent ? 'New Plan' : 'Create Plan'}
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : list.length === 0 ? (
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <HiOutlineCalendar size={56} style={{ color: theme.palette.text.secondary, marginBottom: 16 }} />
          <Typography variant="h6" gutterBottom>
            No revision plans yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {isStudent
              ? 'Create a plan to get a personalized study schedule before your exam.'
              : 'Create a revision plan for a student to get started.'}
          </Typography>
          <Button variant="contained" onClick={handleCreate} startIcon={<HiOutlinePlus size={18} />}>
            Create plan
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {list.map((plan) => (
            <Grid item xs={12} sm={6} md={4} key={plan._id}>
              <Card
                sx={{
                  height: '100%',
                  border: `1px solid ${theme.palette.divider}`,
                  '&:hover': { borderColor: theme.palette.primary.main },
                }}
              >
                <CardActionArea
                  onClick={() => navigate(`/portal/revision/${plan._id}`)}
                  sx={{ height: '100%', display: 'block', textAlign: 'left' }}
                >
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                      <Typography variant="h6" noWrap sx={{ flex: 1, pr: 1 }}>
                        {plan.examLabel || plan.subject?.name || 'Revision Plan'}
                      </Typography>
                      <Chip
                        label={plan.status}
                        size="small"
                        color={getStatusColor(plan.status)}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {plan.subject?.name} • Exam: {plan.examDate && format(new Date(plan.examDate), 'MMM d, yyyy')}
                    </Typography>
                    {isTeacher && plan.student && (
                      <Box display="flex" alignItems="center" gap={0.5} mt={1}>
                        <HiOutlineUser size={14} />
                        <Typography variant="caption" color="text.secondary">
                          {plan.student.firstName} {plan.student.lastName}
                          {plan.student.studentId && ` (${plan.student.studentId})`}
                        </Typography>
                      </Box>
                    )}
                    {plan.daysUntilExam != null && plan.status === 'active' && (
                      <Typography variant="caption" color="primary" display="block" mt={1}>
                        {plan.daysUntilExam} days until exam
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default RevisionPlansListPage;
