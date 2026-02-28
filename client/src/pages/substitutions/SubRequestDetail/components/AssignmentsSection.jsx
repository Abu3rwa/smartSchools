import { Box, Typography } from '@mui/material';
import AssignmentsTable from '../../../../components/substitutions/AssignmentsTable';

const AssignmentsSection = ({ assignments, isTeacher }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
      Assignments ({assignments?.length || 0})
    </Typography>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
      Manage which teachers are covering each period for this request.
    </Typography>
    <AssignmentsTable assignments={assignments} showSubstituteColumn={!isTeacher} />
  </Box>
);

export default AssignmentsSection;