import { Box, Button, Stack, TextField, Typography } from '@mui/material';

const getPeriodLabel = (assignment) => {
  const period = assignment?.periodId;
  if (!period) return 'Assigned period';
  const name = period?.name || 'Assigned period';
  const hasTime = period?.startTime && period?.endTime;
  return hasTime ? `${name} (${period.startTime}-${period.endTime})` : name;
};

const TeacherResponsePanel = ({
  isTeacher,
  isAbsentTeacher,
  hasPending,
  hasConfirmed,
  hasDeclined,
  status,
  coverageType,
  assignments,
  note,
  onNoteChange,
  onRespond,
  respondLoading,
  activeAction
}) => {
  if (!isTeacher) return null;

  return (
    <Box
      sx={{
        mb: 3,
        p: 2,
        borderRadius: 1,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper'
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Your response
      </Typography>

      {isAbsentTeacher && !hasPending && !hasConfirmed && !hasDeclined && (
        <Typography variant="body2" color="text.secondary">
          You are the absent teacher for this request. Coverage is being managed by the administration and covering teachers.
        </Typography>
      )}

      {!isAbsentTeacher && !hasPending && !hasConfirmed && !hasDeclined && (
        <Typography variant="body2" color="text.secondary">
          You have no assignment on this request.
        </Typography>
      )}

      {hasDeclined && !hasPending && !hasConfirmed && (
        <Typography variant="body2" color="error.main" sx={{ fontWeight: 500 }}>
          You have declined your assignment(s) for this request.
        </Typography>
      )}

      {hasPending && status === 'SUBMITTED' && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Confirm if you can cover these periods, or decline with a short note.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            label="Your note (required to decline)"
            placeholder="Add any context for the principal..."
            value={note}
            onChange={onNoteChange}
            disabled={respondLoading}
            sx={{ mb: 2 }}
          />
          {coverageType === 'PER_PERIOD' ? (
            <Stack spacing={1.25}>
              {(assignments || []).map((assignment) => {
                const assignmentStatus = assignment?.status || 'PENDING';
                const assignmentId = assignment?._id;
                const isPending = assignmentStatus === 'PENDING';
                const isConfirmed = assignmentStatus === 'CONFIRMED';

                return (
                  <Box
                    key={assignmentId}
                    sx={{
                      p: 1.25,
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      flexWrap: 'wrap'
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {getPeriodLabel(assignment)}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => onRespond('DECLINE', assignmentId)}
                        disabled={respondLoading || !note.trim() || !isPending}
                      >
                        {respondLoading && activeAction === 'DECLINE' ? 'Submitting...' : 'Decline'}
                      </Button>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        onClick={() => onRespond('CONFIRM', assignmentId)}
                        disabled={respondLoading || !isPending}
                      >
                        {respondLoading && activeAction === 'CONFIRM' ? 'Submitting...' : 'Confirm'}
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        size="small"
                        onClick={() => onRespond('WITHDRAW', assignmentId)}
                        disabled={respondLoading || !note.trim() || !isConfirmed}
                      >
                        {respondLoading && activeAction === 'WITHDRAW' ? 'Withdrawing...' : 'Withdraw'}
                      </Button>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.5} flexWrap="wrap" justifyContent="flex-end">
              <Button
                variant="outlined"
                color="error"
                onClick={() => onRespond('DECLINE')}
                disabled={respondLoading || !note.trim()}
              >
                {respondLoading && activeAction === 'DECLINE' ? 'Submitting...' : 'Decline'}
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={() => onRespond('CONFIRM')}
                disabled={respondLoading}
              >
                {respondLoading && activeAction === 'CONFIRM' ? 'Submitting...' : 'Confirm'}
              </Button>
            </Stack>
          )}
        </>
      )}

      {hasConfirmed && !hasPending && (
        <>
          <Typography variant="body2" color="success.main" sx={{ mb: 1.5, fontWeight: 500 }}>
            ✓ You have confirmed this substitution.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            label="Reason for withdrawal (required)"
            placeholder="Briefly explain why you need to withdraw..."
            value={note}
            onChange={onNoteChange}
            disabled={respondLoading}
            sx={{ mb: 2 }}
          />
          {coverageType === 'PER_PERIOD' ? (
            <Stack spacing={1.25}>
              {(assignments || [])
                .filter((assignment) => assignment?.status === 'CONFIRMED')
                .map((assignment) => (
                  <Box
                    key={assignment?._id}
                    sx={{
                      p: 1.25,
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      flexWrap: 'wrap'
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {getPeriodLabel(assignment)}
                    </Typography>
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      onClick={() => onRespond('WITHDRAW', assignment?._id)}
                      disabled={respondLoading || !note.trim()}
                    >
                      {respondLoading && activeAction === 'WITHDRAW' ? 'Withdrawing...' : 'Withdraw'}
                    </Button>
                  </Box>
                ))}
            </Stack>
          ) : (
            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="outlined"
                color="warning"
                onClick={() => onRespond('WITHDRAW')}
                disabled={respondLoading || !note.trim()}
              >
                {respondLoading && activeAction === 'WITHDRAW' ? 'Withdrawing...' : 'Withdraw confirmation'}
              </Button>
            </Stack>
          )}
        </>
      )}

      {hasPending && status !== 'SUBMITTED' && (
        <Typography variant="body2" color="text.secondary">
          This request is no longer open for responses (status: {status}).
        </Typography>
      )}
    </Box>
  );
};

export default TeacherResponsePanel;