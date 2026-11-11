import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, FormControlLabel } from '@mui/material';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import { toApiUrl } from '../../config/apiBase';
import { selectIsAdmin } from '../../store/slices/authSlice';
import { SHOW_DICTIONARY_SOURCES } from '../../utils/voicePlayback';

const COVERAGE_COLUMNS = [
    ['withExamples', 'examples'],
    ['withDefinition', 'definition']
];

const REPORT_ROWS = [
    ['rowsRead', 'rowsRead'],
    ['rowsWithAudio', 'rowsWithAudio'],
    ['wordsMatchedInApp', 'wordsMatchedInApp'],
    ['wordsNotFoundInApp', 'wordsNotFoundInApp'],
    ['urlsRejected', 'urlsRejected'],
    ['rowsSkipped', 'rowsSkipped'],
    ['wordsToCreate', 'wordsToCreate'],
    ['wordsToUpdate', 'wordsToUpdate'],
    ['wordsUnchanged', 'wordsUnchanged']
];

const isPreviewableAudioUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && [
            'www.ldoceonline.com',
            'www.oxfordlearnersdictionaries.com',
            'media.merriam-webster.com',
            'ssl.gstatic.com'
        ].includes(url.hostname.toLowerCase());
    } catch {
        return false;
    }
};

