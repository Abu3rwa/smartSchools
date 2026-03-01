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
} from "@mui/material";
import { HiOutlineArrowLeft } from "react-icons/hi";
import { useRevisionPlanCreateData } from "./hooks/useRevisionPlanCreateData.js";

/**
 * Revision Plan Create page. Route: /portal/revision/create.
 * Student + Teacher shared (teacher selects student).
 */
export default function RevisionPlanCreatePage() {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const {
    isTeacher,
    academicYear,
    subjects,
    students,
    subjectId,
    setSubjectId,
    examDate,
    setExamDate,
    examLabel,
    setExamLabel,
    studentId,
    setStudentId,
    generating,
    minDateStr,
    handleSubmit,
    onBack,
  } = useRevisionPlanCreateData();

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 640, mx: "auto" }}>
      <Button
        startIcon={<HiOutlineArrowLeft size={18} />}
        onClick={onBack}
        sx={{ mb: 2 }}
      >
        Back
      </Button>

      <Typography variant="h4" fontWeight={700} gutterBottom>
        Create Revision Plan
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {isTeacher
          ? "Generate a personalized revision plan for a student."
          : "Get a study schedule based on your weak areas."}
        {academicYear ? ` Academic Year: ${academicYear}.` : ""}
      </Typography>

      <Paper
        sx={{
          p: { xs: 2, sm: 3 },
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
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
                        {s.studentId ? ` (${s.studentId})` : ""}
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
                startIcon={
                  generating ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : null
                }
              >
                {generating ? "Generating plan…" : "Generate plan"}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
}
