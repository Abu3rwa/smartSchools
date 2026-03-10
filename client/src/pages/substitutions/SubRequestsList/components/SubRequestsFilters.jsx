import { Box, Button, CircularProgress, MenuItem, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';

const SubRequestsFilters = ({
  filters,
  statusOptions,
  teacherOptions,
  canCreate,
  loading,
  onChange,
  onApply
}) => {
  const { t } = useTranslation(['subRequestsList']);

  return (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
    <TextField
      select
      label={t('subRequestsList:filters.status.label')}
      value={filters.status}
      onChange={(event) => onChange('status', event.target.value)}
      size="small"
      sx={{ minWidth: 140 }}
    >
      {statusOptions.map((option) => (
        <MenuItem key={option.value || 'all'} value={option.value}>
          {t(`subRequestsList:${option.labelKey}`)}
        </MenuItem>
      ))}
    </TextField>
    <TextField
      label={t('subRequestsList:filters.startDate')}
      type="date"
      value={filters.startDate}
      onChange={(event) => onChange('startDate', event.target.value)}
      InputLabelProps={{ shrink: true }}
      size="small"
      sx={{ minWidth: 140 }}
    />
    <TextField
      label={t('subRequestsList:filters.endDate')}
      type="date"
      value={filters.endDate}
      onChange={(event) => onChange('endDate', event.target.value)}
      InputLabelProps={{ shrink: true }}
      size="small"
      sx={{ minWidth: 140 }}
    />
    {canCreate && (
      <>
        <TextField
          select
          label={t('subRequestsList:filters.absentTeacher')}
          value={filters.absentTeacherId}
          onChange={(event) => onChange('absentTeacherId', event.target.value)}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{t('subRequestsList:filters.all')}</MenuItem>
          {teacherOptions.map((teacher) => (
            <MenuItem key={teacher.id} value={teacher.id}>
              {teacher.name || t('subRequestsList:common.unknown')}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label={t('subRequestsList:filters.substituteTeacher')}
          value={filters.substituteTeacherId}
          onChange={(event) => onChange('substituteTeacherId', event.target.value)}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{t('subRequestsList:filters.all')}</MenuItem>
          {teacherOptions.map((teacher) => (
            <MenuItem key={teacher.id} value={teacher.id}>
              {teacher.name || t('subRequestsList:common.unknown')}
            </MenuItem>
          ))}
        </TextField>
      </>
    )}
    <Button variant="contained" onClick={onApply} disabled={loading}>
      {loading ? <CircularProgress size={22} /> : t('subRequestsList:actions.applyFilters')}
    </Button>
  </Box>
  );
};

export default SubRequestsFilters;
