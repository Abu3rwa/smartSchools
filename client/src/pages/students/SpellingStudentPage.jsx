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
import SpellingCelebration, { SpellingWordBurst } from './SpellingCelebration';
import SpellingAttemptComparison from './SpellingAttemptComparison';
import SpellingWordAudio from './SpellingWordAudio';
import SpellingVoicePanel from './SpellingVoicePanel';
import { getReviewWords, isCelebratoryCompletion } from './spellingSessionPresentation';
import { SHOW_DICTIONARY_SOURCES, accentPlaybackKey, getAccentPlayback, getSpellingVoiceOptions, playUrl, playWithFallback, readStoredVoice, resolvePlaybackVoice, storeVoice } from '../../utils/voicePlayback';

const HISTORY_PAGE_SIZE = 8;

// MUI's success/error text colors fail WCAG AA on the light surface, so status
// text and outlined chips pick a readable tone per theme.
const STATUS_TONES = {
    success: { light: '#047857', dark: '#34d399' },
    error: { light: '#b91c1c', dark: '#f87171' },
    warning: { light: '#9a3412', dark: '#fdba74' }
};

const statusTextSx = (tone) => (theme) => ({ color: STATUS_TONES[tone][theme.palette.mode === 'dark' ? 'dark' : 'light'] });

const statusChipSx = (tone) => (theme) => {
    const color = STATUS_TONES[tone][theme.palette.mode === 'dark' ? 'dark' : 'light'];
    return { color, borderColor: alpha(color, 0.5), fontWeight: 600 };
};

const VISUALLY_HIDDEN = {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap'
};

