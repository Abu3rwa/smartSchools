import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, FormControlLabel } from '@mui/material';
import { Link } from 'react-router-dom';
import api from '../../config/api';

const COVERAGE_COLUMNS = [
    ['longmanUS', 'Longman US'],
    ['longmanUK', 'Longman UK'],
    ['oxfordUS', 'Oxford US'],
    ['oxfordUK', 'Oxford UK'],
    ['websterUS', 'Webster US'],
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

const SpellingAudioAdminPage = () => {
    const [file, setFile] = useState(null);
    const [report, setReport] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const [coverage, setCoverage] = useState([]);

    const loadCoverage = useCallback(async () => {
        try {
            const response = await api.get('/spelling/word-audio/coverage');
            setCoverage(response.data.data);
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to load coverage.' });
        }
    }, []);

    useEffect(() => { loadCoverage(); }, [loadCoverage]);

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
                <Typography variant="h5" component="h1">Spelling pronunciation audio</Typography>
                <Button component={Link} to="/portal/spelling" variant="outlined">Back to spelling</Button>
            </Stack>

            {message && <Alert severity={message.severity}>{message.text}</Alert>}

            <Card variant="outlined">
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6" component="h2">Import audio CSV</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Columns: word, Longman US, Longman UK, Oxford US, Oxford UK, Webster US, status, first week.
                            Optional: definition, and Longman/Oxford/Webster example 1, example 2, … (audio URLs; several URLs in one cell can be separated by |).
                            Empty cells never erase existing data. Preview first; nothing is saved until you press Import.
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
            </Card>

            <Card variant="outlined">
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
            </Card>
        </Stack>
    );
};

export default SpellingAudioAdminPage;
