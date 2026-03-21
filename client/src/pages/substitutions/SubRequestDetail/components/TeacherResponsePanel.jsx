import { Box, TextField, Typography } from '@mui/material';

const TeacherResponsePanel = ({
  isTeacher,
  isAbsentTeacher,
  hasPending,
  hasConfirmed,
  hasDeclined,
  status,
  note,
  onNoteChange,
  respondLoading
}) => {
  if (!isTeacher) return null;

  const canRespondByPeriod =
    !isAbsentTeacher &&
    status === 'SUBMITTED' &&
    (hasPending || hasConfirmed);

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

      {canRespondByPeriod && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Respond to each period using the buttons in the Requested Periods table above.
            A note is required for Decline and Withdraw.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            label="Your note"
            placeholder="Add any context for the principal..."
            value={note}
            onChange={onNoteChange}
            disabled={respondLoading}
            sx={{ mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            Tip: keep this note short and specific. It will be sent with your response when required.
          </Typography>
        </>
      )}

      {hasConfirmed && !hasPending && (
        <Typography variant="body2" color="success.main" sx={{ mt: 1, fontWeight: 500 }}>
          You have confirmed substitution assignments. Use Requested Periods to withdraw any specific period.
        </Typography>
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