const SpellingAudioAdminPage = () => {
    const { t } = useTranslation('spelling');
    const isAdmin = useSelector(selectIsAdmin);
    const [file, setFile] = useState(null);
    const [report, setReport] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const [coverage, setCoverage] = useState([]);
    const [audioSearch, setAudioSearch] = useState('');
    const [audioResults, setAudioResults] = useState([]);
    const [searchingAudio, setSearchingAudio] = useState(false);
    const [removingAudio, setRemovingAudio] = useState('');
    const [replacementDrafts, setReplacementDrafts] = useState({});
    const [replacingAudio, setReplacingAudio] = useState('');
    const [aiAction, setAiAction] = useState(null);
    const [aiSettings, setAiSettings] = useState(null);
    const [aiCoverage, setAiCoverage] = useState(null);
    const [aiBusyGrade, setAiBusyGrade] = useState('');
    const [aiTests, setAiTests] = useState({});
    const aiTestAudioRef = useRef(null);

    useEffect(() => () => {
        const audio = aiTestAudioRef.current;
        if (!audio) return;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    }, []);

    const loadCoverage = useCallback(async () => {
        try {
            const response = await api.get('/spelling/word-audio/coverage');
            setCoverage(response.data.data);
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.coverageError') });
        }
    }, [t]);

    const loadAiAudio = useCallback(async () => {
        try {
            const [settings, coverageResponse] = await Promise.all([
                api.get('/spelling/word-audio/ai/settings'),
                api.get('/spelling/word-audio/ai/coverage')
            ]);
            setAiSettings(settings.data.data);
            setAiCoverage(coverageResponse.data.data);
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.aiLoadError') });
        }
    }, [t]);

    useEffect(() => { if (isAdmin && SHOW_DICTIONARY_SOURCES) loadCoverage(); }, [isAdmin, loadCoverage]);
    useEffect(() => { if (isAdmin) loadAiAudio(); }, [isAdmin, loadAiAudio]);

    const searchExamples = async (event) => {
        event?.preventDefault();
        const query = audioSearch.trim();
        if (query.length < 2) {
            setMessage({ severity: 'warning', text: t('audioAdmin.searchMin') });
            return;
        }
        setSearchingAudio(true);
        setMessage(null);
        try {
            const response = await api.get('/spelling/word-audio/search', { params: { q: query } });
            setAudioResults(response.data.data);
            setReplacementDrafts({});
            setAiTests({});
            if (response.data.data.length === 0) setMessage({ severity: 'info', text: t('audioAdmin.noWords') });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.searchError') });
        } finally {
            setSearchingAudio(false);
        }
    };

    const updateEntry = (word, patch) => {
        setAudioResults((current) => current.map((item) => (item.word === word ? { ...item, ...patch } : item)));
    };

    const removeAiClip = async (entry, accent) => {
        const label = t('audioAdmin.accentLabel', { accent: accent.toUpperCase() });
        const confirmed = window.confirm(t('audioAdmin.confirmRemove', { accent: label, word: entry.word }));
        if (!confirmed) return;
        const key = `${entry.word}:${accent}`;
        setAiAction({ key, action: 'remove' });
        setMessage(null);
        try {
            const response = await api.delete('/spelling/word-audio/ai/pronunciation', {
                data: { word: entry.word, accent }
            });
            updateEntry(entry.word, { ai: response.data.data.ai, aiRemoved: response.data.data.aiRemoved });
            setAiTests((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            setMessage({ severity: 'success', text: t('audioAdmin.removeSuccess', { accent: label, word: entry.word }) });
            await loadAiAudio();
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.removeError') });
        } finally {
            setAiAction(null);
        }
    };

    const regenerateAiClip = async (entry, accent) => {
        const label = t('audioAdmin.accentLabel', { accent: accent.toUpperCase() });
        const confirmed = window.confirm(t('audioAdmin.confirmRegenerate', { accent: label, word: entry.word }));
        if (!confirmed) return;
        const key = `${entry.word}:${accent}`;
        setAiAction({ key, action: 'regenerate' });
        setMessage(null);
        try {
            const response = await api.post('/spelling/word-audio/ai/pronunciation/regenerate', { word: entry.word, accent });
            const data = response.data.data;
            updateEntry(entry.word, { ai: data.ai, aiRemoved: data.aiRemoved });
            setAiTests((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            const cost = Number(data.costCents) > 0
                ? ` ${t('audioAdmin.costNote', { cost: Number(data.costCents).toFixed(2) })}`
                : ` ${t('audioAdmin.noCharge')}`;
            setMessage({ severity: 'success', text: `${t('audioAdmin.regenerateSuccess', { accent: label, word: entry.word })}${cost}` });
            await loadAiAudio();
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.regenerateError') });
        } finally {
            setAiAction(null);
        }
    };

    const removeExample = async (entry, example) => {
        const confirmed = window.confirm(t('audioAdmin.confirmRemoveExample', { dictionary: example.dictionary, word: entry.word }));
        if (!confirmed) return;
        const key = `${entry.word}:${example.dictionary}:${example.url}`;
        setRemovingAudio(key);
        setMessage(null);
        try {
            const response = await api.delete('/spelling/word-audio/examples', {
                data: { word: entry.word, dictionary: example.dictionary, url: example.url }
            });
            updateEntry(entry.word, { examples: response.data.data.examples });
            setMessage({ severity: 'success', text: t('audioAdmin.exampleRemoveSuccess', { dictionary: example.dictionary, word: entry.word }) });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.exampleRemoveError') });
        } finally {
            setRemovingAudio('');
        }
    };

    const replaceExample = async (entry, example, key) => {
        const replacementUrl = String(replacementDrafts[key] || '').trim();
        if (!isPreviewableAudioUrl(replacementUrl)) {
            setMessage({ severity: 'warning', text: t('audioAdmin.providerWarning') });
            return;
        }
        const confirmed = window.confirm(t('audioAdmin.confirmReplaceExample', { dictionary: example.dictionary, word: entry.word }));
        if (!confirmed) return;
        setReplacingAudio(key);
        setMessage(null);
        try {
            const response = await api.patch('/spelling/word-audio/examples', {
                word: entry.word,
                dictionary: example.dictionary,
                url: example.url,
                replacementUrl
            });
            updateEntry(entry.word, { examples: response.data.data.examples });
            setReplacementDrafts((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            setMessage({ severity: 'success', text: t('audioAdmin.exampleReplaceSuccess', { dictionary: example.dictionary, word: entry.word }) });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.exampleReplaceError') });
        } finally {
            setReplacingAudio('');
        }
    };

    const runImport = async (dryRun) => {
        if (!file) return;
        setBusy(true);
        setMessage(null);
        try {
            const formData = new FormData();
            formData.append('dryRun', dryRun ? 'true' : 'false');
            formData.append('file', file);
            const response = await api.post('/spelling/word-audio/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setReport(response.data.data);
            setMessage({ severity: 'success', text: dryRun ? t('audioAdmin.previewOnly') : t('audioAdmin.imported') });
            if (!dryRun) loadCoverage();
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.importFailed') });
        } finally {
            setBusy(false);
        }
    };

    const toggleGrade = async (grade, enabled) => {
        try {
            await api.put(`/spelling/word-audio/settings/${grade}`, { enabled });
            setCoverage((current) => current.map((entry) => (entry.grade === grade ? { ...entry, enabled } : entry)));
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.settingError') });
        }
    };

    const generateAiAudio = async (grade) => {
        setAiBusyGrade(grade);
        setMessage(null);
        try {
            const response = await api.post('/spelling/word-audio/ai/generate', { grade, limit: 80 });
            const data = response.data.data;
            const cost = Number(data.costCents) > 0
                ? ` ${t('audioAdmin.costNote', { cost: Number(data.costCents).toFixed(2) })}`
                : ` ${t('audioAdmin.noCharge')}`;
            setMessage({
                severity: data.failed > 0 ? 'warning' : 'success',
                text: `${t('audioAdmin.batchResult', { grade, generated: data.generated, failed: data.failed, remaining: data.remaining })}${cost}`
            });
            await loadAiAudio();
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || t('audioAdmin.batchError') });
        } finally {
            setAiBusyGrade('');
        }
    };

    const stopAiTestAudio = () => {
        const audio = aiTestAudioRef.current;
        if (!audio) return;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        aiTestAudioRef.current = null;
    };

    const setAiTestResult = (key, result) => {
        setAiTests((current) => ({ ...current, [key]: result }));
    };

    const testAiClip = async (entry, accent) => {
        const relative = entry.ai?.[accent];
        if (!relative) return;
        const key = `${entry.word}:${accent}`;
        const resolved = toApiUrl(relative);
        stopAiTestAudio();
        setAiTestResult(key, { status: 'loading', detail: t('audioAdmin.testChecking') });
        const audio = new Audio(resolved);
        audio.preload = 'auto';
        aiTestAudioRef.current = audio;
        const startedAt = performance.now();
        const started = new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error(t('audioAdmin.testTimeout'))), 8000);
            audio.addEventListener('playing', () => {
                window.clearTimeout(timer);
                resolve(performance.now() - startedAt);
            }, { once: true });
            audio.addEventListener('error', () => {
                window.clearTimeout(timer);
                const code = audio.error?.code;
                reject(new Error(code
                    ? t('audioAdmin.testMediaError', { code })
                    : t('audioAdmin.testMediaErrorGeneric')));
            }, { once: true });
        });
        // Both rejections are reported below; this keeps them from surfacing as unhandled.
        started.catch(() => {});
        audio.play().catch(() => {});
        let serverNote;
        try {
            const response = await fetch(resolved, { cache: 'no-store' });
            if (!response.ok) {
                stopAiTestAudio();
                setAiTestResult(key, {
                    status: 'error',
                    detail: t('audioAdmin.testHttpError', { status: response.status, url: resolved })
                });
                return;
            }
            const bytes = Number(response.headers.get('content-length') || 0);
            const type = response.headers.get('content-type') || 'unknown';
            serverNote = bytes > 0 ? t('audioAdmin.testServerBytes', { size: (bytes / 1024).toFixed(1), type }) : type;
            response.body?.cancel?.();
        } catch {
            serverNote = t('audioAdmin.testServerUnknown');
        }
        try {
            const latency = await started;
            setAiTestResult(key, {
                status: 'ok',
                detail: t('audioAdmin.testOk', { ms: Math.round(latency), serverNote })
            });
        } catch (error) {
            stopAiTestAudio();
            setAiTestResult(key, { status: 'error', detail: `${error.message} ${resolved}` });
        }
    };

    const aiActionFor = (word, accent) => (aiAction?.key === `${word}:${accent}` ? aiAction.action : '');

    return (
        <Stack spacing={3} sx={{ p: { xs: 1, sm: 3 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                <Typography variant="h5" component="h1">{t('audioAdmin.title')}</Typography>
                <Button component={Link} to="/portal/spelling" variant="outlined">{t('audioAdmin.back')}</Button>
            </Stack>

            {message && <Alert severity={message.severity}>{message.text}</Alert>}

            <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6" component="h2">{t('audioAdmin.searchTitle')}</Typography>
                        <Typography variant="body2" color="text.secondary">{t('audioAdmin.searchDescription')}</Typography>
                        <Box component="form" onSubmit={searchExamples}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <TextField
                                    label={t('audioAdmin.searchLabel')}
                                    value={audioSearch}
                                    onChange={(event) => setAudioSearch(event.target.value)}
                                    inputProps={{ maxLength: 200 }}
                                    sx={{ minWidth: { sm: 300 } }}
                                />
                                <Button type="submit" variant="contained" disabled={searchingAudio || audioSearch.trim().length < 2}>
                                    {searchingAudio ? t('audioAdmin.searching') : t('audioAdmin.search')}
                                </Button>
                            </Stack>
                        </Box>
                        {audioResults.map((entry) => (
                            <Box key={`${entry.word}-${entry.grade}`} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                                <Typography variant="subtitle1">{entry.word} · {entry.grade}</Typography>
                                <Stack
                                    spacing={1}
                                    sx={{ mt: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
                                >
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('audioAdmin.aiHeading')}</Typography>
                                    <Typography variant="caption" color="text.secondary">{t('audioAdmin.sharedNote')}</Typography>
                                    {['us', 'uk'].map((accent) => {
                                        const clip = entry.ai?.[accent];
                                        const removed = (entry.aiRemoved || []).includes(accent);
                                        const testKey = `${entry.word}:${accent}`;
                                        const test = aiTests[testKey];
                                        const action = aiActionFor(entry.word, accent);
                                        const label = t('audioAdmin.accentLabel', { accent: accent.toUpperCase() });
                                        const anyBusy = Boolean(aiAction || replacingAudio || removingAudio);
                                        return (
                                            <Stack key={accent} spacing={0.5}>
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
                                                    <Typography variant="body2" sx={{ minWidth: 210 }}>{label}</Typography>
                                                    {clip ? (
                                                        <>
                                                            <audio
                                                                controls
                                                                preload="none"
                                                                src={toApiUrl(clip)}
                                                                aria-label={`${entry.word} ${label}`}
                                                            />
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                disabled={test?.status === 'loading' || Boolean(action)}
                                                                onClick={() => testAiClip(entry, accent)}
                                                                aria-label={t('audioAdmin.testAria', { word: entry.word, accent: label })}
                                                            >
                                                                {test?.status === 'loading' ? t('audioAdmin.testing') : t('audioAdmin.testPlayback')}
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Typography variant="body2" color={removed ? 'warning.main' : 'text.secondary'}>
                                                            {removed ? t('audioAdmin.removedNote') : t('audioAdmin.notGenerated')}
                                                        </Typography>
                                                    )}
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        disabled={!aiSettings?.available || anyBusy}
                                                        onClick={() => regenerateAiClip(entry, accent)}
                                                    >
                                                        {action === 'regenerate'
                                                            ? t('audioAdmin.regenerating')
                                                            : clip ? t('audioAdmin.regenerate') : t('audioAdmin.generate')}
                                                    </Button>
                                                    {clip && (
                                                        <Button
                                                            size="small"
                                                            color="error"
                                                            variant="outlined"
                                                            disabled={anyBusy}
                                                            onClick={() => removeAiClip(entry, accent)}
                                                        >
                                                            {action === 'remove' ? t('audioAdmin.removing') : t('audioAdmin.remove')}
                                                        </Button>
                                                    )}
                                                </Stack>
                                                {!aiSettings?.available && (
                                                    <Typography variant="caption" color="text.secondary">{t('audioAdmin.regenerateUnavailable')}</Typography>
                                                )}
                                                {clip && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                                                        {toApiUrl(clip)}
                                                    </Typography>
                                                )}
                                                {test && (
                                                    <Typography
                                                        variant="caption"
                                                        role="status"
                                                        color={test.status === 'error' ? 'error.main' : 'text.secondary'}
                                                    >
                                                        {test.detail}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        );
                                    })}
                                    {(!entry.ai?.us || !entry.ai?.uk) && (
                                        <Typography variant="caption" color="text.secondary">{t('audioAdmin.generateHint')}</Typography>
                                    )}
                                </Stack>
                                {SHOW_DICTIONARY_SOURCES && <Stack spacing={1} sx={{ mt: 1 }}>
                                    {entry.examples.map((example, index) => {
                                        const key = `${entry.word}:${example.dictionary}:${example.url}`;
                                        return (
                                            <Box key={`${key}:${index}`}>
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                                    <Typography variant="body2" sx={{ minWidth: 100 }}>{t('audioAdmin.exampleLabel', { dictionary: example.dictionary })}</Typography>
                                                    <audio controls preload="none" src={example.url} aria-label={`${entry.word} ${example.dictionary}`} />
                                                    <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>{example.url}</Typography>
                                                </Stack>
                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ pl: { sm: 0, md: 14 }, mt: 1 }}>
                                                    <TextField
                                                        size="small"
                                                        fullWidth
                                                        label={t('audioAdmin.replacementLabel')}
                                                        value={replacementDrafts[key] || ''}
                                                        onChange={(event) => setReplacementDrafts((current) => ({ ...current, [key]: event.target.value }))}
                                                        inputProps={{ maxLength: 500 }}
                                                        error={Boolean(replacementDrafts[key]) && !isPreviewableAudioUrl(replacementDrafts[key].trim())}
                                                        helperText={t('audioAdmin.replacementHelper')}
                                                    />
                                                    {isPreviewableAudioUrl((replacementDrafts[key] || '').trim()) && (
                                                        <audio controls preload="none" src={replacementDrafts[key].trim()} aria-label={t('audioAdmin.replacementPreview', { word: entry.word })} />
                                                    )}
                                                    <Button
                                                        variant="contained"
                                                        disabled={!isPreviewableAudioUrl((replacementDrafts[key] || '').trim()) || Boolean(replacingAudio || removingAudio)}
                                                        onClick={() => replaceExample(entry, example, key)}
                                                    >
                                                        {replacingAudio === key ? t('audioAdmin.replacing') : t('audioAdmin.replaceLink')}
                                                    </Button>
                                                    <Button
                                                        color="error"
                                                        variant="outlined"
                                                        disabled={Boolean(replacingAudio || removingAudio)}
                                                        onClick={() => removeExample(entry, example)}
                                                    >
                                                        {removingAudio === key ? t('audioAdmin.removing') : t('audioAdmin.remove')}
                                                    </Button>
                                                </Stack>
                                            </Box>
                                        );
                                    })}
                                </Stack>}
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>

            {isAdmin && SHOW_DICTIONARY_SOURCES && <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6" component="h2">{t('audioAdmin.importTitle')}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('audioAdmin.importDescription')}
                            {' '}<a href="/spelling_word_audio_sample.csv" download>{t('audioAdmin.sampleCsv')}</a>
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                            <Button component="label" variant="outlined">
                                {file ? file.name : t('audioAdmin.chooseFile')}
                                <input
                                    hidden
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={(event) => { setFile(event.target.files?.[0] || null); setReport(null); }}
                                />
                            </Button>
                            <Button variant="outlined" disabled={!file || busy} onClick={() => runImport(true)}>{t('audioAdmin.preview')}</Button>
                            <Button variant="contained" disabled={!file || busy || !report?.dryRun} onClick={() => runImport(false)}>{t('audioAdmin.import')}</Button>
                        </Stack>
                        {report && (
                            <Box>
                                <Chip label={report.dryRun ? t('audioAdmin.previewChip') : t('audioAdmin.importedChip')} color={report.dryRun ? 'warning' : 'success'} size="small" sx={{ mb: 1 }} />
                                <Table size="small" aria-label={t('audioAdmin.importReportAria')}>
                                    <TableBody>
                                        {REPORT_ROWS.map(([key, labelKey]) => (
                                            <TableRow key={key}><TableCell>{t(`audioAdmin.report.${labelKey}`)}</TableCell><TableCell align="right">{report[key]}</TableCell></TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {report.urlsRejectedSample?.length > 0 && (
                                    <Alert severity="warning" sx={{ mt: 1 }}>
                                        {t('audioAdmin.rejectedUrls', { total: report.urlsRejectedSample.length })}
                                        {report.urlsRejectedSample.map((item) => ` ${item.row} ${item.word} ${item.field} (${item.reason});`)}
                                    </Alert>
                                )}
                                {report.wordsNotFoundSample?.length > 0 && (
                                    <Alert severity="info" sx={{ mt: 1 }}>
                                        {t('audioAdmin.notInApp', { total: report.wordsNotFoundSample.length })} {report.wordsNotFoundSample.join(', ')}
                                    </Alert>
                                )}
                            </Box>
                        )}
                    </Stack>
                </CardContent>
            </Card>}

            {isAdmin && SHOW_DICTIONARY_SOURCES && <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6" component="h2">{t('audioAdmin.coverageTitle')}</Typography>
                        <Typography variant="body2" color="text.secondary">{t('audioAdmin.coverageDescription')}</Typography>
                        <TableContainer>
                            <Table size="small" aria-label={t('audioAdmin.coverageAria')}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('audioAdmin.colGrade')}</TableCell>
                                        <TableCell>{t('audioAdmin.colEnabled')}</TableCell>
                                        <TableCell align="right">{t('audioAdmin.colWords')}</TableCell>
                                        {COVERAGE_COLUMNS.map(([key, labelKey]) => <TableCell key={key} align="right">{t(`audioAdmin.${labelKey}`)}</TableCell>)}
                                        <TableCell align="right">{t('audioAdmin.colNoAudio')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {coverage.map((entry) => (
                                        <TableRow key={entry.grade}>
                                            <TableCell>{entry.grade}</TableCell>
                                            <TableCell>
                                                <FormControlLabel
                                                    label={entry.enabled ? t('audioAdmin.on') : t('audioAdmin.off')}
                                                    control={<Switch checked={entry.enabled} onChange={(event) => toggleGrade(entry.grade, event.target.checked)} inputProps={{ 'aria-label': t('audioAdmin.enableAria', { grade: entry.grade }) }} />}
                                                />
                                            </TableCell>
                                            <TableCell align="right">{entry.totalWords}</TableCell>
                                            {COVERAGE_COLUMNS.map(([key]) => <TableCell key={key} align="right">{entry.counts[key]}</TableCell>)}
                                            <TableCell align="right">{entry.wordsWithNoAudio.length}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        {coverage.filter((entry) => entry.wordsWithNoAudio.length > 0).map((entry) => (
                            <Box key={entry.grade} component="details">
                                <summary>{t('audioAdmin.noAudioSummary', { grade: entry.grade, total: entry.wordsWithNoAudio.length })}</summary>
                                <Typography variant="body2">{entry.wordsWithNoAudio.join(', ')}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>}

            {isAdmin && <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                            <Typography variant="h6" component="h2">{t('audioAdmin.aiTitle')}</Typography>
                            {aiSettings && (
                                <Chip
                                    size="small"
                                    color={aiSettings.envForcedOff ? 'warning' : aiSettings.available ? 'success' : 'default'}
                                    label={aiSettings.envForcedOff
                                        ? t('audioAdmin.chipForcedOff')
                                        : aiSettings.available ? t('audioAdmin.chipOn') : t('audioAdmin.chipOff')}
                                />
                            )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">{t('audioAdmin.aiDescription')}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {aiSettings?.envForcedOff
                                ? t('audioAdmin.aiForcedOffNote')
                                : aiSettings?.available
                                    ? t('audioAdmin.aiOnNote')
                                    : t('audioAdmin.aiOffNote')}
                        </Typography>
                        {aiSettings && !aiSettings.available && !aiSettings.envForcedOff && (
                            <Alert severity="info">{t('audioAdmin.aiPlatformAlert')}</Alert>
                        )}
                        <Typography variant="body2" color="text.secondary">{t('audioAdmin.aiTestHint')}</Typography>
                        {aiCoverage?.grades?.length > 0 && (
                            <TableContainer>
                                <Table size="small" aria-label={t('audioAdmin.aiCoverageAria')}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t('audioAdmin.colGrade')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colWords')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colUs')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colUk')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colBoth')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colRemoved')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colMissing')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colCost')}</TableCell>
                                            <TableCell align="right">{t('audioAdmin.colGenerate')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {aiCoverage.grades.map((entry) => (
                                            <TableRow key={entry.grade}>
                                                <TableCell>{entry.grade}</TableCell>
                                                <TableCell align="right">{entry.totalWords}</TableCell>
                                                <TableCell align="right">{entry.withUs}</TableCell>
                                                <TableCell align="right">{entry.withUk}</TableCell>
                                                <TableCell align="right">{entry.withBoth}</TableCell>
                                                <TableCell align="right">{entry.removedClips || 0}</TableCell>
                                                <TableCell align="right">{entry.remainingClips}</TableCell>
                                                <TableCell align="right">{Number(entry.estimatedCents || 0).toFixed(2)}¢</TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        disabled={!aiSettings?.available || entry.remainingClips === 0 || Boolean(aiBusyGrade)}
                                                        onClick={() => generateAiAudio(entry.grade)}
                                                    >
                                                        {aiBusyGrade === entry.grade ? t('audioAdmin.generating') : t('audioAdmin.generate')}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                        {aiCoverage && aiCoverage.grades.length === 0 && (
                            <Typography variant="body2" color="text.secondary">{t('audioAdmin.importFirst')}</Typography>
                        )}
                    </Stack>
                </CardContent>
            </Card>}
        </Stack>
    );
};

export default SpellingAudioAdminPage;