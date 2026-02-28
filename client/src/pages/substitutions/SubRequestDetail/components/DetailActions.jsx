import { Box, Button } from '@mui/material';

const DetailActions = ({ onBack, onCancel, canCancel }) => (
  <Box
    sx={{
      mt: 2,
      display: 'flex',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 1.5
    }}
  >
    <Button variant="text" onClick={onBack}>
      Back to list
    </Button>
    {canCancel && (
      <Button variant="outlined" color="error" onClick={onCancel}>
        Cancel Request
      </Button>
    )}
  </Box>
);

export default DetailActions;