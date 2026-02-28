import { Autocomplete, Box, TextField, Typography } from '@mui/material';

const PerPeriodCoverageSelector = ({ targetPeriods, candidatesByPeriod, selections, onSelect }) => (
  <Box sx={{ mb: 2 }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      Select a substitute for each period
    </Typography>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {targetPeriods.map((period, index) => {
        const periodId = period.periodId?._id || period.periodId;
        const key = String(periodId);
        const periodLabel =
          period.periodId?.name ||
          (period.startTime && period.endTime
            ? `${period.startTime}-${period.endTime}`
            : `Period ${index + 1}`);
        const options = candidatesByPeriod[key] || candidatesByPeriod[periodId] || [];
        const selectedOption = options.find((candidate) => candidate._id === selections[key]) || null;

        return (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ minWidth: 120 }}>
              {periodLabel}
            </Typography>
            <Autocomplete
              sx={{ minWidth: 250 }}
              options={options}
              getOptionLabel={(option) =>
                option.name || `${option.firstName || ''} ${option.lastName || ''}`.trim() || option._id
              }
              value={selectedOption}
              onChange={(_, option) => onSelect(periodId, option?._id || '')}
              renderInput={(params) => (
                <TextField {...params} label="Substitute" placeholder="Select..." size="small" />
              )}
            />
          </Box>
        );
      })}
    </Box>
  </Box>
);

export default PerPeriodCoverageSelector;