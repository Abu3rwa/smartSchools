import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Chip,
  LinearProgress,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { HiOutlineArrowLeft, HiOutlineCalendar, HiOutlineCheck } from 'react-icons/hi';
import { format, isToday, isPast } from 'date-fns';
import {
  fetchPlan,
  updatePlanProgress,
  selectCurrentPlan,
  selectRevisionLoading,
  selectRevisionError,
  clearCurrentPlan,
} from '../store/slices/revisionSlice';
import { selectUser } from '../store/slices/authSlice';
import toast from 'react-hot-toast';

const RevisionPlanViewPage = () => {
  const { planId } = useParams();
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const plan = useSelector(selectCurrentPlan);
  const loading = useSelector(selectRevisionLoading);
  const error = useSelector(selectRevisionError);
  const user = useSelector(selectUser);
  const [updating, setUpdating] = useState(false);
  const isStudent = user?.role === 'student';

  useEffect(() => {
    if (planId) dispatch(fetchPlan(planId));
    return () => dispatch(clearCurrentPlan());
  }, [dispatch, planId]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const handleTopicComplete = async (topicIndex, completed) => {
    if (!planId || !isStudent) return;
    setUpdating(true);
    try {
      await dispatch(
        updatePlanProgress({
          planId,
          body: { topicIndex, completed },
        })
      ).unwrap();
      toast.success(completed ? 'Topic marked complete' : 'Topic unchecked');
    } catch (e) {
      toast.error(e || 'Failed to update');
    }
    setUpdating(false);
  };

  const completedTopics = plan?.topics?.filter((t) => t.completed).length ?? 0;
  const totalTopics = plan?.topics?.length ?? 0;
  const progressPct = totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0;

  if (loading && !plan) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!plan) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Plan not found.</Typography>
        <Button onClick={() => navigate('/portal/revision')} sx={{ mt: 2 }}>
          Back to plans
        </Button>
      </Box>
    );
  }


  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Button
        startIcon={<HiOutlineArrowLeft size={18} />}
        onClick={() => navigate('/portal/revision')}
        sx={{ mb: 2 }}
      >
        Back
      </Button>

      <Box sx={{ mb: 3 }}>
        <Box display="flex" flexWrap="wrap" alignItems="center" gap={1} mb={1}>
          <Typography variant="h4" fontWeight={700}>
            {plan.examLabel || plan.subject?.name || 'Revision Plan'}
          </Typography>
          <Chip
            label={plan.status}
            size="small"
            color={plan.status === 'active' ? 'primary' : plan.status === 'completed' ? 'success' : 'default'}
            sx={{ textTransform: 'capitalize' }}
          />
        </Box>
        <Typography color="text.secondary">
          {plan.subject?.name} • Exam: {plan.examDate && format(new Date(plan.examDate), 'EEEE, MMM d, yyyy')}
          {plan.student && (
            <> • {plan.student.firstName} {plan.student.lastName}</>
          )}
        </Typography>
        {plan.daysUntilExam != null && plan.status === 'active' && (
          <Typography variant="body2" color="primary" sx={{ mt: 0.5 }}>
            {plan.daysUntilExam} days until exam
          </Typography>
        )}
      </Box>

      {/* Progress */}
      <Paper sx={{ p: 2, mb: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Overall progress
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progressPct}
          sx={{ height: 8, borderRadius: 1, mb: 1 }}
        />
        <Typography variant="body2">
          {completedTopics} of {totalTopics} topics completed ({progressPct}%)
        </Typography>
      </Paper>

      {/* Topics checklist */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Topics
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(plan.topics || []).map((topic, idx) => (
          <Grid item xs={12} sm={6} key={topic.standard?._id || idx}>
            <Card sx={{ border: `1px solid ${theme.palette.divider}` }}>
              <CardContent>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={!!topic.completed}
                      disabled={updating || !isStudent}
                      onChange={(e) => handleTopicComplete(idx, e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {topic.standard?.name || topic.standard?.code || `Topic ${idx + 1}`}
                    </Typography>
                  }
                />
                <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
                  <Chip size="small" label={`${topic.masteryLevel ?? 0}% mastery`} variant="outlined" />
                  <Chip size="small" label={`${topic.allocatedMinutes ?? 0} min`} variant="outlined" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Daily schedule */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Daily schedule
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {(plan.dailySchedule || []).slice(0, 14).map((day, dayIdx) => {
          const d = day.date ? new Date(day.date) : null;
          const isPastDay = d && isPast(d) && !isToday(d);
          return (
            <Accordion
              key={dayIdx}
              defaultExpanded={dayIdx < 3}
              sx={{
                border: `1px solid ${theme.palette.divider}`,
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary>
                <Box display="flex" alignItems="center" gap={1}>
                  <HiOutlineCalendar size={18} />
                  <Typography fontWeight={500}>
                    {d ? format(d, 'EEE, MMM d') : `Day ${dayIdx + 1}`}
                  </Typography>
                  {isPastDay && (
                    <Chip label="Past" size="small" variant="outlined" />
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {(!day.slots || day.slots.length === 0) ? (
                  <Typography variant="body2" color="text.secondary">
                    No slots
                  </Typography>
                ) : (
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {day.slots.map((slot, slotIdx) => (
                      <li key={slotIdx}>
                        <Typography variant="body2">
                          {slot.standard?.name || slot.standard?.code || 'Topic'} — {slot.minutes} min
                          {slot.completed && (
                            <Chip
                              icon={<HiOutlineCheck size={14} />}
                              label="Done"
                              size="small"
                              color="success"
                              sx={{ ml: 1 }}
                            />
                          )}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      {/* Milestones */}
      {plan.milestones?.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
            Milestones
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {plan.milestones.map((m, i) => (
              <Chip
                key={i}
                label={`${m.label} ${m.achieved ? '✓' : ''}`}
                color={m.achieved ? 'success' : 'default'}
                variant={m.achieved ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

export default RevisionPlanViewPage;
