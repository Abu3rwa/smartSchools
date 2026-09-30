import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography, Box } from '@mui/material';

export const StudentSessionsDialog = ({ student, sessions, onClose, onOpenSession }) => (
    <Dialog open={Boolean(student)} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
            {student ? `${student.firstName} ${student.lastName}'s sessions` : 'Student sessions'}
        </DialogTitle>
        <DialogContent dividers>
            {!sessions?.length ? (
                <Typography color="text.secondary">No spelling sessions found.</Typography>
            ) : (
                <Stack divider={<Divider flexItem />}>
                    {sessions.map((session) => {
                        const passageStatus = session.practicePassage?.status || 'not sent';
                        return (
                            <Stack key={session._id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ py: 1.5 }}>
                                <Box>
                                    <Typography variant="subtitle2">
                                        {session.completedAt ? new Date(session.completedAt).toLocaleString() : 'In progress'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {session.mode === 'self-serve' ? 'Self-serve' : 'Teacher-led'} · {session.attempts?.length || 0} words · {session.mistakeCount || 0} mistakes
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Chip size="small" label={session.status} color={session.status === 'completed' ? 'success' : 'warning'} />
                                    <Chip size="small" label={passageStatus === 'not sent' ? 'Not sent' : passageStatus} variant="outlined" />
                                    <Button size="small" variant="contained" onClick={() => onOpenSession(student, session)}>View details</Button>
                                </Stack>
                            </Stack>
                        );
                    })}
                </Stack>
            )}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
);

export const ConfirmDialog = ({ dialog, onClose }) => (
    <Dialog open={dialog.open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog.title}</DialogTitle>
        <DialogContent><Typography>{dialog.description}</Typography></DialogContent>
        <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button
                color="error"
                variant="contained"
                onClick={() => { dialog.onConfirm?.(); onClose(); }}
            >
                Confirm
            </Button>
        </DialogActions>
    </Dialog>
);

export const EndSessionPassageReviewDialog = ({ review, rowActionLoadingId, onClose, onEnd }) => {
    const studentId = review?.student?._id;
    const isEnding = Boolean(studentId && rowActionLoadingId === studentId);

    return (
        <Dialog
            open={Boolean(review)}
            onClose={() => {
                if (!isEnding) onClose();
            }}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>Previously sent practice passage</DialogTitle>
            <DialogContent dividers>
                {review && <Stack spacing={1.5}>
                    <Typography variant="subtitle2">
                        {review.student.firstName} {review.student.lastName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        This passage was already sent to the selected student/guardians. It cannot be edited or recalled, but a new passage can be generated later for additional practice.
                    </Typography>
                    <Box sx={{ maxHeight: 360, overflowY: 'auto', p: 2, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap' }}>
                        <Typography component="div">{review.passage.content}</Typography>
                    </Box>
                </Stack>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={isEnding}>Cancel</Button>
                <Button color="error" variant="contained" disabled={isEnding} onClick={onEnd}>
                    {isEnding ? 'Ending...' : 'End active session'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export const PassageDeliveryDialog = ({ open, onClose }) => (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Practice passage email queued</DialogTitle>
        <DialogContent>
            <Typography>The practice passage has been queued for delivery to the selected recipients.</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Delivery is handled by the spelling email service. The final status will be recorded after Gmail accepts the message.
            </Typography>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
);
