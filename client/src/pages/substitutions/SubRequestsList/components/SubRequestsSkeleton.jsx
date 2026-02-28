import { Box, Skeleton } from '@mui/material';

const SubRequestsSkeleton = () => (
  <Box sx={{ py: 2 }}>
    <Skeleton variant="rectangular" height={48} sx={{ mb: 1 }} />
    <Skeleton variant="rectangular" height={200} />
  </Box>
);

export default SubRequestsSkeleton;