import { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { HiOutlineArrowUturnLeft, HiOutlineCheck, HiOutlineXMark } from 'react-icons/hi2';

const isSkippedAttempt = (attempt, mode) => attempt?.skipped === true || (
    mode === 'self-serve'
    && attempt?.skipped === undefined
    && !String(attempt?.studentInput ?? '').trim()
);

const latestOverride = (attempt) => {
    const history = attempt?.correctionHistory || [];
    const last = history[history.length - 1];
    return last && last.action !== 'undo' ? last : null;
};

const ACTION_KEYS = {
    correct: 'attemptReview.markCorrect',
    incorrect: 'attemptReview.markIncorrect',
    undo: 'attemptReview.undoLastChange'
};

const SpellingAttemptReviewList = ({ session, onSetOutcome, busyAttemptId, t, readOnly = false }) => {
    const [pendingAction, setPendingAction] = useState(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const attempts = (session?.attempts || []).filter((attempt) => (
        String(attempt.studentInput ?? '').trim()
        || attempt.correct
        || attempt.correctedAt
        || (attempt.correctionHistory || []).length
    ));
    if (!attempts.length) return null;

    const formalGradeNote = session?.assessmentType === 'formal-spelling-test'
        ? t('attemptReview.formalGradeNote')
        : t('attemptReview.practiceNote');

    const startAction = (attempt, action, targetCorrectionRevision = null) => {
        setPendingAction({ attempt, action, targetCorrectionRevision });
        setReason('');
        setError('');
    };

    const closeDialog = () => {
        setPendingAction(null);
        setReason('');
        setError('');
    };

    const confirm = async () => {
        if (!pendingAction) return;
        const trimmed = reason.trim();
        if (trimmed.length < 5) {
            setError(t('attemptReview.reasonTooShort'));
            return;
        }
        const ok = await onSetOutcome(pendingAction.attempt, {
            action: pendingAction.action,
            reason: trimmed,
            targetCorrectionRevision: pendingAction.targetCorrectionRevision
        });
        if (ok) closeDialog();
    };

    const busy = Boolean(busyAttemptId);
    const reasonLength = reason.trim().length;

    return (
        <Box sx={{ width: '100%', maxWidth: 700 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {session?.status === 'in-progress'
                    ? t('attemptReview.liveTitle')
                    : t('attemptReview.title')}
            </Typography>
            <Stack spacing={1}>
                {attempts.map((attempt) => {
                    const skipped = isSkippedAttempt(attempt, session?.mode);
                    const override = latestOverride(attempt);
                    const history = attempt.correctionHistory || [];
                    const busyRow = String(busyAttemptId) === String(attempt._id);
                    const canOverride = !readOnly && !skipped && attempt._id && Number.isInteger(attempt.revision);
                    return (
                        <Card key={attempt._id || attempt.sequence} variant="outlined">
                            <CardContent sx={{ '&:last-child': { pb: 1.5 }, py: 1.5 }}>
                                <Stack spacing={1}>
                                    <Stack
                                        direction={{ xs: 'column', sm: 'row' }}
                                        spacing={1}
                                        alignItems={{ sm: 'center' }}
                                        justifyContent="space-between"
                                    >
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.25, sm: 2 }} flexWrap="wrap" useFlexGap>
                                            <Typography variant="body2">
                                                {t('yourAnswerLabel')} <strong>{String(attempt.studentInput ?? '').trim() || t('skippedAnswer')}</strong>
                                            </Typography>
                                            <Typography variant="body2">
                                                {t('correctSpellingLabel')} <strong>{attempt.wordSnapshot}</strong>
                                            </Typography>
                                            {attempt.correct && (
                                                <Chip size="small" color="success" label={t('acceptedByTeacher')} />
                                            )}
                                        </Stack>
                                        {canOverride && (
                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                {!attempt.correct && (
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="success"
                                                        startIcon={<HiOutlineCheck />}
                                                        disabled={busy}
                                                        onClick={() => startAction(attempt, 'correct')}
                                                    >
                                                        {busyRow ? t('attemptReview.saving') : t('attemptReview.markCorrect')}
                                                    </Button>
                                                )}
                                                {attempt.correct && (
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="error"
                                                        startIcon={<HiOutlineXMark />}
                                                        disabled={busy}
                                                        onClick={() => startAction(attempt, 'incorrect')}
                                                    >
                                                        {busyRow ? t('attemptReview.saving') : t('attemptReview.markIncorrect')}
                                                    </Button>
                                                )}
                                                {override && (
                                                    <Button
                                                        size="small"
                                                        variant="text"
                                                        startIcon={<HiOutlineArrowUturnLeft />}
                                                        disabled={busy}
                                                        onClick={() => startAction(attempt, 'undo', override.revision)}
                                                    >
                                                        {t('attemptReview.undoLastChange')}
                                                    </Button>
                                                )}
                                            </Stack>
                                        )}
                                    </Stack>
                                    {skipped && (
                                        <Typography variant="caption" color="text.secondary">
                                            {t('attemptReview.skippedReadOnly')}
                                        </Typography>
                                    )}
                                    {history.length > 0 && (
                                        <Stack spacing={0.25}>
                                            {history.slice(-3).map((entry) => (
                                                <Typography key={`${attempt._id}-${entry.revision}`} variant="caption" color="text.secondary">
                                                    {t('attemptReview.historyEntry', {
                                                        action: t(ACTION_KEYS[entry.action] || 'attemptReview.markCorrect'),
                                                        when: new Date(entry.at).toLocaleString()
                                                    })}
                                                    {entry.reason ? ` — ${entry.reason}` : ''}
                                                </Typography>
                                            ))}
                                        </Stack>
                                    )}
                                    {attempt.correct && session?.hasSentPassage && (
                                        <Typography variant="caption" color="warning.main">
                                            {t('attemptReview.sentReportNote')}
                                        </Typography>
                                    )}
                                </Stack>
                            </CardContent>
                        </Card>
                    );
                })}
            </Stack>
            <Dialog open={Boolean(pendingAction)} onClose={closeDialog} maxWidth="xs" fullWidth>
                <DialogTitle>
                    {pendingAction ? t(ACTION_KEYS[pendingAction.action]) : ''}
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Alert severity="info">{formalGradeNote}</Alert>
                        <TextField
                            autoFocus
                            multiline
                            minRows={2}
                            label={t('attemptReview.reasonLabel')}
                            helperText={t('attemptReview.reasonHelp')}
                            value={reason}
                            onChange={(event) => {
                                setReason(event.target.value);
                                if (error) setError('');
                            }}
                            error={Boolean(error)}
                            inputProps={{ maxLength: 500 }}
                        />
                        {error && <Typography variant="caption" color="error">{error}</Typography>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog}>{t('attemptReview.cancel')}</Button>
                    <Button
                        variant="contained"
                        onClick={confirm}
                        disabled={busy || reasonLength < 5}
                    >
                        {t('attemptReview.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SpellingAttemptReviewList;
