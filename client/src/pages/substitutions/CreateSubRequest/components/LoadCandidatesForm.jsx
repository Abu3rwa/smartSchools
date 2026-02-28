import { Autocomplete, Box, Button, CircularProgress, TextField } from '@mui/material';

const LoadCandidatesForm = ({
  teacherOptions,
  teachersLoading,
  selectedTeacherId,
  date,
  onTeacherChange,
  onDateChange,
  onLoad,
  candidatesLoading
}) => {
  const selectedTeacher = teacherOptions.find((teacher) => teacher.id === selectedTeacherId) || null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
      <Autocomplete
        sx={{ minWidth: 280 }}
        options={teacherOptions}
        getOptionLabel={(option) => option.label || option.name || ''}
        value={selectedTeacher}
        onChange={(_, option) => onTeacherChange(option?.id || '')}
        loading={teachersLoading}
        renderInput={(params) => (
          <TextField {...params} label="Absent Teacher" required placeholder="Search teacher..." />
        )}
      />
      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={onDateChange}
        InputLabelProps={{ shrink: true }}
        required
        sx={{ minWidth: 160 }}
      />
      <Button
        variant="contained"
        onClick={onLoad}
        disabled={!selectedTeacherId || !date || candidatesLoading}
      >
        {candidatesLoading ? <CircularProgress size={24} /> : 'Load affected periods + available teachers'}
      </Button>
    </Box>
  );
};

export default LoadCandidatesForm;