import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, FormControlLabel } from '@mui/material';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../../config/api';
import { selectIsAdmin } from '../../store/slices/authSlice';

const COVERAGE_COLUMNS = [
    ['longmanUS', 'Longman US'],
    ['longmanUK', 'Longman UK'],
    ['oxfordUS', 'Oxford US'],
    ['oxfordUK', 'Oxford UK'],
    ['googleUS', 'Google US'],
    ['googleUK', 'Google UK'],
    ['withExamples', 'Examples'],
    ['withDefinition', 'Definition']
];

const REPORT_ROWS = [
    ['rowsRead', 'Rows read'],
    ['rowsWithAudio', 'Rows with at least one URL'],
    ['wordsMatchedInApp', 'Words matched to app words'],
    ['wordsNotFoundInApp', 'Words not found in the app'],
    ['urlsRejected', 'URLs rejected'],
    ['rowsSkipped', 'Rows skipped'],
    ['wordsToCreate', 'New words'],
    ['wordsToUpdate', 'Words updated'],
    ['wordsUnchanged', 'Words unchanged']
];

const PRONUNCIATION_FIELDS = [
    ['longmanUS', 'Longman US pronunciation'],
    ['longmanUK', 'Longman UK pronunciation'],
    ['oxfordUS', 'Oxford US pronunciation'],
    ['oxfordUK', 'Oxford UK pronunciation'],
    ['googleUS', 'Google US pronunciation'],
    ['googleUK', 'Google UK pronunciation']
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
    const [pronunciationDrafts, setPronunciationDrafts] = useState({});

    const loadCoverage = useCallback(async () => {
        try {
            const response = await api.get('/spelling/word-audio/coverage');
            setCoverage(response.data.data);
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to load coverage.' });
        }
    }, []);

    useEffect(() => { if (isAdmin) loadCoverage(); }, [isAdmin, loadCoverage]);

    const searchExamples = async (event) => {
        event?.preventDefault();
        const query = audioSearch.trim();
        if (query.length < 2) {
            setMessage({ severity: 'warning', text: 'Enter at least 2 letters to search for a word.' });
            return;
        }
        setSearchingAudio(true);
        setMessage(null);
        try {
            const response = await api.get('/spelling/word-audio/search', { params: { q: query } });
            setAudioResults(response.data.data);
            setReplacementDrafts({});
            setPronunciationDrafts({});
            if (response.data.data.length === 0) setMessage({ severity: 'info', text: 'No spelling words were found.' });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to search spelling audio.' });
        } finally {
            setSearchingAudio(false);
        }
    };

    const removeExample = async (entry, example) => {
        const confirmed = window.confirm(
            `Permanently remove this ${example.dictionary} example recording for "${entry.word}"? This changes the shared spelling audio for every school. Pronunciation audio is not affected.`
        );
        if (!confirmed) return;
        const key = `${entry.word}:${example.dictionary}:${example.url}`;
        setRemovingAudio(key);
        setMessage(null);
        try {
            const response = await api.delete('/spelling/word-audio/examples', {
                data: { word: entry.word, dictionary: example.dictionary, url: example.url }
            });
            setAudioResults((current) => current
                .map((item) => item.word === entry.word ? { ...item, examples: response.data.data.examples } : item));
            setMessage({ severity: 'success', text: `Removed the ${example.dictionary} example for "${entry.word}" from shared spelling audio.` });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to remove the example audio.' });
        } finally {
            setRemovingAudio('');
        }
    };

    const replacePronunciation = async (entry, field, label, key) => {
        const currentUrl = entry.pronunciations[field] || '';
        const replacementUrl = String(pronunciationDrafts[key] ?? currentUrl).trim();
        if (replacementUrl && !isPreviewableAudioUrl(replacementUrl)) {
            setMessage({ severity: 'warning', text: 'Enter an HTTPS audio link from Longman, Oxford Learner’s Dictionaries, or Google.' });
            return;
        }
        if (replacementUrl === currentUrl) return;
        const action = replacementUrl ? 'Replace' : 'Remove';
        const confirmed = window.confirm(
            `${action} the ${label} for "${entry.word}"? This changes shared spelling audio for every school.`
        );
        if (!confirmed) return;
        setReplacingAudio(key);
        setMessage(null);
        try {
            const response = await api.patch('/spelling/word-audio/pronunciation', {
                word: entry.word,
                field,
                currentUrl,
                replacementUrl
            });
            setAudioResults((current) => current.map((item) => (
                item.word === entry.word ? { ...item, pronunciations: response.data.data.pronunciations } : item
            )));
            setPronunciationDrafts((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            setMessage({ severity: 'success', text: `Updated the ${label} for "${entry.word}" in shared spelling audio.` });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || `Unable to update the ${label}.` });
        } finally {
            setReplacingAudio('');
        }
    };

    const replaceExample = async (entry, example, key) => {
        const replacementUrl = String(replacementDrafts[key] || '').trim();
        if (!isPreviewableAudioUrl(replacementUrl)) {
            setMessage({ severity: 'warning', text: 'Enter an HTTPS audio link from Longman, Oxford Learner’s Dictionaries, or Merriam-Webster.' });
            return;
        }
        const confirmed = window.confirm(
            `Replace this ${example.dictionary} example for "${entry.word}" with the previewed link? This changes shared spelling audio for every school.`
        );
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
            setAudioResults((current) => current.map((item) => (
                item.word === entry.word ? { ...item, examples: response.data.data.examples } : item
            )));
            setReplacementDrafts((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            setMessage({ severity: 'success', text: `Updated the ${example.dictionary} example for "${entry.word}" in shared spelling audio.` });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to replace the example audio.' });
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
            setMessage({ severity: 'success', text: dryRun ? 'Preview only: nothing was saved.' : 'Import finished.' });
            if (!dryRun) loadCoverage();
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Import failed.' });
        } finally {
            setBusy(false);
        }
    };

    const toggleGrade = async (grade, enabled) => {
        try {
            await api.put(`/spelling/word-audio/settings/${grade}`, { enabled });
            setCoverage((current) => current.map((entry) => (entry.grade === grade ? { ...entry, enabled } : entry)));
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to change the setting.' });
        }
    };

    return (
        <Stack spacing={3} sx={{ p: { xs: 1, sm: 3 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
                <Typography variant="h5" component="h1">Spelling audio</Typography>
                <Button component={Link} to="/portal/spelling" variant="outlined">Back to spelling</Button>
            </Stack>

            {message && <Alert severity={message.severity}>{message.text}</Alert>}

            <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6" component="h2">Review and edit spelling audio</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Search for a spelling word to listen to and edit its Longman, Oxford, and Google pronunciation links and example recordings. Changes apply to shared spelling audio for all schools.
                        </Typography>
                        <Box component="form" onSubmit={searchExamples}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <TextField
                                    label="Search spelling words"
                                    value={audioSearch}
                                    onChange={(event) => setAudioSearch(event.target.value)}
                                    inputProps={{ maxLength: 200 }}
                                    sx={{ minWidth: { sm: 300 } }}
                                />
                                <Button type="submit" variant="contained" disabled={searchingAudio || audioSearch.trim().length < 2}>
                                    {searchingAudio ? 'Searching…' : 'Search'}
                                </Button>
                            </Stack>
                        </Box>
                        {audioResults.map((entry) => (
                            <Box key={`${entry.word}-${entry.grade}`} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                                <Typography variant="subtitle1">{entry.word} · {entry.grade}</Typography>
                                <Stack spacing={1} sx={{ mt: 1 }}>
                                    {PRONUNCIATION_FIELDS.map(([field, label]) => {
                                        const key = `${entry.word}:pronunciation:${field}`;
                                        const currentUrl = entry.pronunciations[field] || '';
                                        const draft = String(pronunciationDrafts[key] ?? currentUrl).trim();
                                        const hasChanges = draft !== currentUrl;
                                        return (
                                            <Stack key={field} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                                                <Typography variant="body2" sx={{ minWidth: 210 }}>{label}</Typography>
                                                {currentUrl && <audio controls preload="none" src={currentUrl} aria-label={`${entry.word} ${label}`} />}
                                                <TextField
                                                    size="small"
                                                    fullWidth
                                                    label={`${label} audio URL`}
                                                    value={pronunciationDrafts[key] ?? currentUrl}
                                                    onChange={(event) => setPronunciationDrafts((current) => ({ ...current, [key]: event.target.value }))}
                                                    inputProps={{ maxLength: 500 }}
                                                    error={Boolean(draft) && !isPreviewableAudioUrl(draft)}
                                                    helperText="Use an HTTPS audio link from Longman, Oxford, or Google. Leave empty to remove."
                                                />
                                                {hasChanges && isPreviewableAudioUrl(draft) && (
                                                    <audio controls preload="none" src={draft} aria-label={`Preview ${label} for ${entry.word}`} />
                                                )}
                                                <Button
                                                    variant="contained"
                                                    disabled={!hasChanges || (Boolean(draft) && !isPreviewableAudioUrl(draft)) || Boolean(replacingAudio || removingAudio)}
                                                    onClick={() => replacePronunciation(entry, field, label, key)}
                                                >
                                                    {replacingAudio === key ? 'Saving…' : draft ? 'Save URL' : 'Remove URL'}
                                                </Button>
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                                <Stack spacing={1} sx={{ mt: 1 }}>
                                    {entry.examples.map((example, index) => {
                                        const key = `${entry.word}:${example.dictionary}:${example.url}`;
                                        return (
                                            <Box key={`${key}:${index}`}>
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                                    <Typography variant="body2" sx={{ minWidth: 100 }}>{example.dictionary} example</Typography>
                                                    <audio controls preload="none" src={example.url} aria-label={`${entry.word} ${example.dictionary} example audio`} />
                                                    <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>{example.url}</Typography>
                                                </Stack>
                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ pl: { sm: 0, md: 14 }, mt: 1 }}>
                                                    <TextField
                                                        size="small"
                                                        fullWidth
                                                        label="Replacement example audio URL"
                                                        value={replacementDrafts[key] || ''}
                                                        onChange={(event) => setReplacementDrafts((current) => ({ ...current, [key]: event.target.value }))}
                                                        inputProps={{ maxLength: 500 }}
                                                        error={Boolean(replacementDrafts[key]) && !isPreviewableAudioUrl(replacementDrafts[key].trim())}
                                                        helperText="Use an HTTPS audio link from Longman, Oxford, or Merriam-Webster."
                                                    />
                                                    {isPreviewableAudioUrl((replacementDrafts[key] || '').trim()) && (
                                                        <audio controls preload="none" src={replacementDrafts[key].trim()} aria-label={`Preview replacement ${example.dictionary} example for ${entry.word}`} />
                                                    )}
                                                    <Button
                                                        variant="contained"
                                                        disabled={!isPreviewableAudioUrl((replacementDrafts[key] || '').trim()) || Boolean(replacingAudio || removingAudio)}
                                                        onClick={() => replaceExample(entry, example, key)}
                                                    >
                                                        {replacingAudio === key ? 'Replacing…' : 'Replace link'}
                                                    </Button>
                                                    <Button
                                                        color="error"
                                                        variant="outlined"
                                                        disabled={Boolean(replacingAudio || removingAudio)}
                                                        onClick={() => removeExample(entry, example)}
                                                    >
                                                        {removingAudio === key ? 'Removing…' : 'Remove'}
                                                    </Button>
                                                </Stack>
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>

            {isAdmin && <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6" component="h2">Import audio CSV</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Columns: word, Longman US, Longman UK, Oxford US, Oxford UK, Google US, Google UK, status, first week.
                            Optional: definition, and Longman/Oxford/Webster/Google example 1, example 2, … (audio URLs; several URLs in one cell can be separated by |).
                            Empty cells never erase existing data. Preview first; nothing is saved until you press Import.
                            {' '}<a href="/spelling_word_audio_sample.csv" download>Download sample CSV</a>
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                            <Button component="label" variant="outlined">
                                {file ? file.name : 'Choose CSV file'}
                                <input
                                    hidden
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={(event) => { setFile(event.target.files?.[0] || null); setReport(null); }}
                                />
                            </Button>
                            <Button variant="outlined" disabled={!file || busy} onClick={() => runImport(true)}>Preview (dry run)</Button>
                            <Button variant="contained" disabled={!file || busy || !report?.dryRun} onClick={() => runImport(false)}>Import</Button>
                        </Stack>
                        {report && (
                            <Box>
                                <Chip label={report.dryRun ? 'Preview (nothing saved)' : 'Imported'} color={report.dryRun ? 'warning' : 'success'} size="small" sx={{ mb: 1 }} />
                                <Table size="small" aria-label="Import report">
                                    <TableBody>
                                        {REPORT_ROWS.map(([key, label]) => (
                                            <TableRow key={key}><TableCell>{label}</TableCell><TableCell align="right">{report[key]}</TableCell></TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {report.urlsRejectedSample?.length > 0 && (
                                    <Alert severity="warning" sx={{ mt: 1 }}>
                                        Rejected URLs (first {report.urlsRejectedSample.length}):
                                        {report.urlsRejectedSample.map((item) => ` row ${item.row} ${item.word} ${item.field} (${item.reason});`)}
                                    </Alert>
                                )}
                                {report.wordsNotFoundSample?.length > 0 && (
                                    <Alert severity="info" sx={{ mt: 1 }}>
                                        Not in the app (first {report.wordsNotFoundSample.length}): {report.wordsNotFoundSample.join(', ')}
                                    </Alert>
                                )}
                            </Box>
                        )}
                    </Stack>
                </CardContent>
            </Card>}

            {isAdmin && <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6" component="h2">Coverage and per-grade switch</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Students only see the extra voices in grades that are switched on. Off by default.
                        </Typography>
                        <TableContainer>
                            <Table size="small" aria-label="Audio coverage by grade">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Grade</TableCell>
                                        <TableCell>Enabled</TableCell>
                                        <TableCell align="right">Words</TableCell>
                                        {COVERAGE_COLUMNS.map(([, label]) => <TableCell key={label} align="right">{label}</TableCell>)}
                                        <TableCell align="right">No audio</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {coverage.map((entry) => (
                                        <TableRow key={entry.grade}>
                                            <TableCell>{entry.grade}</TableCell>
                                            <TableCell>
                                                <FormControlLabel
                                                    label={entry.enabled ? 'On' : 'Off'}
                                                    control={<Switch checked={entry.enabled} onChange={(event) => toggleGrade(entry.grade, event.target.checked)} inputProps={{ 'aria-label': `Enable extra voices for ${entry.grade}` }} />}
                                                />
                                            </TableCell>
                                            <TableCell align="right">{entry.totalWords}</TableCell>
                                            {COVERAGE_COLUMNS.map(([key, label]) => <TableCell key={label} align="right">{entry.counts[key]}</TableCell>)}
                                            <TableCell align="right">{entry.wordsWithNoAudio.length}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        {coverage.filter((entry) => entry.wordsWithNoAudio.length > 0).map((entry) => (
                            <Box key={entry.grade} component="details">
                                <summary>{entry.grade}: {entry.wordsWithNoAudio.length} words with no audio</summary>
                                <Typography variant="body2">{entry.wordsWithNoAudio.join(', ')}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>}
        </Stack>
    );
};

export default SpellingAudioAdminPage;
