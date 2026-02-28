import { Alert, Autocomplete, Box, TextField, Typography } from '@mui/material';

const SingleCoverageSelector = ({ candidates, selectedId, onSelect }) => (
  <Box sx={{ mb: 2 }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      Select one substitute to cover all periods
    </Typography>
    {candidates.length === 0 ? (
      <Alert severity="warning" sx={{ maxWidth: 500 }}>
        No teacher is free for all periods. Consider using per-period mode to assign different teachers.
      </Alert>
    ) : (
      <Autocomplete
        sx={{ maxWidth: 400 }}
        options={candidates}
        getOptionLabel={(option) => option.name || `${option.firstName || ''} ${option.lastName || ''}`.trim() || option._id}
        value={candidates.find((candidate) => candidate._id === selectedId) || null}
        onChange={(_, option) => onSelect(option?._id || '')}
        renderInput={(params) => (
          <TextField {...params} label="Substitute Teacher" required placeholder="Select..." />
        )}
      />
    )}
  </Box>
);

export default SingleCoverageSelector;