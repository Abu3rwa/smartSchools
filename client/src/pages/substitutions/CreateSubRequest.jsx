import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box,
  Button,
  TextField,
  Autocomplete,
  Alert,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
} from '@mui/material';
import PageContainer from '../../components/layout/PageContainer';
import {
  fetchTeachers,
  selectTeachers,
  selectTeachersLoading,
} from '../../store/slices/teacherSlice';
import {
  fetchSubCandidates,
  createSubRequestThunk,
  selectCandidates,
  selectCreate,
  clearCreateState,
} from '../../store/slices/substitutionsSlice';
import toast from 'react-hot-toast';

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const CreateSubRequest = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const teachers = useSelector(selectTeachers);
  const teachersLoading = useSelector(selectTeachersLoading);
  const { loading: candidatesLoading, error: candidatesError, data: candidatesData } = useSelector(selectCandidates);
  const { loading: createLoading, error: createError, success, requestId } = useSelector(selectCreate);

  const [absentTeacher, setAbsentTeacher] = useState(null);
  // Set default date to tomorrow
  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };
  const [date, setDate] = useState(getTomorrowDate());
  const [coverageType, setCoverageType] = useState('SINGLE_TEACHER_ALL_PERIODS');
  const [singleSubstitute, setSingleSubstitute] = useState(null);
  const [perPeriodSelections, setPerPeriodSelections] = useState({});
  const [principalNote, setPrincipalNote] = useState('');
  const [materialsLink, setMaterialsLink] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    dispatch(fetchTeachers());
  }, [dispatch]);

  useEffect(() => {
    if (success && requestId) {
      toast.success('Substitution request created successfully.');
      dispatch(clearCreateState());
      navigate(`/portal/substitutions/${requestId}`);
    }
  }, [success, requestId, dispatch, navigate]);

  const teacherOptions = teachers
    .filter((t) => t.user?.firstName || t.user?.lastName)
    .map((t) => ({
      _id: t.user?._id,
      name: `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim() || t.employeeId || 'Unknown',
      label: `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim() || t.employeeId || 'Unknown',
    }));

  const handleLoadCandidates = () => {
    if (!absentTeacher?._id || !date) {
      toast.error('Please select absent teacher and date.');
      return;
    }
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) {
      toast.error('Date cannot be in the past.');
      return;
    }
    setLoaded(false);
    dispatch(fetchSubCandidates({ absentTeacherId: absentTeacher._id, date })).then((result) => {
      if (result.meta.requestStatus === 'fulfilled') setLoaded(true);
    });
  };

  const handleSubmit = () => {
    if (!absentTeacher?._id || !date) {
      toast.error('Absent teacher and date are required.');
      return;
    }
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) {
      toast.error('Date cannot be in the past.');
      return;
    }
    if (!candidatesData?.targetPeriods?.length) {
      toast.error('Load affected periods first.');
      return;
    }

    const periodIds = candidatesData.targetPeriods.map((p) => (p.periodId?._id || p.periodId));

    if (coverageType === 'SINGLE_TEACHER_ALL_PERIODS') {
      if (!singleSubstitute?._id) {
        toast.error('Please select a substitute teacher.');
        return;
      }
      dispatch(
        createSubRequestThunk({
          absentTeacherId: absentTeacher._id,
          date,
          coverageType,
          periods: periodIds,
          selections: { substituteTeacherId: singleSubstitute._id },
          principalNote: principalNote.trim() || undefined,
          materialsLink: materialsLink.trim() || undefined,
        })
      );
    } else {
      const missing = periodIds.filter((pid) => !perPeriodSelections[pid]);
      if (missing.length > 0) {
        toast.error('Each period must have a substitute selected.');
        return;
      }
      dispatch(
        createSubRequestThunk({
          absentTeacherId: absentTeacher._id,
          date,
          coverageType,
          periods: periodIds,
          selections: {
            perPeriod: periodIds.map((periodId) => ({
              periodId,
              substituteTeacherId: perPeriodSelections[periodId],
            })),
          },
          principalNote: principalNote.trim() || undefined,
          materialsLink: materialsLink.trim() || undefined,
        })
      );
    }
  };

  const candidatesAll = candidatesData?.candidatesAllPeriods || [];
  const candidatesByPeriod = candidatesData?.candidatesByPeriod || {};
  const targetPeriods = candidatesData?.targetPeriods || [];
  const periodIds = targetPeriods.map((p) => (p.periodId?._id || p.periodId));

  const canSubmit =
    loaded &&
    targetPeriods.length > 0 &&
    (coverageType === 'SINGLE_TEACHER_ALL_PERIODS'
      ? singleSubstitute?._id
      : periodIds.length > 0 && periodIds.every((pid) => perPeriodSelections[pid]));

  return (
    <PageContainer>
      <Box sx={{ py: 3 }}>
        <Typography variant="h4" gutterBottom>
          Create Sub Request
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Select an absent teacher and date to load affected periods and available substitutes.
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Autocomplete
            sx={{ minWidth: 280 }}
            options={teacherOptions}
            getOptionLabel={(o) => o.label || o.name || ''}
            value={absentTeacher ? teacherOptions.find((t) => t._id === absentTeacher._id) : null}
            onChange={(_, v) => setAbsentTeacher(v ? { _id: v._id } : null)}
            loading={teachersLoading}
            renderInput={(params) => (
              <TextField {...params} label="Absent Teacher" required placeholder="Search teacher..." />
            )}
          />
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
            sx={{ minWidth: 160 }}
          />
          <Button
            variant="contained"
            onClick={handleLoadCandidates}
            disabled={!absentTeacher?._id || !date || candidatesLoading}
          >
            {candidatesLoading ? <CircularProgress size={24} /> : 'Load affected periods + available teachers'}
          </Button>
        </Box>

        {candidatesError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {candidatesError}
          </Alert>
        )}

        {createError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {createError}
          </Alert>
        )}

        {loaded && targetPeriods.length > 0 && (
          <>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Affected Periods
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxWidth: 600 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Period</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell>Subject</TableCell>
                    <TableCell>Room</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {targetPeriods.map((p, idx) => {
                    const period = p.periodId?.name ? p.periodId : null;
                    const label = period?.name || p._periodName || `Period ${idx + 1}`;
                    const time = p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : '—';
                    const gradeClass = p._grade ? `${p._className || p.classId?.name || '—'} (Grade ${p._grade})` : (p._className || p.classId?.name || '—');
                    return (
                      <TableRow key={p.periodId?._id || p.periodId || idx}>
                        <TableCell>{label}</TableCell>
                        <TableCell>{time}</TableCell>
                        <TableCell>{gradeClass}</TableCell>
                        <TableCell>{p._subjectName || p.subjectId?.name || '—'}</TableCell>
                        <TableCell>{p._roomName || p.roomId?.name || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Coverage Type
            </Typography>
            <ToggleButtonGroup
              value={coverageType}
              exclusive
              onChange={(_, v) => v && setCoverageType(v)}
              sx={{ mb: 2 }}
            >
              <ToggleButton value="SINGLE_TEACHER_ALL_PERIODS">Single teacher (all periods)</ToggleButton>
              <ToggleButton value="PER_PERIOD">Per period</ToggleButton>
            </ToggleButtonGroup>

            {coverageType === 'SINGLE_TEACHER_ALL_PERIODS' && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Select one substitute to cover all periods
                </Typography>
                {candidatesAll.length === 0 ? (
                  <Alert severity="warning" sx={{ maxWidth: 500 }}>
                    No teacher is free for all periods. Consider using per-period mode to assign different teachers.
                  </Alert>
                ) : (
                  <Autocomplete
                    sx={{ maxWidth: 400 }}
                    options={candidatesAll}
                    getOptionLabel={(o) => o.name || `${o.firstName || ''} ${o.lastName || ''}`.trim() || o._id}
                    value={singleSubstitute ? candidatesAll.find((c) => c._id === singleSubstitute._id) || singleSubstitute : null}
                    onChange={(_, v) => setSingleSubstitute(v ? { _id: v._id } : null)}
                    renderInput={(params) => (
                      <TextField {...params} label="Substitute Teacher" required placeholder="Select..." />
                    )}
                  />
                )}
              </Box>
            )}

            {coverageType === 'PER_PERIOD' && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Select a substitute for each period
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {targetPeriods.map((p, idx) => {
                    const pid = p.periodId?._id || p.periodId;
                    const pidStr = String(pid);
                    const periodLabel = p.periodId?.name || (p.startTime && p.endTime ? `${p.startTime}-${p.endTime}` : `Period ${idx + 1}`);
                    const options = candidatesByPeriod[pidStr] || candidatesByPeriod[pid] || [];
                    return (
                      <Box key={pid} sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ minWidth: 120 }}>
                          {periodLabel}
                        </Typography>
                        <Autocomplete
                          sx={{ minWidth: 250 }}
                          options={options}
                          getOptionLabel={(o) => o.name || `${o.firstName || ''} ${o.lastName || ''}`.trim() || o._id}
                          value={options.find((c) => c._id === (perPeriodSelections[pid] ?? perPeriodSelections[pidStr])) || null}
                          onChange={(_, v) =>
                            setPerPeriodSelections((prev) => ({
                              ...prev,
                              [pid]: v?._id || null,
                            }))
                          }
                          renderInput={(params) => (
                            <TextField {...params} label="Substitute" placeholder="Select..." size="small" />
                          )}
                        />
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Principal Note"
              placeholder="Optional note for the substitute teacher..."
              value={principalNote}
              onChange={(e) => setPrincipalNote(e.target.value)}
              sx={{ mb: 2, maxWidth: 600 }}
            />

            <TextField
              fullWidth
              label="Materials Link"
              placeholder="Optional link to lesson plans, materials, or resources..."
              value={materialsLink}
              onChange={(e) => setMaterialsLink(e.target.value)}
              sx={{ mb: 2, maxWidth: 600 }}
            />

            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={createLoading || !canSubmit}
            >
              {createLoading ? <CircularProgress size={24} /> : 'Submit Request'}
            </Button>
          </>
        )}
      </Box>
    </PageContainer>
  );
};

export default CreateSubRequest;
