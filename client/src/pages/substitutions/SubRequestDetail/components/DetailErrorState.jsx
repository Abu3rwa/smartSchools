import { Alert, Box, Button } from '@mui/material';

const DetailErrorState = ({ message, onBack }) => (
  <Box>
    <Alert severity="error" sx={{ mt: 3 }}>
      {message}
    </Alert>
    <Button onClick={onBack}>Back to list</Button>
  </Box>
);

export default DetailErrorState;