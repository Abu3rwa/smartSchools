import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    FormControl,
    FormControlLabel,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Skeleton,
    Stack,
    Switch,
    Typography
} from '@mui/material';
import { HiOutlineArrowPath, HiOutlineCheck } from 'react-icons/hi2';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import { toApiUrl } from '../../config/apiBase';
import { selectUserRoles } from '../../store/slices/authSlice';
import {
    ACCENTS,
    FLAG_REASONS,
    GRADES,
    accentLabel,
    applyAccentPatch,
    canRegenerateClip
} from './utils/pronunciationReview';

const SpellingPronunciationReviewPage = () => {
    const { t } = useTranslation('spelling');
    const roles = useSelector(selectUserRoles);
    const canRegenerate = roles.includes('admin') || roles.includes('department_principal');

    const [index, setIndex] = useState(null);
    const [grade, setGrade] = useState('');
    const [week, setWeek] = useState('');
    const [onlyPending, setOnlyPending] = useState(false);
    const [queue, setQueue] = useState(null);
    const [loadingIndex, setLoadingIndex] = useState(true);
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState('');
    const [flagTarget, setFlagTarget] = useState(null);

    const weeksForGrade = useMemo(() => {
        if (!index?.weeks) return [];
        return index.weeks.filter((entry) => entry.grade === grade);
    }, [index, grade]);

    const loadIndex = useCallback(async () => {
        setLoadingIndex(true);
        setError('');
        try {
            const response = await api.get('/spelling/word-audio/review/queue');
            const data = response.data.data || {};
            setIndex(data);
            const first = (data.weeks || [])[0];
            if (first) {
                setGrade((current) => current || first.grade);
                setWeek((current) => current || String(first.week));
            }
        } catch (err) {
            setError(err.response?.data?.message || t('audioAdmin.review.loadError'));
        } finally {
            setLoadingIndex(false);
        }
    }, [t]);

    useEffect(() => { loadIndex(); }, [loadIndex]);

    const loadQueue = useCallback(async (nextGrade, nextWeek, pendingOnly) => {
        if (!nextGrade || !nextWeek) return;
        setLoadingQueue(true);
        setError('');
        try {
            const response = await api.get('/spelling/word-audio/review/queue', {
                params: { grade: nextGrade, week: nextWeek, onlyPending: pendingOnly ? 'true' : 'false' }
            });
            setQueue(response.data.data || null);
        } catch (err) {
            setQueue(null);
            setError(err.response?.data?.message || t('audioAdmin.review.loadError'));
        } finally {
            setLoadingQueue(false);
        }
    }, [t]);

    useEffect(() => {
        if (!grade || !week) return;
        loadQueue(grade, week, onlyPending);
    }, [grade, week, onlyPending, loadQueue]);

    const patchWord = useCallback((word, accent, patch) => {
        setQueue((current) => {
            if (!current?.words) return current;
            const words = applyAccentPatch(current.words, word, accent, patch);
            const reviewedWords = words.filter((entry) => entry.accents.us?.reviewed && entry.accents.uk?.reviewed).length;
            return {
                ...current,
                words,
                summary: {
                    ...current.summary,
                    reviewedWords,
                    pendingWords: Math.max(0, words.length - reviewedWords)
                }
            };
        });
    }, []);

    const markReviewed = async (word, accent) => {
        const key = `${word}:${accent}`;
        setBusy(key);
        setMessage(null);
        try {
            const response = await api.post('/spelling/word-audio/review', { word, accent });
            patchWord(word, accent, {
                reviewed: true,
                reviewedAt: response.data.data?.reviewedAt || new Date().toISOString(),
                flagged: false,
                flagReason: null
            });
            setMessage({ severity: 'success', text: t('audioAdmin.review.reviewSuccess', { word, accent: accentLabel(accent) }) });
        } catch (err) {
            setMessage({ severity: 'error', text: err.response?.data?.message || t('audioAdmin.review.reviewError') });
        } finally {
            setBusy('');
        }
    };

    const regenerate = async (word, accent) => {
        const label = accentLabel(accent);
        const confirmed = window.confirm(t('audioAdmin.review.confirmRegenerate', { word, accent: label }));
        if (!confirmed) return;
        const key = `${word}:${accent}`;
        setBusy(key);
        setMessage(null);
        try {
            const response = await api.post('/spelling/word-audio/ai/pronunciation/regenerate', { word, accent });
            const data = response.data.data || {};
            const cost = Number(data.costCents) > 0
                ? ` ${t('audioAdmin.costNote', { cost: Number(data.costCents).toFixed(2) })}`
                : '';
            setMessage({ severity: 'success', text: `${t('audioAdmin.review.regenerateSuccess', { word, accent: label })}${cost}` });
            // The clip bytes and URL both changed, so the queue is read again.
            await loadQueue(grade, week, onlyPending);
        } catch (err) {
            setMessage({ severity: 'error', text: err.response?.data?.message || t('audioAdmin.review.regenerateError') });
        } finally {
            setBusy('');
        }
    };

    const markUnusable = async (word, accent) => {
        const label = accentLabel(accent);
        const confirmed = window.confirm(t('audioAdmin.review.confirmUnusable', { word, accent: label }));
        if (!confirmed) return;
        const key = `${word}:${accent}`;
        setBusy(key);
        setMessage(null);
        try {
            await api.delete('/spelling/word-audio/ai/pronunciation', { data: { word, accent } });
            patchWord(word, accent, { removed: true, url: null, reviewed: false });
            setMessage({ severity: 'success', text: t('audioAdmin.review.unusableSuccess', { word, accent: label }) });
        } catch (err) {
            setMessage({ severity: 'error', text: err.response?.data?.message || t('audioAdmin.review.unusableError') });
        } finally {
            setBusy('');
        }
    };

    const submitFlag = async (reason) => {
        if (!flagTarget || !reason) return;
        const { word, accent } = flagTarget;
        const key = `${word}:${accent}`;
        setBusy(key);
        try {
            await api.post('/spelling/word-audio/review/flag', { word, accent, reason });
            patchWord(word, accent, { flagged: true, flagReason: reason });
            setMessage({ severity: 'success', text: t('audioAdmin.review.flagSuccess', { word, accent: accentLabel(accent) }) });
            setFlagTarget(null);
        } catch (err) {
            setMessage({ severity: 'error', text: err.response?.data?.message || t('audioAdmin.review.flagError') });
        } finally {
            setBusy('');
        }
    };

    const generateWeek = async () => {
        setBusy('generate');
        setMessage(null);
        try {
            const response = await api.post('/spelling/word-audio/ai/generate', { grade, week, limit: 80 });
            const data = response.data.data || {};
            const cost = Number(data.costCents) > 0
                ? ` ${t('audioAdmin.costNote', { cost: Number(data.costCents).toFixed(2) })}`
                : '';
            setMessage({
                severity: data.failed > 0 ? 'warning' : 'success',
                text: `${t('audioAdmin.review.generateDone', { generated: data.generated || 0, failed: data.failed || 0 })}${cost}`
            });
            await loadQueue(grade, week, onlyPending);
        } catch (err) {
            setMessage({ severity: 'error', text: err.response?.data?.message || t('audioAdmin.review.generateError') });
        } finally {
            setBusy('');
        }
    };

    const summary = queue?.summary;
    const words = queue?.words || [];

    return (
        <Stack spacing={2} sx={{ p: { xs: 1, sm: 3 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                <Typography variant="h5" component="h1">{t('audioAdmin.review.title')}</Typography>
                <Button component={Link} to={canRegenerate ? '/portal/spelling/audio' : '/portal/spelling'} variant="outlined">
                    {canRegenerate ? t('audioAdmin.review.backToAudio') : t('audioAdmin.review.back')}
                </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary">{t('audioAdmin.review.description')}</Typography>

            {message && <Alert severity={message.severity}>{message.text}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            {loadingIndex ? (
                <Skeleton variant="rectangular" height={72} />
            ) : (
                <Card variant="outlined">
                    <CardContent>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
                            <FormControl size="small" sx={{ minWidth: 120 }}>
                                <InputLabel id="review-grade-label">{t('audioAdmin.review.grade')}</InputLabel>
                                <Select
                                    labelId="review-grade-label"
                                    label={t('audioAdmin.review.grade')}
                                    value={grade}
                                    onChange={(event) => {
                                        const nextGrade = event.target.value;
                                        setGrade(nextGrade);
                                        const firstWeek = (index?.weeks || []).find((entry) => entry.grade === nextGrade);
                                        setWeek(firstWeek ? String(firstWeek.week) : '');
                                    }}
                                >
                                    {(index?.allowedGrades || GRADES).map((option) => (
                                        <MenuItem key={option} value={option}>{option}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl size="small" sx={{ minWidth: 150 }}>
                                <InputLabel id="review-week-label">{t('audioAdmin.review.week')}</InputLabel>
                                <Select
                                    labelId="review-week-label"
                                    label={t('audioAdmin.review.week')}
                                    value={week}
                                    onChange={(event) => setWeek(event.target.value)}
                                >
                                    {weeksForGrade.map((entry) => (
                                        <MenuItem key={entry.week} value={String(entry.week)}>
                                            {t('audioAdmin.review.weekWithNumber', { week: entry.week })}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={onlyPending}
                                        onChange={(event) => setOnlyPending(event.target.checked)}
                                    />
                                }
                                label={t('audioAdmin.review.onlyPending')}
                            />

                            {canRegenerate && (
                                <Button
                                    variant="outlined"
                                    disabled={busy === 'generate' || !grade || !week}
                                    onClick={generateWeek}
                                >
                                    {busy === 'generate' ? t('audioAdmin.review.generating') : t('audioAdmin.review.generateWeek')}
                                </Button>
                            )}

                            {summary && (
                                <Box sx={{ flexGrow: 1, minWidth: 220 }}>
                                    <Typography variant="body2">
                                        {t('audioAdmin.review.progress', {
                                            reviewed: summary.reviewedWords || 0,
                                            total: summary.totalWords || 0
                                        })}
                                    </Typography>
                                    <LinearProgress
                                        variant="determinate"
                                        value={summary.totalWords ? ((summary.reviewedWords || 0) / summary.totalWords) * 100 : 0}
                                        sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                                    />
                                </Box>
                            )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            {canRegenerate ? t('audioAdmin.review.adminNote') : t('audioAdmin.review.teacherNote')}
                        </Typography>
                    </CardContent>
                </Card>
            )}

            {loadingQueue ? (
                <Stack spacing={1}>
                    <Skeleton variant="rectangular" height={96} />
                    <Skeleton variant="rectangular" height={96} />
                    <Skeleton variant="rectangular" height={96} />
                </Stack>
            ) : (
                <>
                    {summary && summary.missingClips > 0 && canRegenerate && (
                        <Alert severity="warning">
                            {t('audioAdmin.review.missingClips', { total: summary.missingClips })}
                        </Alert>
                    )}
                    {words.length === 0 ? (
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="body2" color="text.secondary">
                                    {onlyPending
                                        ? t('audioAdmin.review.allReviewed')
                                        : t('audioAdmin.review.empty')}
                                </Typography>
                            </CardContent>
                        </Card>
                    ) : (
                        words.map((entry) => (
                            <Card key={`${entry.word}-${entry.order}`} variant="outlined">
                                <CardContent>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{entry.word}</Typography>
                                        {entry.category && <Chip size="small" label={entry.category} variant="outlined" />}
                                    </Stack>
                                    <Stack spacing={1} sx={{ mt: 1 }}>
                                        {ACCENTS.map((accent) => {
                                            const state = entry.accents?.[accent] || {};
                                            const key = `${entry.word}:${accent}`;
                                            const actionBusy = busy === key;
                                            const label = accentLabel(accent);
                                            return (
                                                <Box
                                                    key={accent}
                                                    sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
                                                >
                                                    <Stack
                                                        direction={{ xs: 'column', md: 'row' }}
                                                        spacing={1}
                                                        alignItems={{ md: 'center' }}
                                                        flexWrap="wrap"
                                                        useFlexGap
                                                    >
                                                        <Typography variant="body2" sx={{ minWidth: 70, fontWeight: 600 }}>
                                                            {label}
                                                        </Typography>

                                                        {state.removed ? (
                                                            <Typography variant="body2" color="text.secondary">
                                                                {t('audioAdmin.review.removed')}
                                                            </Typography>
                                                        ) : state.missing ? (
                                                            <Typography variant="body2" color="text.secondary">
                                                                {t('audioAdmin.review.missingClip')}
                                                            </Typography>
                                                        ) : (
                                                            <audio
                                                                controls
                                                                preload="none"
                                                                src={toApiUrl(state.url)}
                                                                aria-label={t('audioAdmin.review.accentAria', { word: entry.word, accent: label })}
                                                                style={{ height: 32, maxWidth: 260 }}
                                                            />
                                                        )}

                                                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                            {state.reviewed ? (
                                                                <Chip
                                                                    size="small"
                                                                    color="success"
                                                                    icon={<HiOutlineCheck />}
                                                                    label={t('audioAdmin.review.reviewed')}
                                                                />
                                                            ) : (
                                                                <Button
                                                                    size="small"
                                                                    variant="outlined"
                                                                    disabled={actionBusy || state.missing || state.removed}
                                                                    onClick={() => markReviewed(entry.word, accent)}
                                                                >
                                                                    {actionBusy ? t('audioAdmin.review.saving') : t('audioAdmin.review.markReviewed')}
                                                                </Button>
                                                            )}

                                                            {state.flagged && (
                                                                <Chip
                                                                    size="small"
                                                                    color="warning"
                                                                    label={state.flagReason
                                                                        ? t('audioAdmin.review.flaggedWithReason', {
                                                                            reason: t(`audioAdmin.review.flag_${state.flagReason}`)
                                                                        })
                                                                        : t('audioAdmin.review.flagged')}
                                                                />
                                                            )}

                                                            {canRegenerate && !state.missing && !state.removed && (
                                                                <>
                                                                    <Button
                                                                        size="small"
                                                                        variant="text"
                                                                        startIcon={<HiOutlineArrowPath />}
                                                                        disabled={actionBusy || !canRegenerateClip(state, queue?.attemptLimit)}
                                                                        onClick={() => regenerate(entry.word, accent)}
                                                                    >
                                                                        {t('audioAdmin.review.regenerate')}
                                                                    </Button>
                                                                    {!state.reviewed && (
                                                                        <Button
                                                                            size="small"
                                                                            color="error"
                                                                            variant="text"
                                                                            disabled={actionBusy}
                                                                            onClick={() => markUnusable(entry.word, accent)}
                                                                        >
                                                                            {t('audioAdmin.review.unusable')}
                                                                        </Button>
                                                                    )}
                                                                </>
                                                            )}

                                                            {!canRegenerate && !state.missing && !state.removed && !state.flagged && (
                                                                <Button
                                                                    size="small"
                                                                    color="warning"
                                                                    variant="text"
                                                                    disabled={actionBusy}
                                                                    onClick={() => setFlagTarget({ word: entry.word, accent })}
                                                                >
                                                                    {t('audioAdmin.review.flag')}
                                                                </Button>
                                                            )}
                                                        </Stack>
                                                    </Stack>

                                                            {state.attempts > 0 && (
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                            {canRegenerateClip(state, queue?.attemptLimit)
                                                                ? t('audioAdmin.review.attempts', { attempts: state.attempts })
                                                                : t('audioAdmin.review.attemptLimit', { attempts: state.attempts })}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            );
                                        })}
                                    </Stack>
                                    {flagTarget && flagTarget.word === entry.word && (
                                        <Card variant="outlined" sx={{ mt: 1 }}>
                                            <CardContent>
                                                <Typography variant="subtitle2">
                                                    {t('audioAdmin.review.flagTitle', { word: entry.word, accent: accentLabel(flagTarget.accent) })}
                                                </Typography>
                                                <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                                                    {FLAG_REASONS.map((reason) => (
                                                        <Button
                                                            key={reason}
                                                            size="small"
                                                            variant="outlined"
                                                            disabled={busy === `${flagTarget.word}:${flagTarget.accent}`}
                                                            onClick={() => submitFlag(reason)}
                                                        >
                                                            {t(`audioAdmin.review.flag_${reason}`)}
                                                        </Button>
                                                    ))}
                                                    <Button size="small" onClick={() => setFlagTarget(null)}>
                                                        {t('audioAdmin.review.cancel')}
                                                    </Button>
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </>
            )}

            {busy && !flagTarget && (
                <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">{t('audioAdmin.review.working')}</Typography>
                </Stack>
            )}
        </Stack>
    );
};

export default SpellingPronunciationReviewPage;
