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
    selectSpelling,
    startSelfServeSpellingSession,
    submitSpellingAnswer,
    fetchSpellingDictionaryEntry
} from '../../store/slices/spellingSlice';
import SpellingVoicePanel from './SpellingVoicePanel';
import { playUrl, playWithFallback, readStoredVoice, resolveVoice, storeVoice } from '../../utils/voicePlayback';

const isSkippedSpellingAttempt = (attempt, mode) => attempt?.skipped === true || (
    mode === 'self-serve'
    && attempt?.skipped === undefined
    && !String(attempt?.studentInput ?? '').trim()
);

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
    const [selectedVoice, setSelectedVoice] = useState(() => readStoredVoice());
    const [voiceNotice, setVoiceNotice] = useState('');
    const [sessionViewOpen, setSessionViewOpen] = useState(false);
    const [integrityNotice, setIntegrityNotice] = useState(false);
    const autoPlayedSequence = useRef(null);
    const activeAudioRef = useRef(null);
    const wasPageHiddenRef = useRef(false);
    const pendingIntegrityEventRef = useRef(null);
    const currentSequenceRef = useRef(null);
    currentSequenceRef.current = currentItem?.sequence || null;

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
        if (!session?._id) return undefined;
        // Keep completed results current too, in case a teacher corrects an answer after the test.
        const pollInterval = session.status !== 'in-progress'
            ? 10000
            : session.mode === 'self-serve' ? 8000 : 4000;
        const refreshSession = () => {
            dispatch(fetchSpellingCurrentItem(session._id));
            if (session.status !== 'in-progress') {
                dispatch(fetchSpellingHistory());
                dispatch(fetchSpellingRetests());
            }
        };
        const intervalId = window.setInterval(refreshSession, pollInterval);
        return () => window.clearInterval(intervalId);
    }, [dispatch, session?._id, session?.status, session?.mode]);

    useEffect(() => {
        if (!selectedHistorySession?._id) return;
        const latestSession = history.find((entry) => String(entry._id) === String(selectedHistorySession._id));
        if (latestSession && latestSession.updatedAt !== selectedHistorySession.updatedAt) {
            setSelectedHistorySession(latestSession);
        }
    }, [history, selectedHistorySession]);

    useEffect(() => {
        if (!selectedHistorySession?._id) return undefined;
        const intervalId = window.setInterval(() => dispatch(fetchSpellingHistory()), 10000);
        return () => window.clearInterval(intervalId);
    }, [dispatch, selectedHistorySession?._id]);

    useEffect(() => {
        if (!currentItem?.word || currentItem.audio) return;
        let cancelled = false;
        dispatch(fetchSpellingDictionaryEntry(currentItem.word)).then((result) => {
            if (!cancelled && fetchSpellingDictionaryEntry.fulfilled.match(result)) setDictionaryEntry(result.payload);
        });
        return () => { cancelled = true; };
    }, [currentItem?.word, currentItem?.audio, dispatch]);

    useEffect(() => {
        if (!session?._id || session.status !== 'in-progress') return undefined;
        const sessionId = session._id;

        const postIntegrityEvent = async (event) => {
            pendingIntegrityEventRef.current = event;
            try {
                await api.post(`/spelling/sessions/${sessionId}/integrity-events`, event);
                if (pendingIntegrityEventRef.current?.eventId === event.eventId) pendingIntegrityEventRef.current = null;
            } catch {
                return;
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                if (wasPageHiddenRef.current) return;
                wasPageHiddenRef.current = true;
                const event = {
                    eventId: crypto.randomUUID(),
                    eventType: 'page_hidden',
                    sequence: currentSequenceRef.current,
                    occurredAt: new Date().toISOString()
                };
                postIntegrityEvent(event);
                return;
            }

            if (!wasPageHiddenRef.current) return;
            wasPageHiddenRef.current = false;
            setIntegrityNotice(true);
            if (pendingIntegrityEventRef.current) postIntegrityEvent(pendingIntegrityEventRef.current);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            wasPageHiddenRef.current = false;
            pendingIntegrityEventRef.current = null;
        };
    }, [session?._id, session?.status]);

    // A new word has loaded — clear any leftover reveal card from the
    // previous word so it never overlaps the next listening prompt.
    useEffect(() => {
        setRevealedAttempt(null);
        setVoiceNotice('');
    }, [currentItem?.sequence]);

    const dictionaryMatches = (entry, word) => Boolean(entry?.word) && entry.word === String(word || '').trim().toLowerCase();

    const playDefaultWord = (word) => {
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

    const finishPlayback = () => {
        activeAudioRef.current = null;
        setAudioPlaying(false);
    };

    // Chosen dictionary voice -> Default (the original playback above). Missing voice or any failure uses Default.
    const speakWord = (word, audio = null, voiceId = selectedVoice) => {
        const voice = resolveVoice(audio, voiceId);
        if (!voice) {
            playDefaultWord(word);
            return;
        }
        if (activeAudioRef.current) activeAudioRef.current.pause();
        setAudioPlaying(true);
        const { handle } = playWithFallback({
            url: voice.url,
            playDefault: () => playDefaultWord(word),
            onFallback: () => setVoiceNotice("That voice isn't available right now, so we used the default voice."),
            onEnded: finishPlayback
        });
        activeAudioRef.current = { pause: handle.cancel };
    };

    const playExample = (url) => {
        if (activeAudioRef.current) activeAudioRef.current.pause();
        setAudioPlaying(true);
        const handle = playUrl(url, {
            onEnded: finishPlayback,
            onFail: () => {
                finishPlayback();
                setVoiceNotice("That example isn't available right now.");
            }
        });
        activeAudioRef.current = { pause: handle.cancel };
    };

    const selectVoice = (voiceId) => {
        setSelectedVoice(voiceId);
        storeVoice(voiceId);
        setVoiceNotice('');
        if (currentItem?.word) speakWord(currentItem.word, currentItem.audio, voiceId);
    };

    useEffect(() => {
        if (!session?.dictationMode?.enabled || !currentItem?.word || (!currentItem.audio && !dictionaryMatches(dictionaryEntry, currentItem.word)) || !session.dictationMode.autoPlayOnShow) return;
        if (autoPlayedSequence.current === currentItem.sequence) return;
        autoPlayedSequence.current = currentItem.sequence;
        speakWord(currentItem.word, currentItem.audio);
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

    const submitAttempt = async (studentInput, skipped = false) => {
        if (!currentItem || !session) return;
        const answeredWord = currentItem.word;
        const answeredDictionaryEntry = dictionaryMatches(dictionaryEntry, currentItem.word) ? dictionaryEntry : null;
        const answeredAudio = currentItem.audio || null;
        const result = await dispatch(submitSpellingAnswer({
            sessionId: session._id,
            sequence: currentItem.sequence,
            studentInput,
            skipped
        }));
        if (submitSpellingAnswer.fulfilled.match(result)) {
            setRevealedAttempt({
                word: answeredWord,
                dictionary: answeredDictionaryEntry,
                audio: answeredAudio,
                correct: result.payload.attempt.correct,
                skipped: result.payload.attempt.skipped,
                input: studentInput
            });
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
    const incorrectWords = selectedAttempts.filter((attempt) => !attempt.correct && !isSkippedSpellingAttempt(attempt, selectedHistorySession?.mode));
    const skippedHistoryWords = selectedAttempts.filter((attempt) => isSkippedSpellingAttempt(attempt, selectedHistorySession?.mode));
    const answerReviewAttempts = (attempts, mode) => (attempts || []).filter((attempt) => (
        mode === 'self-serve'
        && String(attempt.studentInput ?? '').trim()
        && (!attempt.correct || attempt.correctedAt)
    ));
    // "giraaaa × giraffe" for a wrong answer, "giraaaa ✓ giraffe" once the teacher accepts it, "giraffe ✓" when correct.
    const previousWordLabel = (attempt, mode) => {
        const word = attempt.wordSnapshot;
        const typed = String(attempt.studentInput ?? '').trim();
        if (isSkippedSpellingAttempt(attempt, mode)) return word;
        if (mode === 'self-serve' && typed && attempt.correctedAt) return `${typed} ✓ ${word}`;
        if (attempt.correct) return `${word} ✓`;
        return mode === 'self-serve' && typed ? `${typed} × ${word}` : word;
    };    const hasSkippedWords = session?.attempts?.some((attempt) => isSkippedSpellingAttempt(attempt, session.mode));
    const mistakesAllowed = session?.maxMistakesAllowed || 3;

    return (
        <Box sx={{ maxWidth: 760, mx: 'auto', p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                <Typography variant="h4">{t('mySpelling')}</Typography>
                <Button variant="outlined" onClick={() => navigate('/portal/dashboard')}>{t('backToMain')}</Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {localError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError('')}>{localError}</Alert>}
            {!session && <>
                <Alert severity="info" sx={{ mb: 2 }}>
                    During a spelling session, when this page becomes hidden, the event is recorded for your teacher. This can happen when switching tabs or minimizing the browser.
                </Alert>
                <Button variant="contained" onClick={startSession} disabled={loading}>{t('startStudentSession')}</Button>
            </>}

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
                    {integrityNotice && <Alert severity="info" role="status" onClose={() => setIntegrityNotice(false)} sx={{ mb: 2 }}>
                        Leaving this spelling session page was recorded.
                    </Alert>}
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
                    </Stack>

                    <Box sx={{ maxWidth: 700, width: '100%', mx: 'auto', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                        {session?.attempts?.length > 0 && <Box sx={{ width: '100%' }}>
                            <Typography variant="subtitle1">Previous words</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                {session.attempts.map((attempt) => <Chip
                                    key={attempt._id || attempt.sequence}
                                    label={previousWordLabel(attempt, session.mode)}
                                    color={isSkippedSpellingAttempt(attempt, session.mode) ? 'warning' : attempt.correct ? 'success' : 'error'}
                                    variant="outlined"
                                    title={isSkippedSpellingAttempt(attempt, session.mode) ? t('skipped') : attempt.correct ? 'Correct' : 'Incorrect'}
                                />)}
                            </Stack>
                        </Box>}
                        {session?.status !== 'in-progress' ? (
                            <Stack spacing={2} alignItems="center">
                                <Alert severity="success">{t('sessionCompleted')}</Alert>
                                {hasSkippedWords && <Alert severity="info">{t('teacherWillReviewSkippedWords')}</Alert>}
                                <Button variant="contained" onClick={startSession} disabled={loading}>{t('startNewSession')}</Button>
                            </Stack>
                        ) : currentItem?.alreadyCompleted ? (
                            <Alert severity="success" role="status">
                                {t('alreadyCompletedClassWord')}
                            </Alert>
                        ) : currentItem?.waitingForClass ? (
                            <Alert severity="info" role="status">
                                {t('waitingForClass')}
                            </Alert>
                        ) : session.mode === 'teacher-led' ? (
                            <Alert severity="info">{t('teacherLedActive')}</Alert>
                        ) : currentItem ? (
                            <Box aria-live="polite" aria-atomic="true" sx={{ width: '100%' }}>
                                <Stack spacing={2} sx={{ width: '100%' }}>
                                    {currentItem.definition && (
                                        <Box sx={{ textAlign: 'center', px: 2 }}>
                                            <Typography variant="caption" color="text.secondary">Definition</Typography>
                                            <Typography variant="body1">{currentItem.definition}</Typography>
                                        </Box>
                                    )}
                                    {/* Words with dictionary audio use the voice panel; others keep the original play button. */}
                                    {!currentItem.audio && (
                                    <Button
                                        variant="outlined"
                                        size="large"
                                        startIcon={<HiOutlineSpeakerWave />}
                                        onClick={() => speakWord(currentItem.word, currentItem.audio)}
                                        disabled={audioPlaying}
                                        sx={{ minHeight: 56, fontSize: '1.05rem', alignSelf: 'center', px: 4 }}
                                    >
                                        {audioPlaying ? 'Playing…' : t('hearWord')}
                                    </Button>
                                    )}
                                    {currentItem.audio && (
                                        <SpellingVoicePanel
                                            audio={currentItem.audio}
                                            selectedVoice={selectedVoice}
                                            disabled={audioPlaying}
                                            onSelectVoice={selectVoice}
                                            onPlayExample={playExample}
                                        />
                                    )}
                                    {voiceNotice && <Alert severity="info" role="status">{voiceNotice}</Alert>}
                                    {revealedAttempt && (
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Stack spacing={1}>
                                                    <Typography color={revealedAttempt.skipped ? 'warning.main' : revealedAttempt.correct ? 'success.main' : 'error.main'} variant="h5">
                                                        {revealedAttempt.skipped ? t('skipped') : revealedAttempt.correct ? `${t('correct')} 🎉` : t('incorrect')}
                                                    </Typography>
                                                    {!revealedAttempt.correct && (
                                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
                                                            <Typography variant="body2">
                                                                Your answer: <strong>{String(revealedAttempt.input || '').trim() || 'Skipped'}</strong>
                                                            </Typography>
                                                            <Typography variant="body2">
                                                                Correct spelling: <strong>{revealedAttempt.word}</strong>
                                                            </Typography>
                                                        </Stack>
                                                    )}
                                                    {revealedAttempt.audio?.definition && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary">Definition</Typography>
                                                            <Typography variant="body2">{revealedAttempt.audio.definition}</Typography>
                                                        </Box>
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
                                                        onClick={() => speakWord(revealedAttempt.word, revealedAttempt.audio)}
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
            <Stack spacing={1} sx={{ mt: 1 }}>{history.map((entry) => <Stack key={entry._id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}><Box><Typography>{entry.curriculumGrade ? `${entry.curriculumGrade} - ` : ''}{new Date(entry.startedAt).toLocaleDateString()} - {entry.correctCount} correct, {entry.mistakeCount} incorrect</Typography>{entry.practicePassage && <Typography variant="caption" color="success.main">Practice passage available</Typography>}</Box><Button size="small" variant="outlined" onClick={() => openHistorySession(entry)}>{t('viewDetails')}</Button></Stack>)}</Stack>
            <Dialog open={Boolean(selectedHistorySession)} onClose={() => setSelectedHistorySession(null)} fullWidth maxWidth="sm">
                <DialogTitle>{t('sessionDetails')}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        <Typography color="text.secondary">{selectedHistorySession && new Date(selectedHistorySession.startedAt).toLocaleDateString()}</Typography>
                        <Box><Typography variant="subtitle1">{t('correctWords')}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{correctWords.length ? correctWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="success" icon={<span aria-hidden="true">✓</span>} />) : <Typography color="text.secondary">{t('none')}</Typography>}</Stack></Box>
                        <Box><Typography variant="subtitle1">{t('incorrectWords')}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{incorrectWords.length ? incorrectWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="error" icon={<span aria-hidden="true">×</span>} />) : <Typography color="text.secondary">{t('none')}</Typography>}</Stack></Box>
                        {answerReviewAttempts(selectedAttempts, selectedHistorySession?.mode).length > 0 && (
                            <Box>
                                <Typography variant="subtitle1">Answer comparison</Typography>
                                <Stack spacing={1} sx={{ mt: 1 }}>
                                    {answerReviewAttempts(selectedAttempts, selectedHistorySession?.mode).map((attempt) => (
                                        <Stack key={attempt._id || attempt.sequence} direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                            <Typography sx={{ flex: 1 }}>Your answer: <strong>{attempt.studentInput}</strong></Typography>
                                            <Typography sx={{ flex: 1 }}>Correct spelling: <strong>{attempt.wordSnapshot}</strong></Typography>
                                            {attempt.correctedAt && <Chip size="small" color="success" label="Accepted by teacher" />}
                                        </Stack>
                                    ))}
                                </Stack>
                            </Box>
                        )}
                        {skippedHistoryWords.length > 0 && <Box><Typography variant="subtitle1">{t('skippedWords')}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>{skippedHistoryWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="warning" variant="outlined" />)}</Stack></Box>}
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