import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress, Pagination, Stack, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { HiOutlineArrowLeft, HiOutlineCheck, HiOutlineHandRaised, HiOutlineMinus, HiOutlineSpeakerWave, HiOutlineXMark } from 'react-icons/hi2';
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
    submitSpellingAnswer,
    fetchSpellingDictionaryEntry
} from '../../store/slices/spellingSlice';
import SpellingVoicePanel from './SpellingVoicePanel';
import { getVoiceOptions, playUrl, playWithFallback, readStoredVoice, resolveVoice, storeVoice } from '../../utils/voicePlayback';

const HISTORY_PAGE_SIZE = 8;

const isSkippedSpellingAttempt = (attempt, mode) => attempt?.skipped === true || (
    mode === 'self-serve'
    && attempt?.skipped === undefined
    && !String(attempt?.studentInput ?? '').trim()
);

const pollWhenVisible = (callback, intervalMs) => {
    let timerId;
    let requestInFlight = false;
    let stopped = false;

    const schedule = () => {
        window.clearTimeout(timerId);
        if (!stopped && document.visibilityState === 'visible') {
            timerId = window.setTimeout(run, intervalMs);
        }
    };

    const run = async () => {
        if (stopped || requestInFlight) return;
        if (document.visibilityState !== 'visible') {
            schedule();
            return;
        }
        requestInFlight = true;
        try {
            await callback();
        } finally {
            requestInFlight = false;
            schedule();
        }
    };

    const handleVisibilityChange = () => {
        window.clearTimeout(timerId);
        if (document.visibilityState === 'visible') void run();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    schedule();
    return () => {
        stopped = true;
        window.clearTimeout(timerId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
};

const SpellingStudentPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation('spelling');
    const { history, retests, session, currentItem, loading, error } = useSelector(selectSpelling);
    const [input, setInput] = useState('');
    const [localError, setLocalError] = useState('');
    const [checkingForSession, setCheckingForSession] = useState(false);
    const [sessionCheckMessage, setSessionCheckMessage] = useState('');
    const [selectedHistorySession, setSelectedHistorySession] = useState(null);
    const [historyPage, setHistoryPage] = useState(1);
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
    const currentItemRequestsRef = useRef(new Map());
    currentSequenceRef.current = currentItem?.sequence || null;

    const loadCurrentItem = useCallback(async (sessionId, forceRefresh = false) => {
        const requests = currentItemRequestsRef.current;
        const existingRequest = requests.get(sessionId);
        if (existingRequest) {
            const result = await existingRequest;
            if (!forceRefresh) return result;
            const requestAfterWait = requests.get(sessionId);
            if (requestAfterWait) return requestAfterWait;
        }

        const request = dispatch(fetchSpellingCurrentItem(sessionId));
        requests.set(sessionId, request);
        try {
            return await request;
        } finally {
            if (requests.get(sessionId) === request) requests.delete(sessionId);
        }
    }, [dispatch]);

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
                await loadCurrentItem(result.payload._id);
            }
        };
        joinActiveSession();
    }, [dispatch, loadCurrentItem]);

    useEffect(() => {
        if (!session?._id) return undefined;
        if (session.status === 'in-progress') {
            return pollWhenVisible(() => loadCurrentItem(session._id), 60000);
        }
        return undefined;
    }, [loadCurrentItem, session?._id, session?.status]);

    useEffect(() => {
        if (!selectedHistorySession?._id) return;
        const latestSession = history.find((entry) => String(entry._id) === String(selectedHistorySession._id));
        if (latestSession && latestSession.updatedAt !== selectedHistorySession.updatedAt) {
            setSelectedHistorySession(latestSession);
        }
    }, [history, selectedHistorySession]);

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

    const isPluralWithoutOxfordAudio = (item) => {
        const word = String(item?.word || '').trim().toLowerCase();
        if (!/[a-z]s$/.test(word) || /(ss|us|is)$/.test(word)) return false;
        return !getVoiceOptions(item.audio).some((option) => option.dictionary === 'oxford');
    };

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

    const checkForSessions = async ({ refreshCompleted = false } = {}) => {
        if (checkingForSession) return;
        setCheckingForSession(true);
        setSessionCheckMessage('');
        setLocalError('');
        try {
            const result = await dispatch(fetchActiveSpellingSession({
                preserveExisting: refreshCompleted && session?.status !== 'in-progress'
            }));
            if (fetchActiveSpellingSession.fulfilled.match(result) && result.payload) {
                const isDifferentSession = String(result.payload._id) !== String(session?._id);
                if (!refreshCompleted || isDifferentSession) {
                    await loadCurrentItem(result.payload._id);
                } else {
                    await Promise.all([
                        loadCurrentItem(session._id, true),
                        dispatch(fetchSpellingHistory()),
                        dispatch(fetchSpellingRetests())
                    ]);
                    setSessionCheckMessage(t('sessionDetailsRefreshed'));
                }
            } else if (fetchActiveSpellingSession.rejected.match(result)) {
                setLocalError(result.payload || 'Unable to check for a spelling session. Please try again.');
            } else if (refreshCompleted && session?._id) {
                await Promise.all([
                    loadCurrentItem(session._id, true),
                    dispatch(fetchSpellingHistory()),
                    dispatch(fetchSpellingRetests())
                ]);
                setSessionCheckMessage(t('sessionDetailsRefreshed'));
            } else {
                setSessionCheckMessage(t('noSessionAvailable'));
            }
        } finally {
            setCheckingForSession(false);
        }
    };

    const raiseHand = async () => {
        if (!session?._id || !currentItem?.sequence) return;
        setLocalError('');
        try {
            await api.post(`/spelling/sessions/${session._id}/raise-hand`, { sequence: currentItem.sequence });
            await loadCurrentItem(session._id, true);
        } catch (error) {
            setLocalError(error.response?.data?.message || 'Unable to raise your hand. Please try again.');
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
                await loadCurrentItem(session._id, true);
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
        dispatch(fetchSpellingHistory());
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
    };

    const hasSkippedWords = session?.attempts?.some((attempt) => isSkippedSpellingAttempt(attempt, session.mode));
    const mistakesAllowed = session?.maxMistakesAllowed || 3;
    const answeredWords = session?.attempts?.length || 0;
    const mistakesRemaining = Math.max(mistakesAllowed - (session?.mistakeCount || 0), 0);
    // An open-ended assessment has no fixed word list on the client, so the mistake
    // budget is the only honest signal of how close the session is to ending.
    const retestWordTotal = session?.assessmentType === 'retest-quiz' ? session.retestQuizItems?.length || 0 : 0;
    const retestWordsCompleted = Math.min(session?.attempts?.length || 0, retestWordTotal);
    const retestCurrentWordNumber = session?.status === 'in-progress'
        ? Math.min(retestWordsCompleted + 1, retestWordTotal)
        : retestWordsCompleted;

    // The sessions endpoint hands back the most recent 50, so paging happens here
    // instead of pretending the list is unbounded. Clamping the page keeps a
    // refreshed, shorter list from landing on an empty page.
    const historyPageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
    const safeHistoryPage = Math.min(historyPage, historyPageCount);
    const historyStart = (safeHistoryPage - 1) * HISTORY_PAGE_SIZE;
    const pagedHistory = history.slice(historyStart, historyStart + HISTORY_PAGE_SIZE);

    return (
        <Box sx={{ maxWidth: 820, mx: 'auto', p: { xs: 2, sm: 3 } }}>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={1.5}
                sx={{ mb: 3 }}
            >
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>{t('mySpelling')}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('listenCarefully')}</Typography>
                </Box>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<HiOutlineArrowLeft />}
                    onClick={() => navigate('/portal/dashboard')}
                >
                    {t('backToMain')}
                </Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {localError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError('')}>{localError}</Alert>}
            {sessionCheckMessage && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setSessionCheckMessage('')}>{sessionCheckMessage}</Alert>}
            {!session && (
                <Card variant="outlined" sx={{ mb: 3 }}>
                    <CardContent sx={{ textAlign: 'center', py: { xs: 4, sm: 6 }, px: 3 }}>
                        <Stack spacing={2} alignItems="center">
                            <Typography variant="h6">{t('waitingForTeacherSession')}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
                                {t('hiddenPageNotice')}
                            </Typography>
                            <Button
                                variant="contained"
                                size="large"
                                onClick={checkForSessions}
                                disabled={checkingForSession}
                                startIcon={checkingForSession ? <CircularProgress size={16} color="inherit" /> : null}
                            >
                                {checkingForSession ? t('checkingForSessions') : t('checkForSessions')}
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {session && !sessionViewOpen && (
                <Card variant="outlined" sx={{ mb: 3 }}>
                    <CardContent>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            justifyContent="space-between"
                            alignItems={{ xs: 'flex-start', sm: 'center' }}
                            spacing={2}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                    {session.status === 'in-progress' ? t('testInProgress') : t('sessionCompleted')}
                                </Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                                    <Chip size="small" variant="outlined" color="success" label={t('correctCount', { count: session.correctCount })} />
                                    <Chip size="small" variant="outlined" color="error" label={t('mistakeCount', { count: session.mistakeCount })} />
                                </Stack>
                            </Box>
                            <Button variant="contained" onClick={() => setSessionViewOpen(true)}>
                                {session.status === 'in-progress' ? t('continueTest') : t('viewDetails')}
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            <Dialog fullScreen open={Boolean(session) && sessionViewOpen} onClose={closeSessionView} aria-labelledby="spelling-session-title">
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', p: { xs: 2, md: 5 } }}>
                    {integrityNotice && <Alert severity="info" role="status" onClose={() => setIntegrityNotice(false)} sx={{ mb: 2 }}>
                        {t('leavingRecordedNotice')}
                    </Alert>}
                    <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 3 }}>
                        <IconButton
                            aria-label={t('close')}
                            onClick={closeSessionView}
                            size="small"
                            sx={{ mt: 0.5, border: 1, borderColor: 'divider' }}
                        >
                            <HiOutlineArrowLeft />
                        </IconButton>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography id="spelling-session-title" variant="h5" sx={{ fontWeight: 700 }}>{t('mySpelling')}</Typography>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                <Chip size="small" color="success" variant="outlined" label={t('correctCount', { count: session?.correctCount || 0 })} />
                                {session?.status !== 'in-progress' && (
                                    <Chip size="small" color="error" variant="outlined" label={t('mistakeCount', { count: session?.mistakeCount || 0 })} />
                                )}
                                <Chip size="small" variant="outlined" label={`${t('wordsAnswered')}: ${answeredWords}`} />
                            </Stack>
                            {session?.status === 'in-progress' && retestWordTotal === 0 && (
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                                    {/* The budget is the only honest progress signal here: the
                                        session ends when it runs out, not at a fixed word count. */}
                                    {mistakesAllowed <= 5 ? (
                                        <Box role="img" aria-label={t('mistakesRemaining', { value: mistakesRemaining, max: mistakesAllowed })} sx={{ display: 'flex', gap: 0.5 }}>
                                            {Array.from({ length: mistakesAllowed }, (_, index) => (
                                                <Box
                                                    key={index}
                                                    sx={{
                                                        width: 12,
                                                        height: 12,
                                                        borderRadius: '50%',
                                                        bgcolor: index < (session?.mistakeCount || 0) ? 'error.main' : 'action.disabledBackground'
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    ) : (
                                        <LinearProgress
                                            variant="determinate"
                                            color={mistakesRemaining <= 1 ? 'error' : 'primary'}
                                            value={(mistakesRemaining / mistakesAllowed) * 100}
                                            aria-hidden="true"
                                            sx={{ width: 120, height: 8, borderRadius: 4 }}
                                        />
                                    )}
                                    <Typography variant="caption" color="text.secondary">
                                        {t('mistakesRemaining', { value: mistakesRemaining, max: mistakesAllowed })}
                                    </Typography>
                                </Stack>
                            )}
                            {retestWordTotal > 0 && (
                                <Box sx={{ mt: 1.5, minWidth: 180 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {t('retestProgress', {
                                            current: retestCurrentWordNumber,
                                            total: retestWordTotal,
                                            completed: retestWordsCompleted
                                        })}
                                    </Typography>
                                    <LinearProgress
                                        aria-label={t('retestProgressAria', {
                                            completed: retestWordsCompleted,
                                            total: retestWordTotal
                                        })}
                                        variant="determinate"
                                        value={(retestWordsCompleted / retestWordTotal) * 100}
                                        sx={{ mt: 0.75, height: 8, borderRadius: 4 }}
                                    />
                                </Box>
                            )}
                        </Box>
                    </Stack>

                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(280px, 1fr)' },
                        gridTemplateRows: { xs: 'minmax(0, 1fr) auto', md: 'minmax(0, 1fr)' },
                        gap: 2,
                        alignItems: 'stretch',
                        maxWidth: 1400,
                        width: '100%',
                        mx: 'auto',
                        flex: 1,
                        minHeight: 0
                    }}>
                        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        {session?.status !== 'in-progress' ? (
                            <Stack spacing={2} alignItems="center">
                                <Alert severity="success">{t('sessionCompleted')}</Alert>
                                {hasSkippedWords && <Alert severity="info">{t('teacherWillReviewSkippedWords')}</Alert>}
                                <Button
                                    variant="outlined"
                                    onClick={() => checkForSessions({ refreshCompleted: true })}
                                    disabled={checkingForSession}
                                    startIcon={checkingForSession ? <CircularProgress size={16} color="inherit" /> : null}
                                >
                                    {checkingForSession ? t('checkingForSessions') : t('checkForUpdates')}
                                </Button>
                            </Stack>
                        ) : session.mode === 'teacher-led' ? (
                            <Stack spacing={2}>
                                <Alert severity="info">{t('teacherLedActive')}</Alert>
                                {currentItem?.sequence && (
                                    <Alert
                                        severity={currentItem.handRaised ? 'success' : 'info'}
                                        icon={<HiOutlineHandRaised />}
                                        action={currentItem.handRaised ? null : (
                                            <Button color="inherit" size="small" variant="outlined" onClick={raiseHand}>{t('raiseYourHand')}</Button>
                                        )}
                                    >
                                        {currentItem.handRaised ? t('handIsRaised') : t('needHelpHint')}
                                    </Alert>
                                )}
                            </Stack>
                        ) : currentItem ? (
                            <Box aria-live="polite" aria-atomic="true" sx={{ width: '100%' }}>
                                <Stack spacing={2} sx={{ width: '100%' }}>
                                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, justifyContent: 'center' }}>
                                        {currentItem.category && (
                                            <Chip size="small" color="primary" variant="outlined" label={`${t('category')}: ${currentItem.category}`} />
                                        )}
                                        {currentItem.grade && (
                                            <Chip size="small" variant="outlined" label={`${t('grade')}: ${currentItem.grade}`} />
                                        )}
                                        {currentItem.week && (
                                            <Chip size="small" variant="outlined" label={`${t('week')}: ${currentItem.week}`} />
                                        )}
                                    </Stack>
                                    {currentItem.definition && (
                                        <Box sx={{
                                            textAlign: 'left',
                                            px: 2.5,
                                            py: 2,
                                            border: 1,
                                            borderColor: 'divider',
                                            borderLeft: 5,
                                            borderLeftColor: 'primary.main',
                                            borderRadius: 2,
                                            bgcolor: 'background.paper',
                                            boxShadow: (theme) => theme.shadows[2]
                                        }}>
                                            <Typography variant="overline" sx={{ color: 'primary.light', fontWeight: 800, letterSpacing: '.08em' }}>{t('definitionLabel')}</Typography>
                                            <Typography variant="body1" sx={{ color: 'text.primary', fontSize: '1.05rem', lineHeight: 1.6 }}>{currentItem.definition}</Typography>
                                        </Box>
                                    )}
                                    {/* Words with dictionary audio use the voice panel; others keep the original play button. */}
                                    {!currentItem.audio && (
                                    <Button
                                        variant="contained"
                                        size="large"
                                        startIcon={audioPlaying ? <CircularProgress size={18} color="inherit" /> : <HiOutlineSpeakerWave />}
                                        onClick={() => speakWord(currentItem.word, currentItem.audio)}
                                        disabled={audioPlaying}
                                        sx={{ minHeight: 56, fontSize: '1.05rem', alignSelf: 'center', px: 4, fontWeight: 700 }}
                                    >
                                        {t('hearWord')}
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
                                    <Alert
                                        severity={currentItem.handRaised ? 'success' : 'info'}
                                        role="note"
                                        icon={<HiOutlineHandRaised />}
                                        action={currentItem.handRaised ? null : (
                                        <Button color="inherit" size="small" variant="contained" onClick={raiseHand}>{t('raiseYourHand')}</Button>
                                        )}
                                    >
                                        {currentItem.handRaised
                                            ? t('handIsRaised')
                                            : isPluralWithoutOxfordAudio(currentItem)
                                                ? t('pluralNoOxfordAudio')
                                                : t('needHelpHint')}
                                    </Alert>
                                    {voiceNotice && <Alert severity="info" role="status">{voiceNotice}</Alert>}
                                    {revealedAttempt && (
                                        <Card
                                            variant="outlined"
                                            sx={(theme) => {
                                                const tone = revealedAttempt.skipped
                                                    ? theme.palette.warning.main
                                                    : revealedAttempt.correct
                                                        ? theme.palette.success.main
                                                        : theme.palette.error.main;
                                                return {
                                                    borderColor: alpha(tone, 0.5),
                                                    bgcolor: alpha(tone, theme.palette.mode === 'light' ? 0.06 : 0.12)
                                                };
                                            }}
                                        >
                                            <CardContent>
                                                <Stack spacing={1.5}>
                                                    <Typography
                                                        color={revealedAttempt.skipped ? 'warning.main' : revealedAttempt.correct ? 'success.main' : 'error.main'}
                                                        variant="h5"
                                                        sx={{ fontWeight: 800, textAlign: 'center' }}
                                                    >
                                                        {revealedAttempt.skipped ? t('skipped') : revealedAttempt.correct ? `${t('correct')} 🎉` : t('incorrect')}
                                                    </Typography>
                                                    {!revealedAttempt.correct && (
                                                        <Box sx={{
                                                            display: 'grid',
                                                            gap: 1,
                                                            textAlign: 'center',
                                                            gridTemplateColumns: { xs: '1fr', sm: revealedAttempt.skipped ? '1fr' : '1fr auto 1fr' }
                                                        }}>
                                                            <Box>
                                                                <Typography variant="caption" color="text.secondary">{t('yourAnswerLabel')}</Typography>
                                                                <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                                                                    {String(revealedAttempt.input || '').trim() || t('skippedAnswer')}
                                                                </Typography>
                                                            </Box>
                                                            {!revealedAttempt.skipped && (
                                                                <>
                                                                    <Typography color="error.main" aria-hidden="true">×</Typography>
                                                                    <Box>
                                                                        <Typography variant="caption" color="text.secondary">{t('correctSpellingLabel')}</Typography>
                                                                        <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{revealedAttempt.word}</Typography>
                                                                    </Box>
                                                                </>
                                                            )}
                                                        </Box>
                                                    )}
                                                    {revealedAttempt.audio?.definition && (
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary">{t('definitionLabel')}</Typography>
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
                                                        startIcon={audioPlaying ? <CircularProgress size={14} color="inherit" /> : <HiOutlineSpeakerWave />}
                                                        onClick={() => speakWord(revealedAttempt.word, revealedAttempt.audio)}
                                                        disabled={audioPlaying}
                                                    >
                                                        {t('playSound')}
                                                    </Button>
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    )}
                                    <form onSubmit={submitAnswer} style={{ width: '100%' }}>
                                        <Stack spacing={2}>
                                            <TextField
                                                autoFocus
                                                fullWidth
                                                label={t('spellWord')}
                                                value={input}
                                                name="spelling-answer"
                                                autoComplete="off"
                                                spellCheck={false}
                                                helperText={t('pasteBlockedHint')}
                                                InputProps={{ sx: { fontSize: '1.15rem' } }}
                                                onChange={(event) => setInput(event.target.value)}
                                                onPaste={(event) => event.preventDefault()}
                                                onDrop={(event) => event.preventDefault()}
                                                onContextMenu={(event) => event.preventDefault()}
                                            />
                                            <Button
                                                type="submit"
                                                variant="contained"
                                                size="large"
                                                fullWidth
                                                disabled={loading || !input.trim()}
                                                sx={{ minHeight: 50, fontWeight: 700 }}
                                            >
                                                {t('submitAnswer')}
                                            </Button>
                                        </Stack>
                                    </form>
                                </Stack>
                            </Box>
                        ) : (
                            <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ py: 4 }}>
                                <CircularProgress />
                                <Typography variant="body1" color="text.secondary">{t('loadingNextWord')}</Typography>
                            </Stack>
                        )}
                        </Box>
                        <Card
                            variant="outlined"
                            component="section"
                            aria-labelledby="spelling-previous-words-title"
                            sx={{
                                minWidth: 0,
                                minHeight: 0,
                                maxHeight: { xs: 240, md: '100%' },
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            <CardContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, '&:last-child': { pb: 2 } }}>
                                <Typography id="spelling-previous-words-title" variant="h6">
                                    {t('previousWords')} · {answeredWords}
                                </Typography>
                                {session?.attempts?.length > 0 && (
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                                        {t('previousWordsLegend')}
                                    </Typography>
                                )}
                                <Stack spacing={1} sx={{ flex: 1, overflowY: 'auto', minHeight: 0, pr: 0.5, mt: 1 }}>
                                    {session?.attempts?.length ? session.attempts.map((attempt) => {
                                        const skippedAttempt = isSkippedSpellingAttempt(attempt, session.mode);
                                        return (
                                            <Chip
                                                key={attempt._id || attempt.sequence}
                                                label={previousWordLabel(attempt, session.mode)}
                                                color={skippedAttempt ? 'warning' : attempt.correct ? 'success' : 'error'}
                                                variant="outlined"
                                                icon={skippedAttempt
                                                    ? <HiOutlineMinus fontSize="small" />
                                                    : attempt.correct
                                                        ? <HiOutlineCheck fontSize="small" />
                                                        : <HiOutlineXMark fontSize="small" />}
                                                title={skippedAttempt ? t('skipped') : attempt.correct ? t('correct') : t('incorrect')}
                                                sx={{ maxWidth: '100%', justifyContent: 'flex-start' }}
                                            />
                                        );
                                    }) : (
                                        <Typography variant="body2" color="text.secondary">
                                            {t('noPreviousWords')}
                                        </Typography>
                                    )}
                                </Stack>
                            </CardContent>
                        </Card>
                    </Box>
                </DialogContent>
            </Dialog>
            {session?.status !== 'in-progress' && retests.length > 0 && (
                <Card variant="outlined" sx={{ mb: 2 }}>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 1.5 }}>{t('pendingRetests')}</Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {retests.map((retest) => {
                                const overdue = new Date(retest.dueAt) < new Date();
                                return (
                                    <Chip
                                        key={retest._id}
                                        label={`${retest.wordSnapshot} · ${t('dueOn', { value: new Date(retest.dueAt).toLocaleDateString() })}`}
                                        color={overdue ? 'error' : 'warning'}
                                        variant={overdue ? 'filled' : 'outlined'}
                                        icon={overdue ? <HiOutlineXMark fontSize="small" /> : <HiOutlineMinus fontSize="small" />}
                                    />
                                );
                            })}
                        </Stack>
                    </CardContent>
                </Card>
            )}
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6">{t('sessionHistory')}</Typography>
            {history.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{t('noSessionsYet')}</Typography>
            ) : (
                <>
                    <Stack spacing={1} sx={{ mt: 1 }}>{pagedHistory.map((entry) => {
                    const gradedQuiz = entry.assessmentType === 'retest-quiz';
                    const quizTotal = entry.attempts?.length || 0;
                    const quizScore = quizTotal ? Math.round((entry.attempts.filter((attempt) => attempt.correct).length / quizTotal) * 100) : 0;
                    return (
                        <Card key={entry._id} variant="outlined">
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Stack
                                    direction={{ xs: 'column', sm: 'row' }}
                                    justifyContent="space-between"
                                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                                    spacing={1.5}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                            <Typography sx={{ fontWeight: 700 }}>
                                                {new Date(entry.startedAt).toLocaleDateString()}
                                            </Typography>
                                            {gradedQuiz && <Chip size="small" color="primary" variant="outlined" label={t('gradedRetestQuiz')} />}
                                            {entry.curriculumGrade && <Chip size="small" variant="outlined" label={entry.curriculumGrade} />}
                                            {gradedQuiz && <Chip size="small" variant="outlined" label={`${t('score')}: ${quizScore}%`} />}
                                        </Stack>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                            <Typography variant="body2" color="success.main">{t('correctCount', { count: entry.correctCount })}</Typography>
                                            <Typography variant="body2" color="error.main">{t('mistakeCount', { count: entry.mistakeCount })}</Typography>
                                            {entry.practicePassage && (
                                                <Chip size="small" color="success" variant="outlined" label={t('practicePassageAvailable')} />
                                            )}
                                        </Stack>
                                    </Box>
                                    <Button size="small" variant="outlined" onClick={() => openHistorySession(entry)}>{t('viewDetails')}</Button>
                                </Stack>
                            </CardContent>
                        </Card>
                    );
                })}</Stack>
                    {history.length > HISTORY_PAGE_SIZE && (
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            spacing={2}
                            flexWrap="wrap"
                            useFlexGap
                            sx={{ mt: 1.5 }}
                        >
                            <Typography variant="body2" color="text.secondary">
                                {t('showingRange', {
                                    from: historyStart + 1,
                                    to: Math.min(historyStart + HISTORY_PAGE_SIZE, history.length),
                                    total: history.length
                                })}
                            </Typography>
                            <Pagination
                                count={historyPageCount}
                                page={safeHistoryPage}
                                onChange={(event, page) => setHistoryPage(page)}
                                size="small"
                                shape="rounded"
                                color="primary"
                                aria-label={t('historyPagination')}
                            />
                        </Stack>
                    )}
                </>
            )}
            <Dialog open={Boolean(selectedHistorySession)} onClose={() => setSelectedHistorySession(null)} fullWidth maxWidth="sm" aria-labelledby="session-details-title">
                <DialogTitle id="session-details-title">
                    {t('sessionDetails')}
                    <Typography variant="body2" color="text.secondary">
                        {selectedHistorySession && new Date(selectedHistorySession.startedAt).toLocaleDateString()}
                    </Typography>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2.5}>
                        <Box>
                            <Typography variant="subtitle1">{t('correctWords')}</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                {correctWords.length
                                    ? correctWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="success" icon={<span aria-hidden="true">✓</span>} />)
                                    : <Typography color="text.secondary">{t('none')}</Typography>}
                            </Stack>
                        </Box>
                        <Box>
                            <Typography variant="subtitle1">{t('incorrectWords')}</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                {incorrectWords.length
                                    ? incorrectWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="error" icon={<span aria-hidden="true">×</span>} />)
                                    : <Typography color="text.secondary">{t('none')}</Typography>}
                            </Stack>
                        </Box>
                        {answerReviewAttempts(selectedAttempts, selectedHistorySession?.mode).length > 0 && (
                            <Box>
                                <Typography variant="subtitle1">{t('answerComparison')}</Typography>
                                <Stack spacing={1} sx={{ mt: 1 }}>
                                    {answerReviewAttempts(selectedAttempts, selectedHistorySession?.mode).map((attempt) => (
                                        <Card key={attempt._id || attempt.sequence} variant="outlined" sx={{ bgcolor: 'background.default' }}>
                                            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                                                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                                                    <Typography sx={{ flex: 1, minWidth: 0 }}>
                                                        {t('yourAnswerLabel')} <strong>{previousWordLabel(attempt, selectedHistorySession?.mode)}</strong>
                                                    </Typography>
                                                    {attempt.correctedAt && <Chip size="small" color="success" label={t('acceptedByTeacher')} />}
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </Stack>
                            </Box>
                        )}
                        {skippedHistoryWords.length > 0 && (
                            <Box>
                                <Typography variant="subtitle1">{t('skippedWords')}</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                    {skippedHistoryWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="warning" variant="outlined" />)}
                                </Stack>
                            </Box>
                        )}
                        {passageLoading && (
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <CircularProgress size={18} />
                                <Typography color="text.secondary">{t('practicePassageLoading')}</Typography>
                            </Stack>
                        )}
                        {!passageLoading && practicePassage && (
                            <Box>
                                <Typography variant="subtitle1">{t('practicePassage')}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('practicePassageHint')}</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                                    {(practicePassage.missedWords || []).map((word) => <Chip key={word} label={word} color="warning" variant="outlined" />)}
                                </Stack>
                                <Box sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    border: 1,
                                    borderColor: 'divider',
                                    bgcolor: 'background.default',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.7
                                }}>
                                    <Typography component="span">{practicePassage.content}</Typography>
                                </Box>
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