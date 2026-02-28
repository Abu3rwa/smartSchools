import { Box, Typography } from '@mui/material';

const SummaryItem = ({ label, value }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2">
      <strong>{value}</strong>
    </Typography>
  </Box>
);

const SummaryGrid = ({ items }) => (
  <Box
    sx={{
      mb: 3,
      p: 2,
      borderRadius: 1,
      border: (theme) => `1px solid ${theme.palette.divider}`,
      display: 'grid',
      gap: 2,
      gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }
    }}
  >
    {items.map((item) => (
      <SummaryItem key={item.label} label={item.label} value={item.value} />
    ))}
  </Box>
);

export default SummaryGrid;