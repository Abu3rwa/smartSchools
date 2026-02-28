import { Button, CircularProgress } from '@mui/material';

const SubmitSection = ({ loading, disabled, onSubmit }) => (
  <Button variant="contained" onClick={onSubmit} disabled={loading || disabled}>
    {loading ? <CircularProgress size={24} /> : 'Submit Request'}
  </Button>
);

export default SubmitSection;