// The voice panel only makes sense when there is something to play; a payload with just
// a shared definition keeps the plain "Hear word" button.
const hasVoicePanel = (audio) => getSpellingVoiceOptions(audio).length > 0
    || (SHOW_DICTIONARY_SOURCES
        && Object.values(audio?.dictionaries || {}).some((section) => section?.examples?.length > 0));

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
    const { t, i18n } = useTranslation('spelling');
    const isRtl = i18n.dir() === 'rtl';
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
    const [previousAttempt, setPreviousAttempt] = useState(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [playingKey, setPlayingKey] = useState(null);
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

    // A voice notice describes the current word's audio, so the next word clears it.
    useEffect(() => {
        setVoiceNotice('');
    }, [currentItem?.sequence]);

    // The previous answer stays visible above the next word; only a different
    // session clears it, so feedback never flashes away while the word loads.
    useEffect(() => {
        setPreviousAttempt(null);
        setVoiceNotice('');
    }, [session?._id]);

    const dictionaryMatches = (entry, word) => Boolean(entry?.word) && entry.word === String(word || '').trim().toLowerCase();

    // The only fallback is the browser's own voice. No dictionary recording is played
    // when a generated clip is missing, switched off, or fails to load. The accent
    // selects the browser voice language ("en-GB" by default).
    const speakWithBrowser = (word, lang = 'en-GB', accent = null) => {
        const text = String(word || '').trim();
        const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
        if (activeAudioRef.current) {
            const activeAudio = activeAudioRef.current;
            activeAudioRef.current = null;
            activeAudio.pause();
        }
        if (!text) {
            setAudioPlaying(false);
            setPlayingKey(null);
            return;
        }
        if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
            setAudioPlaying(false);
            setPlayingKey(null);
            setVoiceNotice(t('browserVoiceUnavailable'));
            return;
        }
        synth.cancel();
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        utterance.onend = finishPlayback;
        utterance.onerror = finishPlayback;
        activeAudioRef.current = { pause: () => synth.cancel() };
        setPlayingKey(accent ? accentPlaybackKey(word, accent) : null);
        setAudioPlaying(true);
        synth.speak(utterance);
    };

    const finishPlayback = () => {
        activeAudioRef.current = null;
        setAudioPlaying(false);
        setPlayingKey(null);
    };

    // Generated clip (or the chosen voice) first; the browser voice is the only fallback.
    const speakWord = (word, audio = null, voiceId = selectedVoice) => {
        const voice = resolvePlaybackVoice(audio, voiceId);
        if (!voice) {
            speakWithBrowser(word);
            return;
        }
        if (activeAudioRef.current) activeAudioRef.current.pause();
        setPlayingKey(null);
        setAudioPlaying(true);
        const { handle } = playWithFallback({
            url: voice.url,
            playDefault: () => speakWithBrowser(word),
            onFallback: () => setVoiceNotice(t('browserVoiceFallback')),
            onEnded: finishPlayback
        });
        activeAudioRef.current = { pause: handle.cancel };
    };

    // Previous words only carry a stored clip for the word just answered, so an
    // accent picks that clip when it exists and the browser voice otherwise.
    const playWordAccent = (word, accent, audio = null) => {
        const target = getAccentPlayback(audio, accent);
        if (!target.url) {
            speakWithBrowser(word, target.lang, target.accent);
            return;
        }
        if (activeAudioRef.current) activeAudioRef.current.pause();
        setPlayingKey(accentPlaybackKey(word, target.accent));
        setAudioPlaying(true);
        const { handle } = playWithFallback({
            url: target.url,
            playDefault: () => speakWithBrowser(word, target.lang, target.accent),
            onFallback: () => setVoiceNotice(t('browserVoiceFallback')),
            onEnded: finishPlayback
        });
        activeAudioRef.current = { pause: handle.cancel };
    };

    const playExample = (url) => {
        if (activeAudioRef.current) activeAudioRef.current.pause();
        setPlayingKey(null);
        setAudioPlaying(true);
        const handle = playUrl(url, {
            onEnded: finishPlayback,
            onFail: () => {
                finishPlayback();
                setVoiceNotice(t('exampleUnavailable'));
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
        const answeredSequence = currentItem.sequence;
        const answeredAudio = currentItem.audio || null;
        const result = await dispatch(submitSpellingAnswer({
            sessionId: session._id,
            sequence: answeredSequence,
            studentInput,
            skipped
        }));
        if (submitSpellingAnswer.fulfilled.match(result)) {
            setPreviousAttempt({
                word: answeredWord,
                audio: answeredAudio,
                correct: result.payload.attempt.correct,
                skipped: result.payload.attempt.skipped,
                input: studentInput,
                sequence: answeredSequence
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
    // "giraaaa → giraffe" for a wrong answer, "giraaaa ✓ giraffe" once the teacher accepts it, "giraffe ✓" when correct.
    const previousWordLabel = (attempt, mode) => {
        const word = attempt.wordSnapshot;
        const typed = String(attempt.studentInput ?? '').trim();
        if (isSkippedSpellingAttempt(attempt, mode)) return word;
        if (mode === 'self-serve' && typed && attempt.correctedAt) return `${typed} ✓ ${word}`;
        if (attempt.correct) return `${word} ✓`;
        return mode === 'self-serve' && typed ? <SpellingAttemptComparison typed={typed} correct={word} /> : word;
    };

    // Stored AI clips ride on the session, keyed by the exact word each attempt shows.
    const storedClipAudio = (word) => (session?.pronunciations?.[word] ? { ai: session.pronunciations[word] } : null);

    const hasSkippedWords = session?.attempts?.some((attempt) => isSkippedSpellingAttempt(attempt, session.mode));    const mistakesAllowed = session?.maxMistakesAllowed || 3;
    const answeredWords = session?.attempts?.length || 0;
    const mistakesRemaining = Math.max(mistakesAllowed - (session?.mistakeCount || 0), 0);
    const reviewWords = session?.status === 'completed' ? getReviewWords(session.attempts) : [];
    const celebratoryCompletion = isCelebratoryCompletion(session);
    const typedPrevious = String(previousAttempt?.input || '').trim();
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
                    startIcon={<HiOutlineArrowLeft style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />}
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
                                    <Chip size="small" variant="outlined" sx={statusChipSx('success')} label={t('correctCount', { count: session.correctCount })} />
                                    <Chip size="small" variant="outlined" sx={statusChipSx('error')} label={t('mistakeCount', { count: session.mistakeCount })} />
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
                            <HiOutlineArrowLeft style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                        </IconButton>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography id="spelling-session-title" variant="h5" sx={{ fontWeight: 700 }}>{t('mySpelling')}</Typography>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                <Chip size="small" variant="outlined" sx={statusChipSx('success')} label={t('correctCount', { count: session?.correctCount || 0 })} />
                                {session?.status !== 'in-progress' && (
                                    <Chip size="small" variant="outlined" sx={statusChipSx('error')} label={t('mistakeCount', { count: session?.mistakeCount || 0 })} />
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
                        // On phones the dialog scrolls; letting the single column
                        // shrink below its content made the cards overlap on short screens.
                        gridTemplateRows: { xs: 'auto auto', md: 'minmax(0, 1fr)' },
                        gap: 2,
                        alignItems: 'stretch',
                        maxWidth: 1400,
                        width: '100%',
                        mx: 'auto',
                        flex: { xs: '0 0 auto', md: 1 },
                        minHeight: { xs: 'auto', md: 0 }
                    }}>
                        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <Box sx={{ width: '100%', maxWidth: 620, mx: 'auto' }}>
                        {session?.status === 'in-progress' && previousAttempt && (
                            <Box
                                role="status"
                                aria-live="polite"
                                sx={(theme) => {
                                    const tone = previousAttempt.skipped
                                        ? theme.palette.warning.main
                                        : previousAttempt.correct
                                            ? theme.palette.success.main
                                            : theme.palette.error.main;
                                    return {
                                        position: 'relative',
                                        mb: 2,
                                        px: 2,
                                        py: 1.25,
                                        borderRadius: 2,
                                        border: 1,
                                        borderColor: alpha(tone, 0.5),
                                        bgcolor: alpha(tone, theme.palette.mode === 'light' ? 0.07 : 0.14)
                                    };
                                }}
                            >
                                {previousAttempt.correct && <SpellingWordBurst key={previousAttempt.sequence} />}
                                <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Box
                                        aria-hidden="true"
                                        sx={[
                                            { display: 'flex', fontSize: '1.35rem' },
                                            previousAttempt.skipped
                                                ? statusTextSx('warning')
                                                : previousAttempt.correct
                                                    ? statusTextSx('success')
                                                    : statusTextSx('error')
                                        ]}
                                    >
                                        {previousAttempt.skipped ? <HiOutlineMinus /> : previousAttempt.correct ? <HiOutlineCheck /> : <HiOutlineXMark />}
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="caption" color="text.secondary" component="p">
                                            {t('previousAnswerLabel')}
                                        </Typography>
                                        <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }} dir="ltr">
                                            {previousAttempt.correct || previousAttempt.skipped || !typedPrevious ? (
                                                previousAttempt.word
                                            ) : (
                                                <>
                                                    <Box component="span" sx={VISUALLY_HIDDEN}>
                                                        {t('answerComparisonAria', { typed: typedPrevious, correct: previousAttempt.word })}
                                                    </Box>
                                                    <Box component="span" aria-hidden="true">
                                                        <SpellingAttemptComparison typed={typedPrevious} correct={previousAttempt.word} />
                                                    </Box>
                                                </>
                                            )}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        variant="caption"
                                        sx={[
                                            { fontWeight: 700 },
                                            previousAttempt.skipped
                                                ? statusTextSx('warning')
                                                : previousAttempt.correct
                                                    ? statusTextSx('success')
                                                    : statusTextSx('error')
                                        ]}
                                    >
                                        {previousAttempt.skipped ? t('skipped') : previousAttempt.correct ? t('correct') : t('incorrect')}
                                    </Typography>
                                    <Box sx={{ marginInlineStart: 'auto' }}>
                                        <SpellingWordAudio
                                            word={previousAttempt.word}
                                            audio={previousAttempt.audio}
                                            disabled={audioPlaying}
                                            playingKey={playingKey}
                                            onPlay={playWordAccent}
                                        />
                                    </Box>
                                </Stack>
                            </Box>
                        )}
                        {session?.status !== 'in-progress' ? (
                            <Stack spacing={2} alignItems="center" sx={{ width: '100%' }}>
                                {celebratoryCompletion && answeredWords > 0 ? (
                                    <SpellingCelebration attempts={session?.attempts} correctCount={session?.correctCount} />
                                ) : (
                                    <Alert severity="info" sx={{ width: '100%' }}>
                                        <Typography component="p" sx={{ fontWeight: 700 }}>{t('sessionEndedTitle')}</Typography>
                                        {t('sessionEndedHint')}
                                    </Alert>
                                )}
                                {hasSkippedWords && <Alert severity="info" sx={{ width: '100%' }}>{t('teacherWillReviewSkippedWords')}</Alert>}
                                <Box sx={{ width: '100%' }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('wordsToReview')}</Typography>
                                    {reviewWords.length > 0 ? (
                                        <>
                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                                {reviewWords.map((attempt) => {
                                                    const word = attempt.wordSnapshot;
                                                    return (
                                                        <Stack key={attempt._id || attempt.sequence} direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap" sx={{ maxWidth: '100%' }}>
                                                            <Chip
                                                                dir="ltr"
                                                                label={word}
                                                                color="warning"
                                                                variant="outlined"
                                                                icon={<HiOutlineSpeakerWave />}
                                                                onClick={() => speakWord(word, storedClipAudio(word))}
                                                                aria-label={`${t('playSound')}: ${word}`}
                                                            />
                                                            <SpellingWordAudio
                                                                word={word}
                                                                audio={storedClipAudio(word)}
                                                                disabled={audioPlaying}
                                                                playingKey={playingKey}
                                                                onPlay={playWordAccent}
                                                            />
                                                        </Stack>
                                                    );
                                                })}
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                                                {t('reviewWordsHint')}
                                            </Typography>
                                        </>
                                    ) : (
                                        <Alert severity="success" sx={{ mt: 1 }}>{t('allWordsCorrect')}</Alert>
                                    )}
                                    {retests.length > 0 && (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                                            {t('retestsQueued', { value: retests.length })}
                                        </Typography>
                                    )}
                                </Box>
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
                            <Box sx={{ width: '100%' }}>
                                <Stack spacing={2} sx={{ width: '100%' }}>
                                    {currentItem.category && (
                                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                                            <Chip size="small" color="primary" variant="outlined" dir="auto" label={`${t('category')}: ${currentItem.category}`} />
                                        </Stack>
                                    )}
                                    {currentItem.definition && (
                                        <Box sx={(theme) => ({
                                            textAlign: 'start',
                                            px: 2.5,
                                            py: 2,
                                            border: 1,
                                            borderColor: 'divider',
                                            borderInlineStartWidth: '5px',
                                            borderInlineStartStyle: 'solid',
                                            borderInlineStartColor: theme.palette.primary.main,
                                            borderRadius: 2,
                                            bgcolor: 'background.paper',
                                            boxShadow: theme.shadows[2]
                                        })}>
                                            <Typography
                                                variant="overline"
                                                sx={(theme) => ({
                                                    color: theme.palette.mode === 'dark' ? 'primary.light' : 'primary.dark',
                                                    fontWeight: 800,
                                                    letterSpacing: '.08em'
                                                })}
                                            >
                                                {t('definitionLabel')}
                                            </Typography>
                                            <Typography variant="body1" dir="auto" sx={{ color: 'text.primary', fontSize: '1.05rem', lineHeight: 1.6 }}>{currentItem.definition}</Typography>
                                        </Box>
                                    )}
                                    {/* Words with any playable recording use the voice panel; others keep the original play button. */}
                                    {!hasVoicePanel(currentItem.audio) && (
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
                                    {hasVoicePanel(currentItem.audio) && (
                                        <SpellingVoicePanel
                                            audio={currentItem.audio}
                                            selectedVoice={selectedVoice}
                                            disabled={audioPlaying}
                                            onSelectVoice={selectVoice}
                                            onPlayExample={playExample}
                                        />
                                    )}
                                    <Box
                                        role="note"
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: 1.5,
                                            px: 2,
                                            py: 1,
                                            borderRadius: 2,
                                            border: 1,
                                            borderColor: 'divider',
                                            bgcolor: 'background.paper'
                                        }}
                                    >
                                        <Box
                                            aria-hidden="true"
                                            sx={(theme) => ({
                                                display: 'flex',
                                                fontSize: '1.35rem',
                                                color: currentItem.handRaised
                                                    ? (theme.palette.mode === 'dark' ? '#34d399' : '#047857')
                                                    : theme.palette.text.secondary
                                            })}
                                        >
                                            <HiOutlineHandRaised />
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 160 }}>
                                            {currentItem.handRaised ? t('handIsRaised') : t('needHelpHint')}
                                        </Typography>
                                        {!currentItem.handRaised && (
                                            <Button size="small" variant="outlined" onClick={raiseHand}>{t('raiseYourHand')}</Button>
                                        )}
                                    </Box>
                                    {voiceNotice && <Alert severity="info" role="status">{voiceNotice}</Alert>}
                                    <form onSubmit={submitAnswer} style={{ width: '100%' }}>
                                        <Stack spacing={2}>
                                            <TextField
                                                autoFocus
                                                fullWidth
                                                label={t('spellWord')}
                                                value={input}
                                                name="spelling-answer"
                                                autoComplete="off"
                                                inputProps={{ autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false, dir: 'ltr' }}
                                                helperText={t('pasteBlockedHint')}
                                                InputProps={{ sx: { fontSize: '1.15rem', '& input': { textAlign: 'center', fontWeight: 700, letterSpacing: '.03em' } } }}
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
                                                sx={{
                                                    minHeight: 50,
                                                    fontWeight: 700,
                                                    '&.Mui-disabled': {
                                                        background: 'none',
                                                        bgcolor: 'action.disabledBackground',
                                                        color: 'text.disabled'
                                                    }
                                                }}
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
                                    <>
                                        <Typography variant="caption" color="text.secondary">{t('previousWordsLegend')}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>{t('accentHint')}</Typography>
                                    </>
                                )}
                                <Stack spacing={1} alignItems="flex-start" sx={{ flex: 1, overflowY: 'auto', minHeight: 0, pe: 0.5, mt: 1 }}>
                                    {session?.attempts?.length ? session.attempts.map((attempt) => {
                                        const skippedAttempt = isSkippedSpellingAttempt(attempt, session.mode);
                                        return (
                                            <Stack key={attempt._id || attempt.sequence} direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap" sx={{ maxWidth: '100%' }}>
                                                <Chip
                                                    dir="ltr"
                                                    label={previousWordLabel(attempt, session.mode)}
                                                    variant="outlined"
                                                    icon={skippedAttempt
                                                        ? <HiOutlineMinus fontSize="small" />
                                                        : attempt.correct
                                                            ? <HiOutlineCheck fontSize="small" />
                                                            : <HiOutlineXMark fontSize="small" />}
                                                    title={skippedAttempt ? t('skipped') : attempt.correct ? t('correct') : t('incorrect')}
                                                    sx={[
                                                        { maxWidth: '100%', justifyContent: 'flex-start' },
                                                        skippedAttempt
                                                            ? statusChipSx('warning')
                                                            : attempt.correct
                                                                ? statusChipSx('success')
                                                                : statusChipSx('error')
                                                    ]}
                                                />
                                                <SpellingWordAudio
                                                    word={attempt.wordSnapshot}
                                                    audio={storedClipAudio(attempt.wordSnapshot)}
                                                    disabled={audioPlaying}
                                                    playingKey={playingKey}
                                                    onPlay={playWordAccent}
                                                />
                                            </Stack>
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
                    <Stack spacing={0.75} sx={{ mt: 1 }}>{pagedHistory.map((entry) => {
                    const gradedQuiz = entry.assessmentType === 'retest-quiz';
                    const quizTotal = entry.attempts?.length || 0;
                    const quizScore = quizTotal ? Math.round((entry.attempts.filter((attempt) => attempt.correct).length / quizTotal) * 100) : 0;
                    return (
                        <Card key={entry._id} variant="outlined">
                            <CardContent sx={{
                                display: 'flex',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 1,
                                px: 1.5,
                                py: 1,
                                '&:last-child': { pb: 1 }
                            }}>
                                <Typography sx={{ fontWeight: 700 }}>
                                    {new Date(entry.startedAt).toLocaleDateString()}
                                </Typography>
                                {gradedQuiz && <Chip size="small" color="primary" variant="outlined" label={t('gradedRetestQuiz')} />}
                                {entry.curriculumGrade && <Chip size="small" variant="outlined" label={entry.curriculumGrade} />}
                                {gradedQuiz && <Chip size="small" variant="outlined" label={`${t('score')}: ${quizScore}%`} />}
                                <Typography variant="body2" sx={statusTextSx('success')}>{t('correctCount', { count: entry.correctCount })}</Typography>
                                <Typography variant="body2" sx={statusTextSx('error')}>{t('mistakeCount', { count: entry.mistakeCount })}</Typography>
                                {entry.practicePassage && (
                                    <Chip size="small" color="success" variant="outlined" label={t('practicePassageAvailable')} />
                                )}
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => openHistorySession(entry)}
                                    sx={{ marginInlineStart: 'auto' }}
                                >
                                    {t('viewDetails')}
                                </Button>
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