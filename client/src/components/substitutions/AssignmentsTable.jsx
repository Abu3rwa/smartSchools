import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from '@mui/material';
import StatusChip from './StatusChip';

const AssignmentsTable = ({ assignments }) => {
  if (!assignments || assignments.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No assignments
      </Typography>
    );
  }

  const getSubstituteName = (a) => {
    const sub = a.substituteTeacherId;
    if (!sub) return '—';
    if (typeof sub === 'object') {
      const first = sub.firstName || '';
      const last = sub.lastName || '';
      return `${first} ${last}`.trim() || sub.email || '—';
    }
    return '—';
  };

  const getPeriodLabel = (a) => {
    const period = a.periodId;
    if (!period) return '—';
    if (typeof period === 'object') {
      return period.name || `${period.startTime || ''}-${period.endTime || ''}`.trim() || '—';
    }
    return '—';
  };

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflow: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Period</TableCell>
            <TableCell>Substitute Teacher</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Response Note</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {assignments.map((a, idx) => (
            <TableRow key={a._id || idx}>
              <TableCell>{getPeriodLabel(a)}</TableCell>
              <TableCell>{getSubstituteName(a)}</TableCell>
              <TableCell>
                <StatusChip status={a.status || 'PENDING'} />
              </TableCell>
              <TableCell sx={{ maxWidth: 200 }}>{a.teacherResponseNote || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default AssignmentsTable;
