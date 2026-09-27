import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Typography } from '@mui/material';
import { HiOutlineArrowLeft, HiOutlineSpeakerWave } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import {
    fetchSpellingCurrentItem,
    fetchActiveSpellingSession,
    fetchSpellingHistory,
    fetchSpellingRetests,
    endSpellingSession,
    selectSpelling,
    startSelfServeSpellingSession,
    submitSpellingAnswer
    ,fetchSpellingDictionaryEntry
} from '../../store/slices/spellingSlice';

const SpellingStudentPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation('spelling');
    const { history, retests, session, currentItem, loading, error } = useSelector(selectSpelling);
    const [input, setInput] = useState('');
    const [localError, setLocalError] = useState('');
    const [selectedHistorySession, setSelectedHistorySession] = useState(null);
    const [practicePassage, setPracticePassage] = useState(null);
    const [passageLoading, setPassageLoading] = useState(false);
    const [dictionaryEntry, setDictionaryEntry] = useState(null);
    const [revealedAttempt, setRevealedAttempt] = useState(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [sessionViewOpen, setSessionViewOpen] = useState(false);
    const autoPlayedSequence = useRef(null);
    const activeAudioRef = useRef(null);

    // Open the full-screen session view automatically whenever a session
    // (new or resumed) becomes available. Closing it later is just a UI
    // state — it does not end the session, so the student can reopen it.
    useEffect(() => {
        if (session?._id) setSessionViewOpen(true);
    }, [session?._id]);

    const closeSessionView = () => setSessionViewOpen(false);

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

    useEffect(() => {
        if (!currentItem?.word) return;
        let cancelled = false;
        dispatch(fetchSpellingDictionaryEntry(currentItem.word)).then((result) => {
            if (!cancelled && fetchSpellingDictionaryEntry.fulfilled.match(result)) setDictionaryEntry(result.payload);
        });
        return () => { cancelled = true; };
    }, [currentItem?.word, dispatch]);

    // A new word has loaded — clear any leftover reveal card from the
    // previous word so it never overlaps the next listening prompt.
    useEffect(() => {
        setRevealedAttempt(null);
    }, [currentItem?.sequence]);

    const dictionaryMatches = (entry, word) => Boolean(entry?.word) && entry.word === String(word || '').trim().toLowerCase();

    const speakWord = (word) => {
        if (activeAudioRef.current) {
            const activeAudio = activeAudioRef.current;
            activeAudioRef.current = null;
            activeAudio.pause();
        }
        const encodedWord = encodeURIComponent(String(word || '').trim().toLowerCase());
        if (!encodedWord) return;
        const audio = new Audio(`https://ssl.gstatic.com/dictionary/static/sounds/20200429/${encodedWord}--_gb_1.mp3`);
        activeAudioRef.current = audio;
        audio.onended = () => {
            activeAudioRef.current = null;
            setAudioPlaying(false);
        };
        audio.onerror = () => {
            activeAudioRef.current = null;
            setAudioPlaying(false);
        };
        setAudioPlaying(true);
        audio.play().catch(() => {
            activeAudioRef.current = null;
            setAudioPlaying(false);
        });
    };

    useEffect(() => {
        if (!session?.dictationMode?.enabled || !currentItem?.word || !dictionaryMatches(dictionaryEntry, currentItem.word) || !session.dictationMode.autoPlayOnShow) return;
        if (autoPlayedSequence.current === currentItem.sequence) return;
        autoPlayedSequence.current = currentItem.sequence;
        speakWord(currentItem.word);
    }, [currentItem, dictionaryEntry, session?.dictationMode]);

    const startSession = async () => {
        setLocalError('');
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
        } else {
            setLocalError(result.payload || t('sessionError'));
        }
    };

    const submitAttempt = async (studentInput) => {
        if (!currentItem || !session) return;
        const answeredWord = currentItem.word;
        const answeredDictionaryEntry = dictionaryMatches(dictionaryEntry, currentItem.word) ? dictionaryEntry : null;
        const result = await dispatch(submitSpellingAnswer({
            sessionId: session._id,
            sequence: currentItem.sequence,
            studentInput
        }));
        if (submitSpellingAnswer.fulfilled.match(result)) {
            setRevealedAttempt({ word: answeredWord, dictionary: answeredDictionaryEntry, correct: result.payload.attempt.correct, input: studentInput });
            setInput('');
            if (result.payload.session.status === 'in-progress') {
                dispatch(fetchSpellingCurrentItem(session._id));
            } else {
                dispatch(fetchSpellingHistory());
                dispatch(fetchSpellingRetests());
            }
        }
    };

    const submitAnswer = (event) => {
        event.preventDefault();
        submitAttempt(input);
    };

    const skipWord = () => submitAttempt('');

    const endSession = async () => {
        if (!session || loading) return;
        const result = await dispatch(endSpellingSession({ sessionId: session._id }));
        if (endSpellingSession.fulfilled.match(result)) {
            dispatch(fetchSpellingHistory());
            dispatch(fetchSpellingRetests());
        }
    };

    const openHistorySession = async (entry) => {
        setSelectedHistorySession(entry);
        setPracticePassage(null);
        setPassageLoading(true);
        try {
            const response = await api.get(`/spelling/sessions/${entry._id}/passage`);
            setPracticePassage(response.data.data);
        } catch {
            setPracticePassage(null);
        } finally {
            setPassageLoading(false);
        }
    };

    const selectedAttempts = selectedHistorySession?.attempts || [];
    const correctWords = selectedAttempts.filter((attempt) => attempt.correct);
    const incorrectWords = selectedAttempts.filter((attempt) => !attempt.correct);
    const mistakesAllowed = session?.maxMistakesAllowed || 3;

    return (
        <Box sx={{ maxWidth: 760, mx: 'auto', p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                <Typography variant="h4">{t('mySpelling')}</Typography>
                <Button variant="outlined" onClick={() => navigate('/portal/dashboard')}>{t('backToMain')}</Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {localError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError('')}>{localError}</Alert>}
            {!session && <Button variant="contained" onClick={startSession} disabled={loading}>{t('startStudentSession')}</Button>}

            {session && !sessionViewOpen && <Card sx={{ mb: 3 }}><CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                    <Box>
                        <Typography variant="subtitle1">{session.status === 'in-progress' ? 'Spelling test in progress' : t('sessionCompleted')}</Typography>
                        <Typography variant="body2" color="text.secondary">{t('correctCount', { count: session.correctCount })} | {t('mistakeCount', { count: session.mistakeCount })}</Typography>
                    </Box>
                    <Button variant="contained" onClick={() => setSessionViewOpen(true)}>
                        {session.status === 'in-progress' ? 'Continue' : t('viewDetails')}
                    </Button>
                </Stack>
            </CardContent></Card>}

            <Dialog fullScreen open={Boolean(session) && sessionViewOpen} onClose={closeSessionView}>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', p: { xs: 2, md: 5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <IconButton aria-label="Close" onClick={closeSessionView}><HiOutlineArrowLeft /></IconButton>
                            <Box>
                                <Typography variant="h5">{t('mySpelling')}</Typography>
                                <Stack direction="row" spacing={1} alignItems="baseline">
                                    <Typography variant="body2" color="text.secondary">
                                        {t('correctCount', { count: session?.correctCount || 0 })} | {t('mistakeCount', { count: session?.mistakeCount || 0 })}
                                    </Typography>
                                    {session?.status === 'in-progress' && (
                                        <Typography variant="caption" color="text.secondary">
                                            ({session.mistakeCount} / {mistakesAllowed} mistakes used)
                                        </Typography>
                                    )}
                                </Stack>
                            </Box>
                        </Stack>
                        {session?.status === 'in-progress' && <Button color="error" variant="outlined" onClick={endSession} disabled={loading}>{t('endSession')}</Button>}
                    </Stack>

                    <Box sx={{ maxWidth: 700, width: '100%', mx: 'auto', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                        {session?.attempts?.length > 0 && <Box sx={{ width: '100%' }}>
                            <Typography variant="subtitle1">Previous words</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                {session.attempts.map((attempt) => <Chip
                                    key={attempt._id || attempt.sequence}
                                    label={attempt.wordSnapshot}
                                    color={attempt.correct ? 'success' : 'error'}
                                    variant="outlined"
                                    title={attempt.correct ? 'Correct' : 'Incorrect'}
                                />)}
                            </Stack>
                        </Box>}

                        {session?.status !== 'in-progress' ? (
                            <Stack spacing={2} alignItems="center">
                                <Alert severity="success">{t('sessionCompleted')}</Alert>
                                <Button variant="contained" onClick={startSession} disabled={loading}>{t('startNewSession')}</Button>
                            </Stack>
                        ) : session.mode === 'teacher-led' ? (
                            <Alert severity="info">{t('teacherLedActive')}</Alert>
                        ) : currentItem ? (
                            <Box aria-live="polite" aria-atomic="true" sx={{ width: '100%' }}>
                                <Stack spacing={2} sx={{ width: '100%' }}>
                                    <Typography variant="body1" color="text.secondary" textAlign="center">{t('listenCarefully')}</Typography>
                                    {currentItem.definition && (
                                        <Box sx={{ textAlign: 'center', px: 2 }}>
                                            <Typography variant="caption" color="text.secondary">Definition</Typography>
                                            <Typography variant="body1">{currentItem.definition}</Typography>
                                        </Box>
                                    )}
                                    <Button
                                        variant="outlined"
                                        size="large"
                                        startIcon={<HiOutlineSpeakerWave />}
                                        onClick={() => speakWord(currentItem.word)}
                                        disabled={audioPlaying}
                                        sx={{ minHeight: 56, fontSize: '1.05rem', alignSelf: 'center', px: 4 }}
                                    >
                                        {audioPlaying ? 'Playing…' : t('hearWord')}
                                    </Button>
                                    {revealedAttempt && (
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Stack spacing={1}>
                                                    <Typography color={revealedAttempt.correct ? 'success.main' : 'error.main'} variant="h5">
                                                        {revealedAttempt.correct ? `${t('correct')} 🎉` : t('incorrect')}
                                                    </Typography>
                                                    {!revealedAttempt.correct && (
                                                        <Typography variant="body2">
                                                            Correct spelling: <strong>{revealedAttempt.word}</strong>
                                                        </Typography>
                                                    )}
                                                    {revealedAttempt.dictionary?.definitions?.slice(0, 2).map((definition) => (
                                                        <Box key={`${definition.partOfSpeech}-${definition.definition}`}>
                                                            <Typography variant="caption" color="text.secondary">{definition.partOfSpeech}</Typography>
                                                            <Typography variant="body2">{definition.definition}</Typography>
                                                        </Box>
                                                    ))}
                                                    <Button
                                                        size="small"
                                                        startIcon={<HiOutlineSpeakerWave />}
                                                        onClick={() => speakWord(revealedAttempt.word)}
                                                        disabled={audioPlaying}
                                                    >
                                                        {audioPlaying ? 'Playing…' : t('playSound')}
                                                    </Button>
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    )}
                                    <form onSubmit={submitAnswer} style={{ width: '100%' }}>
                                        <Stack spacing={2}>
                                            <TextField
                                                autoFocus
                                                label="Your answer"
                                                value={input}
                                                name="spelling-answer"
                                                autoComplete="off"
                                                spellCheck={false}
                                                helperText="Type only what you hear — pasting and right-click are turned off for this test."
                                                onChange={(event) => setInput(event.target.value)}
                                                onPaste={(event) => event.preventDefault()}
                                                onDrop={(event) => event.preventDefault()}
                                                onContextMenu={(event) => event.preventDefault()}
                                            />
                                            <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1}>
                                                <Button type="button" variant="outlined" size="large" onClick={skipWord} disabled={loading} sx={{ flex: 1 }}>
                                                    Skip word
                                                </Button>
                                                <Button type="submit" variant="contained" size="large" disabled={loading || !input.trim()} sx={{ flex: 1 }}>
                                                    {t('submitAnswer')}
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    </form>
                                </Stack>
                            </Box>
                        ) : (
                            <Stack spacing={2} alignItems="center">
                                <Typography variant="body1" color="text.secondary">Loading next word...</Typography>
                            </Stack>
                        )}
                    </Box>
                </DialogContent>
            </Dialog>
            {session?.status !== 'in-progress' && retests.length > 0 && <>
                <Typography variant="h6">{t('pendingRetests')}</Typography>
                <Stack spacing={1} sx={{ my: 1 }}>
                    {retests.map((retest) => <Chip key={retest._id} label={`${retest.wordSnapshot} - due ${new Date(retest.dueAt).toLocaleDateString()}`} color={new Date(retest.dueAt) < new Date() ? 'error' : 'warning'} />)}
                </Stack>
            </>}
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6">{t('sessionHistory')}</Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>{history.map((entry) => <Stack key={entry._id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}><Box><Typography>{new Date(entry.startedAt).toLocaleDateString()} - {entry.correctCount} correct, {entry.mistakeCount} incorrect</Typography>{entry.practicePassage && <Typography variant="caption" color="success.main">Practice passage available</Typography>}</Box><Button size="small" variant="outlined" onClick={() => openHistorySession(entry)}>{t('viewDetails')}</Button></Stack>)}</Stack>
            <Dialog open={Boolean(selectedHistorySession)} onClose={() => setSelectedHistorySession(null)} fullWidth maxWidth="sm">
                <DialogTitle>{t('sessionDetails')}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        <Typography color="text.secondary">{selectedHistorySession && new Date(selectedHistorySession.startedAt).toLocaleDateString()}</Typography>
                        <Box><Typography variant="subtitle1">{t('correctWords')}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{correctWords.length ? correctWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="success" icon={<span aria-hidden="true">✓</span>} />) : <Typography color="text.secondary">{t('none')}</Typography>}</Stack></Box>
                        <Box><Typography variant="subtitle1">{t('incorrectWords')}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{incorrectWords.length ? incorrectWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="error" icon={<span aria-hidden="true">×</span>} />) : <Typography color="text.secondary">{t('none')}</Typography>}</Stack></Box>
                        {passageLoading && <Typography color="text.secondary">Loading practice passage…</Typography>}
                        {!passageLoading && practicePassage && (
                            <Box>
                                <Typography variant="subtitle1">Practice passage</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>These are the target words to practice. This is practice material, not a grade.</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                    {(practicePassage.missedWords || []).map((word) => <Chip key={word} label={word} color="warning" variant="outlined" />)}
                                </Stack>
                                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{practicePassage.content}</Typography>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions><Button onClick={() => setSelectedHistorySession(null)}>{t('close')}</Button></DialogActions>
            </Dialog>
        </Box>
    );
};

export default SpellingStudentPage;