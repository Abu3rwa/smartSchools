import { Box, Typography } from '@mui/material';

const CreateSubRequestHeader = () => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="h4" gutterBottom>
      Create Sub Request
    </Typography>
    <Typography variant="body2" color="text.secondary">
      Select an absent teacher and date to load affected periods and available substitutes.
    </Typography>
  </Box>
);

export default CreateSubRequestHeader;