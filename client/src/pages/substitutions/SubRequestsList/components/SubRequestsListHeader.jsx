import { Box, Button } from '@mui/material';

const SubRequestsListHeader = ({ canCreate, onCreate }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
    <Box>
      <h1 style={{ marginBottom: 8, fontSize: '1.75rem' }}>Sub Requests List</h1>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        View and manage substitution requests.
      </p>
    </Box>
    {canCreate && (
      <Button variant="contained" onClick={onCreate}>
        Create Sub Request
      </Button>
    )}
  </Box>
);

export default SubRequestsListHeader;