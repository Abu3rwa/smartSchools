import { useState } from 'react';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import api from '../../../config/api';

const TYPES = [
    { value: 'combined', label: 'Everything in one file (recommended)' },
    { value: 'lists', label: 'Advanced: lists only' },
    { value: 'words', label: 'Advanced: words only' },
    { value: 'word_sources', label: 'Advanced: dictionary sources only' },
    { value: 'mcq', label: 'Multiple-choice questions' }
];

const downloadBlob = (content, fileName, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
};

const csvCell = (value) => (/[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));

const VocabImportTab = () => {
    const [type, setType] = useState('combined');
    const [mode, setMode] = useState('update');
    const [file, setFile] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const send = async (dryRun) => {
        if (!file) return;
        setBusy(true);
        setError('');
        const body = new FormData();
        body.append('file', file);
        body.append('mode', mode);
        body.append('dryRun', String(dryRun));
        try {
            const { data } = await api.post(`/vocabulary/import/${type}`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
            setResult(data.data);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'The import failed.');
        } finally {
            setBusy(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const { data } = await api.get(`/vocabulary/import/templates/${type}`, { responseType: 'text' });
            downloadBlob(data, `${type}.csv`, 'text/csv;charset=utf-8');
        } catch {
            setError('Unable to download the template.');
        }
    };

    const downloadErrors = () => {
        const lines = [['row', 'column', 'message'], ...result.errors.map((entry) => [entry.row, entry.column, entry.message])];
        downloadBlob(`\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`, `${type}-errors.csv`, 'text/csv;charset=utf-8');
    };

    const summary = result?.summary;
    const canApply = result && result.dryRun && result.ok && !result.fatal;

    return (
        <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
                One row per word: its list, its details and its Oxford, Longman and Webster entries. Leave any dictionary columns empty if you don't have them. Importing again updates existing records and never creates duplicates.
            </Typography>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl size="small" sx={{ minWidth: 280 }}>
                    <InputLabel id="vocab-import-type">File type</InputLabel>
                    <Select labelId="vocab-import-type" label="File type" value={type} onChange={(event) => { setType(event.target.value); setResult(null); }}>
                        {TYPES.map((entry) => <MenuItem key={entry.value} value={entry.value}>{entry.label}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                    <InputLabel id="vocab-import-mode">If a record already exists</InputLabel>
                    <Select labelId="vocab-import-mode" label="If a record already exists" value={mode} onChange={(event) => { setMode(event.target.value); setResult(null); }}>
                        <MenuItem value="update">Update it</MenuItem>
                        <MenuItem value="add-only">Skip it (add new only)</MenuItem>
                    </Select>
                </FormControl>
                <Button variant="outlined" onClick={downloadTemplate}>Download template</Button>
            </Stack>
            <Stack direction="row" spacing={2} alignItems="center">
                <Button variant="outlined" component="label">
                    Choose CSV file
                    <input hidden type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setResult(null); }} />
                </Button>
                <Typography variant="body2">{file ? file.name : 'No file chosen'}</Typography>
                <Button variant="contained" disabled={!file || busy} onClick={() => send(true)}>Preview (dry run)</Button>
                <Button variant="contained" color="success" disabled={!canApply || busy} onClick={() => send(false)}>Apply import</Button>
            </Stack>
            {result?.fatal && <Alert severity="error">{result.fatal}</Alert>}
            {summary && (
                <Alert severity={result.ok ? 'success' : 'warning'}>
                    {result.applied ? 'Import applied' : 'Preview only, nothing saved'}: {summary.rows} rows, {summary.created} to add, {summary.updated} to update, {summary.skipped} skipped, {summary.invalid} with errors.
                    {summary.details && ` (Lists: ${summary.details.lists.created} new; words: ${summary.details.words.created} new, ${summary.details.words.updated} updated; dictionary entries: ${summary.details.sources.created} new, ${summary.details.sources.updated} updated.)`}
                    {!result.ok && ' Fix the errors below, then preview again. Rows with errors are never imported.'}
                </Alert>
            )}
            {result?.errors?.length > 0 && (
                <Box>
                    <Button size="small" onClick={downloadErrors} sx={{ mb: 1 }}>Download error report</Button>
                    <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
                        <Table size="small" aria-label="Import errors">
                            <TableHead><TableRow><TableCell>Row</TableCell><TableCell>Column</TableCell><TableCell>Problem</TableCell></TableRow></TableHead>
                            <TableBody>
                                {result.errors.map((entry, index) => (
                                    <TableRow key={`${entry.row}-${entry.column}-${index}`}><TableCell>{entry.row}</TableCell><TableCell>{entry.column}</TableCell><TableCell>{entry.message}</TableCell></TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Box>
                </Box>
            )}
        </Stack>
    );
};

export default VocabImportTab;
