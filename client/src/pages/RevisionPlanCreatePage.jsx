import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Grid,
} from '@mui/material';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { generatePlan, selectRevisionGenerating, selectRevisionError, selectCurrentPlan, clearCurrentPlan } from '../store/slices/revisionSlice';
import { selectUser } from '../store/slices/authSlice';
import { fetchSubjects } from '../store/slices/subjectSlice';
import { fetchStudents } from '../store/slices/studentSlice';
import { selectSubjects } from '../store/slices/subjectSlice';
import { selectStudents } from '../store/slices/studentSlice';
import toast from 'react-hot-toast';

const RevisionPlanCreatePage = () => {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const subjects = useSelector(selectSubjects) || [];
  const students = useSelector(selectStudents) || [];
  const generating = useSelector(selectRevisionGenerating);
  const error = useSelector(selectRevisionError);
  const currentPlan = useSelector(selectCurrentPlan);

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';

  const [subjectId, setSubjectId] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examLabel, setExamLabel] = useState('');
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    dispatch(clearCurrentPlan());
    dispatch(fetchSubjects());
    if (isTeacher) dispatch(fetchStudents());
  }, [dispatch, isTeacher]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (currentPlan?._id) {
      navigate(`/portal/revision/${currentPlan._id}`);
    }
  }, [currentPlan, navigate]);

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subjectId || !examDate) {
      toast.error('Subject and exam date are required');
      return;
    }
    if (isTeacher && !studentId) {
      toast.error('Please select a student');
      return;
    }
    dispatch(
      generatePlan({
        subjectId,
        examDate: new Date(examDate).toISOString(),
        examLabel: examLabel || undefined,
        ...(isTeacher && { studentId }),
      })
    );
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 640, mx: 'auto' }}>
      <Button
        startIcon={<HiOutlineArrowLeft size={18} />}
        onClick={() => navigate('/portal/revision')}
        sx={{ mb: 2 }}
      >
        Back
      </Button>

      <Typography variant="h4" fontWeight={700} gutterBottom>
        Create Revision Plan
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {isTeacher
          ? 'Generate a personalized revision plan for a student.'
          : 'Get a study schedule based on your weak areas.'}
      </Typography>

      <Paper sx={{ p: { xs: 2, sm: 3 }, border: `1px solid ${theme.palette.divider}` }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            {isTeacher && (
              <Grid item xs={12}>
                <FormControl fullWidth required>
                  <InputLabel>Student</InputLabel>
                  <Select
                    value={studentId}
                    label="Student"
                    onChange={(e) => setStudentId(e.target.value)}
                  >
                    <MenuItem value="">Select student</MenuItem>
                    {students.map((s) => (
                      <MenuItem key={s._id} value={s._id}>
                        {s.firstName} {s.lastName}
                        {s.studentId ? ` (${s.studentId})` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Subject</InputLabel>
                <Select
                  value={subjectId}
                  label="Subject"
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <MenuItem value="">Select subject</MenuItem>
                  {subjects.map((s) => (
                    <MenuItem key={s._id} value={s._id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Exam date"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                inputProps={{ min: minDateStr }}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Exam name (optional)"
                value={examLabel}
                onChange={(e) => setExamLabel(e.target.value)}
                placeholder="e.g. Midterm, Final"
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={generating}
                startIcon={generating ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {generating ? 'Generating plan…' : 'Generate plan'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
};

export default RevisionPlanCreatePage;
