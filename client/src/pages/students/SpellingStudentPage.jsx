import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    fetchSpellingCurrentItem,
    fetchActiveSpellingSession,
    fetchSpellingHistory,
    fetchSpellingRetests,
    endSpellingSession,
    selectSpelling,
    startSelfServeSpellingSession,
    submitSpellingAnswer
} from '../../store/slices/spellingSlice';

const SpellingStudentPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation('spelling');
    const { history, retests, session, currentItem, feedback, loading, error } = useSelector(selectSpelling);
    const [input, setInput] = useState('');
    const [selectedHistorySession, setSelectedHistorySession] = useState(null);

    useEffect(() => {
        dispatch(fetchSpellingHistory());
        dispatch(fetchSpellingRetests());
    }, [dispatch]);

    useEffect(() => {
        const joinActiveSession = async () => {
            const result = await dispatch(fetchActiveSpellingSession());
            if (fetchActiveSpellingSession.fulfilled.match(result) && result.payload) {
                dispatch(fetchSpellingCurrentItem(result.payload._id));
            }
        };
        joinActiveSession();
    }, [dispatch]);

    useEffect(() => {
        if (!session?._id || session.status !== 'in-progress') return undefined;
        const refreshSession = () => dispatch(fetchSpellingCurrentItem(session._id));
        const intervalId = window.setInterval(refreshSession, 3000);
        return () => window.clearInterval(intervalId);
    }, [dispatch, session?._id, session?.status]);

    const startSession = async () => {
        const result = await dispatch(startSelfServeSpellingSession());
        if (startSelfServeSpellingSession.fulfilled.match(result)) {
            dispatch(fetchSpellingCurrentItem(result.payload._id));
            return;
        }

        // Recover the already-active session so the student can end it instead
        // of being left with a start error and no available action.
        const activeResult = await dispatch(fetchActiveSpellingSession());
        if (fetchActiveSpellingSession.fulfilled.match(activeResult) && activeResult.payload) {
            dispatch(fetchSpellingCurrentItem(activeResult.payload._id));
        }
    };

    const submitAnswer = async (event) => {
        event.preventDefault();
        if (!currentItem || !session) return;
        const result = await dispatch(submitSpellingAnswer({
            sessionId: session._id,
            sequence: currentItem.sequence,
            studentInput: input
        }));
        if (submitSpellingAnswer.fulfilled.match(result)) {
            setInput('');
            if (result.payload.session.status === 'in-progress') {
                dispatch(fetchSpellingCurrentItem(session._id));
            } else {
                dispatch(fetchSpellingHistory());
                dispatch(fetchSpellingRetests());
            }
        }
    };

    const endSession = async () => {
        if (!session || loading) return;
        const result = await dispatch(endSpellingSession({ sessionId: session._id }));
        if (endSpellingSession.fulfilled.match(result)) {
            dispatch(fetchSpellingHistory());
            dispatch(fetchSpellingRetests());
        }
    };

    const selectedAttempts = selectedHistorySession?.attempts || [];
    const correctWords = selectedAttempts.filter((attempt) => attempt.correct);
    const incorrectWords = selectedAttempts.filter((attempt) => !attempt.correct);

    return (
        <Box sx={{ maxWidth: 760, mx: 'auto', p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                <Typography variant="h4">{t('mySpelling')}</Typography>
                <Button variant="outlined" onClick={() => navigate('/portal/dashboard')}>{t('backToMain')}</Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {!session && <Button variant="contained" onClick={startSession} disabled={loading}>{t('startStudentSession')}</Button>}
            {session && <Card sx={{ mb: 3 }}><CardContent><Stack spacing={2} alignItems="center">
                <Stack direction="row" justifyContent="space-between" sx={{ width: '100%' }}><Typography>{t('correctCount', { count: session.correctCount })} | {t('mistakeCount', { count: session.mistakeCount })}</Typography>{session.status === 'in-progress' && <Button color="error" variant="outlined" onClick={endSession} disabled={loading}>{t('endSession')}</Button>}</Stack>
                {feedback && <Alert severity={feedback.correct ? 'success' : 'error'}>{feedback.correct ? 'Correct' : `Correct spelling: ${feedback.answer}`}</Alert>}
                {session.status !== 'in-progress' ? <Stack spacing={2} alignItems="center"><Alert severity="success">{t('sessionCompleted')}</Alert><Button variant="contained" onClick={startSession} disabled={loading}>{t('startNewSession')}</Button></Stack> : session.mode === 'teacher-led' ? <Alert severity="info">{t('teacherLedActive')}</Alert> : currentItem ? <form onSubmit={submitAnswer} style={{ width: '100%' }}><Stack spacing={2}>
                    <Typography variant="h2" textAlign="center">{t('spellWord')}</Typography>
                    <TextField
                        autoFocus
                        label="Your answer"
                        value={input}
                        name="spelling-answer"
                        autoComplete="new-password"
                        spellCheck={false}
                        onChange={(event) => setInput(event.target.value)}
                        onPaste={(event) => event.preventDefault()}
                        onDrop={(event) => event.preventDefault()}
                        onContextMenu={(event) => event.preventDefault()}
                    />
                    <Button type="submit" variant="contained" disabled={loading || !input.trim()}>{t('submitAnswer')}</Button>
                </Stack></form> : <Typography>{t('sessionCompleted')}</Typography>}
            </Stack></CardContent></Card>}
            <Typography variant="h6">{t('pendingRetests')}</Typography>
            <Stack spacing={1} sx={{ my: 1 }}>{retests.map((retest) => <Chip key={retest._id} label={`${retest.wordSnapshot} - due ${new Date(retest.dueAt).toLocaleDateString()}`} color={new Date(retest.dueAt) < new Date() ? 'error' : 'warning'} />)}</Stack>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6">{t('sessionHistory')}</Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>{history.map((entry) => <Stack key={entry._id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}><Typography>{new Date(entry.startedAt).toLocaleDateString()} - {entry.correctCount} correct, {entry.mistakeCount} incorrect</Typography><Button size="small" variant="outlined" onClick={() => setSelectedHistorySession(entry)}>{t('viewDetails')}</Button></Stack>)}</Stack>
            <Dialog open={Boolean(selectedHistorySession)} onClose={() => setSelectedHistorySession(null)} fullWidth maxWidth="sm">
                <DialogTitle>{t('sessionDetails')}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        <Typography color="text.secondary">{selectedHistorySession && new Date(selectedHistorySession.startedAt).toLocaleDateString()}</Typography>
                        <Box><Typography variant="subtitle1">{t('correctWords')}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{correctWords.length ? correctWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="success" icon={<span aria-hidden="true">✓</span>} />) : <Typography color="text.secondary">{t('none')}</Typography>}</Stack></Box>
                        <Box><Typography variant="subtitle1">{t('incorrectWords')}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{incorrectWords.length ? incorrectWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="error" icon={<span aria-hidden="true">×</span>} />) : <Typography color="text.secondary">{t('none')}</Typography>}</Stack></Box>
                    </Stack>
                </DialogContent>
                <DialogActions><Button onClick={() => setSelectedHistorySession(null)}>{t('close')}</Button></DialogActions>
            </Dialog>
        </Box>
    );
};

export default SpellingStudentPage;
