import { Box, Skeleton } from '@mui/material';

const DetailLoadingState = () => (
  <Box sx={{ py: 3 }}>
    <Skeleton variant="text" width="40%" height={40} sx={{ mb: 2 }} />
    <Skeleton variant="rectangular" height={120} sx={{ mb: 2 }} />
    <Skeleton variant="rectangular" height={200} />
  </Box>
);

export default DetailLoadingState;