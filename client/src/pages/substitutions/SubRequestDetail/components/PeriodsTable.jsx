import { Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { getEntityName, getPeriodTitle } from '../utils/subRequestDetailUtils';
import StatusChip from '../../../../components/substitutions/StatusChip';

const getEntityId = (entity) => {
  if (!entity) return null;
  if (typeof entity === 'object') return entity._id || entity.id || null;
  return entity;
};

const getAssignmentByPeriod = (assignments = [], period) => {
  const periodId = getEntityId(period?.periodId);
  if (!periodId) return null;
  return assignments.find((assignment) => getEntityId(assignment?.periodId)?.toString() === periodId.toString()) || null;
};

const PeriodsTable = ({
  periods,
  assignments = [],
  isTeacher = false,
  requestStatus,
  note,
  responseNotesByAssignment = {},
  onResponseNoteChange,
  onRespond,
  respondLoading = false,
  activeAction
}) => {
  if (!periods?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No period details available
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflow: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Period</TableCell>
            <TableCell>Class</TableCell>
            <TableCell>Subject</TableCell>
            <TableCell>Room</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Response Note</TableCell>
            {isTeacher && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {periods.map((period, index) => {
            const assignment = getAssignmentByPeriod(assignments, period);
            const assignmentId = assignment?._id;
            const status = assignment?.status || 'PENDING';
            const isPending = status === 'PENDING';
            const isConfirmed = status === 'CONFIRMED';
            const isOpenForResponse = requestStatus === 'SUBMITTED';
            const rowNote = assignmentId ? (responseNotesByAssignment?.[assignmentId] ?? '') : '';

            return (
              <TableRow key={period?.periodId?._id || period?.periodId || index}>
                <TableCell>{getPeriodTitle(period)}</TableCell>
                <TableCell>{getEntityName(period.classId)}</TableCell>
                <TableCell>{getEntityName(period.subjectId)}</TableCell>
                <TableCell>{getEntityName(period.roomId)}</TableCell>
                <TableCell>
                  {assignment ? <StatusChip status={status} /> : 'UNASSIGNED'}
                </TableCell>
                <TableCell sx={{ minWidth: 220 }}>
                  {isTeacher && assignment && isOpenForResponse ? (
                    <TextField
                      value={rowNote}
                      onChange={(event) => onResponseNoteChange?.(assignmentId, event.target.value)}
                      size="small"
                      fullWidth
                      placeholder="Response note"
                      disabled={respondLoading}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      {assignment?.teacherResponseNote || '—'}
                    </Typography>
                  )}
                </TableCell>
                {isTeacher && (
                  <TableCell align="right">
                    {!assignment || !isOpenForResponse ? (
                      <Typography variant="caption" color="text.secondary">
                        {assignment ? 'Closed' : 'Not assigned'}
                      </Typography>
                    ) : (
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {isPending && (
                          <>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              onClick={() => onRespond?.('DECLINE', assignmentId, rowNote || note)}
                              disabled={respondLoading || !(rowNote || note)?.trim()}
                            >
                              {respondLoading && activeAction === 'DECLINE' ? '...' : 'Decline'}
                            </Button>
                            <Button
                              variant="contained"
                              color="success"
                              size="small"
                              onClick={() => onRespond?.('CONFIRM', assignmentId, rowNote || note)}
                              disabled={respondLoading}
                            >
                              {respondLoading && activeAction === 'CONFIRM' ? '...' : 'Confirm'}
                            </Button>
                          </>
                        )}
                        {isConfirmed && (
                          <Button
                            variant="outlined"
                            color="warning"
                            size="small"
                            onClick={() => onRespond?.('WITHDRAW', assignmentId, rowNote || note)}
                            disabled={respondLoading || !(rowNote || note)?.trim()}
                          >
                            {respondLoading && activeAction === 'WITHDRAW' ? '...' : 'Withdraw'}
                          </Button>
                        )}
                      </Stack>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default PeriodsTable;