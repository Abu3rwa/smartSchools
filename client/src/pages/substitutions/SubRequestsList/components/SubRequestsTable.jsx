import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import Paper from '@mui/material/Paper';
import StatusChip from '../../../../components/substitutions/StatusChip';
import { formatDate, getPersonName } from '../utils/subRequestsListUtils';

const SubRequestsTable = ({ items, onView }) => (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Date</TableCell>
          <TableCell>Absent Teacher</TableCell>
          <TableCell>Coverage Type</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Created By</TableCell>
          <TableCell>Updated</TableCell>
          <TableCell>Actions</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((request) => (
          <TableRow key={request._id} hover>
            <TableCell>{formatDate(request.date)}</TableCell>
            <TableCell>{getPersonName(request.absentTeacherId)}</TableCell>
            <TableCell>
              {request.coverageType === 'SINGLE_TEACHER_ALL_PERIODS' ? 'Single' : 'Per period'}
            </TableCell>
            <TableCell>
              <StatusChip status={request.status} />
            </TableCell>
            <TableCell>{getPersonName(request.createdBy)}</TableCell>
            <TableCell>{formatDate(request.updatedAt)}</TableCell>
            <TableCell>
              <Button size="small" onClick={() => onView(request._id)}>
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

export default SubRequestsTable;