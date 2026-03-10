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
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  HiOutlinePlus,
  HiOutlineCalendar,
  HiOutlineUser,
} from "react-icons/hi";
import { format } from "date-fns";
import { useRevisionPlansListData } from "./hooks/useRevisionPlansListData.js";

const getStatusColor = (status) => {
  if (status === "active") return "primary";
  if (status === "completed") return "success";
  return "default";
};

/**
 * Revision Plans List page. Route: /portal/revision.
 * Student + Teacher shared (role-based content).
 */
export default function RevisionPlansListPage() {
  const { t } = useTranslation(["revisionPlans"]);
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const isMd = useMediaQuery(theme.breakpoints.down("md"));
  const {
    list,
    loading,
    isStudent,
    isTeacher,
    academicYear,
    statusFilter,
    setStatusFilter,
    handleCreate,
    handlePlanClick,
  } = useRevisionPlansListData();

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t("revisionPlans:list.title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {isStudent
              ? t("revisionPlans:list.studentSubtitle")
              : t("revisionPlans:list.teacherSubtitle")}
            {academicYear ? ` (${academicYear})` : ""}
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {isTeacher && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>{t("revisionPlans:common.status")}</InputLabel>
              <Select
                value={statusFilter}
                label={t("revisionPlans:common.status")}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">{t("revisionPlans:common.all")}</MenuItem>
                <MenuItem value="active">{t("revisionPlans:status.active")}</MenuItem>
                <MenuItem value="completed">{t("revisionPlans:status.completed")}</MenuItem>
                <MenuItem value="abandoned">{t("revisionPlans:status.abandoned")}</MenuItem>
              </Select>
            </FormControl>
          )}
          <Button
            variant="contained"
            startIcon={<HiOutlinePlus size={20} />}
            onClick={handleCreate}
            sx={{ whiteSpace: "nowrap" }}
          >
            {isStudent ? t("revisionPlans:list.newPlan") : t("revisionPlans:list.createPlan")}
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
            textAlign: "center",
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <HiOutlineCalendar
            size={56}
            style={{
              color: theme.palette.text.secondary,
              marginBottom: 16,
            }}
          />
          <Typography variant="h6" gutterBottom>
            {t("revisionPlans:list.emptyTitle")}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {isStudent
              ? t("revisionPlans:list.emptyStudent")
              : t("revisionPlans:list.emptyTeacher")}
          </Typography>
          <Button
            variant="contained"
            onClick={handleCreate}
            startIcon={<HiOutlinePlus size={18} />}
          >
            {t("revisionPlans:list.createPlan")}
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {list.map((plan) => (
            <Grid item xs={12} sm={6} md={4} key={plan._id}>
              <Card
                sx={{
                  height: "100%",
                  border: `1px solid ${theme.palette.divider}`,
                  "&:hover": { borderColor: theme.palette.primary.main },
                }}
              >
                <CardActionArea
                  onClick={() => handlePlanClick(plan._id)}
                  sx={{
                    height: "100%",
                    display: "block",
                    textAlign: "left",
                  }}
                >
                  <CardContent>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      mb={1}
                    >
                      <Typography
                        variant="h6"
                        noWrap
                        sx={{ flex: 1, pr: 1 }}
                      >
                        {plan.examLabel ||
                          plan.subject?.name ||
                          t("revisionPlans:list.planFallback")}
                      </Typography>
                      <Chip
                        label={t(`revisionPlans:status.${plan.status}`, { defaultValue: plan.status })}
                        size="small"
                        color={getStatusColor(plan.status)}
                        sx={{ textTransform: "capitalize" }}
                      />
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      gutterBottom
                    >
                      {plan.subject?.name} • {t("revisionPlans:common.examLabel")}{" "}
                      {plan.examDate &&
                        format(new Date(plan.examDate), "MMM d, yyyy")}
                    </Typography>
                    {isTeacher && plan.student && (
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={0.5}
                        mt={1}
                      >
                        <HiOutlineUser size={14} />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                        >
                          {plan.student.firstName} {plan.student.lastName}
                          {plan.student.studentId &&
                            ` (${plan.student.studentId})`}
                        </Typography>
                      </Box>
                    )}
                    {plan.daysUntilExam != null &&
                      plan.status === "active" && (
                        <Typography
                          variant="caption"
                          color="primary"
                          display="block"
                          mt={1}
                        >
                          {t("revisionPlans:list.daysUntilExam", { count: plan.daysUntilExam })}
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
}
