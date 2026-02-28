import { Box, Typography } from '@mui/material';

const DetailSection = ({ title, children }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
      {title}
    </Typography>
    {children}
  </Box>
);

export default DetailSection;