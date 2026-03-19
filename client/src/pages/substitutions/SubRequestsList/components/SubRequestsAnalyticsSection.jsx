import {
  Alert,
  Box,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const volumeBandColor = {
  highest: '#dc2626',
  above_average: '#d97706',
  average: '#2563eb',
  below_average: '#6b7280'
};

const metricCardSx = {
  borderRadius: 2,
  border: '1px solid',
  borderColor: 'divider',
  backgroundColor: 'background.paper'
};

const SubRequestsAnalyticsSection = ({
  analytics,
  loading,
  error,
  coverageType,
  onCoverageTypeChange,
  departments,
  departmentId,
  onDepartmentChange,
  canChangeDepartment
}) => {
  const { t } = useTranslation(['subRequestsList']);

  const volumeData = analytics?.charts?.monthlyVolume || [];
  const outcomesData = analytics?.charts?.monthlyOutcomes || [];
  const responseData = analytics?.charts?.monthlyResponseTimes || [];
  const topAbsent = analytics?.tables?.topAbsentTeachers || [];
  const topSubstitutes = analytics?.tables?.topSubstituteTeachers || [];
  const summary = analytics?.summary || {};

  return (
    <Box sx={{ mt: 4 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('subRequestsList:analytics.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('subRequestsList:analytics.subtitle')}
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ minWidth: { md: 420 } }}>
          <FormControl fullWidth size="small">
            <InputLabel id="sub-analytics-coverage-label">{t('subRequestsList:analytics.filters.coverageType')}</InputLabel>
            <Select
              labelId="sub-analytics-coverage-label"
              value={coverageType}
              label={t('subRequestsList:analytics.filters.coverageType')}
              onChange={(event) => onCoverageTypeChange(event.target.value)}
            >
              <MenuItem value="ALL">{t('subRequestsList:analytics.coverage.all')}</MenuItem>
              <MenuItem value="SINGLE_TEACHER_ALL_PERIODS">{t('subRequestsList:analytics.coverage.single')}</MenuItem>
              <MenuItem value="PER_PERIOD">{t('subRequestsList:analytics.coverage.perPeriod')}</MenuItem>
            </Select>
          </FormControl>

          {canChangeDepartment && (
            <FormControl fullWidth size="small">
              <InputLabel id="sub-analytics-department-label">{t('subRequestsList:analytics.filters.department')}</InputLabel>
              <Select
                labelId="sub-analytics-department-label"
                value={departmentId}
                label={t('subRequestsList:analytics.filters.department')}
                onChange={(event) => onDepartmentChange(event.target.value)}
              >
                <MenuItem value="">{t('subRequestsList:analytics.filters.allDepartments')}</MenuItem>
                {departments.map((department) => (
                  <MenuItem key={department._id} value={department._id}>
                    {department.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">{t('subRequestsList:analytics.kpis.totalRequests')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{summary.totalRequests || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">{t('subRequestsList:analytics.kpis.confirmationRate')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{summary.confirmationRate || 0}%</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">{t('subRequestsList:analytics.kpis.avgResponse')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{summary.averageResponseTimeHours || 0}h</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">{t('subRequestsList:analytics.kpis.mostRequestedMonth')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{summary.mostRequestedMonth?.label || 'N/A'}</Typography>
              <Typography variant="body2" color="text.secondary">{summary.mostRequestedMonth?.count || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('subRequestsList:analytics.charts.monthlyVolume')}</Typography>
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name={t('subRequestsList:analytics.legend.requests')}>
                      {volumeData.map((entry) => (
                        <Cell key={entry.key} fill={volumeBandColor[entry.band] || '#6b7280'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('subRequestsList:analytics.charts.monthlyOutcomes')}</Typography>
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={outcomesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="confirmed" stackId="a" fill="#16a34a" name={t('subRequestsList:analytics.legend.confirmed')} />
                    <Bar dataKey="declined" stackId="a" fill="#dc2626" name={t('subRequestsList:analytics.legend.declined')} />
                    <Bar dataKey="expired" stackId="a" fill="#f59e0b" name={t('subRequestsList:analytics.legend.expired')} />
                    <Bar dataKey="cancelled" stackId="a" fill="#6b7280" name={t('subRequestsList:analytics.legend.cancelled')} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('subRequestsList:analytics.charts.monthlyResponseTime')}</Typography>
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={responseData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="avgHours" fill="#2563eb" name={t('subRequestsList:analytics.legend.avgHours')} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('subRequestsList:analytics.tables.topAbsentTeachers')}</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('subRequestsList:analytics.tables.rank')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.teacher')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.absences')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.requests')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.confirmed')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.declined')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topAbsent.map((row) => (
                    <TableRow key={row.teacherId}>
                      <TableCell>{row.rank}</TableCell>
                      <TableCell>{row.teacherName}</TableCell>
                      <TableCell>{row.absences}</TableCell>
                      <TableCell>{row.requestsCreated}</TableCell>
                      <TableCell>{row.confirmed}</TableCell>
                      <TableCell>{row.declined}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={metricCardSx}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('subRequestsList:analytics.tables.topSubstituteTeachers')}</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('subRequestsList:analytics.tables.rank')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.teacher')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.timesSubstituted')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.confirmationRate')}</TableCell>
                    <TableCell>{t('subRequestsList:analytics.tables.avgResponseHours')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topSubstitutes.map((row) => (
                    <TableRow key={row.teacherId}>
                      <TableCell>{row.rank}</TableCell>
                      <TableCell>{row.teacherName}</TableCell>
                      <TableCell>{row.timesSubstituted}</TableCell>
                      <TableCell>{row.confirmationRate}%</TableCell>
                      <TableCell>{row.avgResponseHours}h</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {loading && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {t('subRequestsList:analytics.loading')}
        </Typography>
      )}
    </Box>
  );
};

export default SubRequestsAnalyticsSection;
