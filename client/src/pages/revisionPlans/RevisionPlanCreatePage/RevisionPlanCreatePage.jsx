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
import { useTranslation } from "react-i18next";
import { HiOutlineArrowLeft } from "react-icons/hi";
import { useRevisionPlanCreateData } from "./hooks/useRevisionPlanCreateData.js";

/**
 * Revision Plan Create page. Route: /portal/revision/create.
 * Student + Teacher shared (teacher selects student).
 */
export default function RevisionPlanCreatePage() {
  const { t } = useTranslation(["revisionPlans"]);
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
        {t("revisionPlans:common.back")}
      </Button>

      <Typography variant="h4" fontWeight={700} gutterBottom>
        {t("revisionPlans:create.title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {isTeacher
          ? t("revisionPlans:create.teacherSubtitle")
          : t("revisionPlans:create.studentSubtitle")}
        {academicYear ? ` ${t("revisionPlans:create.academicYear", { year: academicYear })}` : ""}
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
                  <InputLabel>{t("revisionPlans:create.student")}</InputLabel>
                  <Select
                    value={studentId}
                    label={t("revisionPlans:create.student")}
                    onChange={(e) => setStudentId(e.target.value)}
                  >
                    <MenuItem value="">{t("revisionPlans:create.selectStudent")}</MenuItem>
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
                <InputLabel>{t("revisionPlans:create.subject")}</InputLabel>
                <Select
                  value={subjectId}
                  label={t("revisionPlans:create.subject")}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <MenuItem value="">{t("revisionPlans:create.selectSubject")}</MenuItem>
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
                label={t("revisionPlans:create.examDate")}
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
                label={t("revisionPlans:create.examName")}
                value={examLabel}
                onChange={(e) => setExamLabel(e.target.value)}
                placeholder={t("revisionPlans:create.examNamePlaceholder")}
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
                {generating ? t("revisionPlans:create.generating") : t("revisionPlans:create.generate")}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
}
