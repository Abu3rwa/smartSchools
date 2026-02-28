import { Box, Typography } from '@mui/material';

const SubRequestsEmptyState = ({ hasFilters }) => (
  <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
    <Typography variant="body2">
      {hasFilters
        ? 'No requests match your filters. Try adjusting or clearing filters.'
        : 'No substitution requests found.'}
    </Typography>
  </Box>
);

export default SubRequestsEmptyState;
