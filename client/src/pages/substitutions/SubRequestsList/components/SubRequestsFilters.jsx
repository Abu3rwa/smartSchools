import { Box, Button, CircularProgress, MenuItem, TextField } from '@mui/material';

const SubRequestsFilters = ({
  filters,
  statusOptions,
  teacherOptions,
  canCreate,
  loading,
  onChange,
  onApply
}) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
    <TextField
      select
      label="Status"
      value={filters.status}
      onChange={(event) => onChange('status', event.target.value)}
      size="small"
      sx={{ minWidth: 140 }}
    >
      {statusOptions.map((option) => (
        <MenuItem key={option.value || 'all'} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
    <TextField
      label="Start Date"
      type="date"
      value={filters.startDate}
      onChange={(event) => onChange('startDate', event.target.value)}
      InputLabelProps={{ shrink: true }}
      size="small"
      sx={{ minWidth: 140 }}
    />
    <TextField
      label="End Date"
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
          label="Absent Teacher"
          value={filters.absentTeacherId}
          onChange={(event) => onChange('absentTeacherId', event.target.value)}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          {teacherOptions.map((teacher) => (
            <MenuItem key={teacher.id} value={teacher.id}>
              {teacher.name || 'Unknown'}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Substitute Teacher"
          value={filters.substituteTeacherId}
          onChange={(event) => onChange('substituteTeacherId', event.target.value)}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          {teacherOptions.map((teacher) => (
            <MenuItem key={teacher.id} value={teacher.id}>
              {teacher.name || 'Unknown'}
            </MenuItem>
          ))}
        </TextField>
      </>
    )}
    <Button variant="contained" onClick={onApply} disabled={loading}>
      {loading ? <CircularProgress size={22} /> : 'Apply Filters'}
    </Button>
  </Box>
);

export default SubRequestsFilters;