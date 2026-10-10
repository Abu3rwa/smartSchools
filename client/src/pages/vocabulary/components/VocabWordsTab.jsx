import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import api from '../../../config/api';

const errorText = (error, fallback) => error.response?.data?.message || fallback;
const FORMS = ['', 'plural', 'verb_s', 'past', 'ing', 'comparative', 'superlative', 'contraction'];
const SOURCE_LABELS = { oxford: 'Oxford', longman: 'Longman', webster: 'Merriam-Webster' };
const EMPTY_SOURCE = { definitionText: '', pageUrl: '', audioUsUrl: '', audioUkUrl: '', exampleAudioUrl: '' };

const WordDialog = ({ word, listId, onClose, onSaved }) => {
    const [form, setForm] = useState(null);
    const [sources, setSources] = useState({});
    const [error, setError] = useState('');
    const isNew = word && !word._id;

    useEffect(() => {
        if (!word) return;
        setError('');
        setForm({
            word: word.word || '',
            partOfSpeech: (word.partOfSpeech || []).map((entry) => `${entry}.`).join('/'),
            form: word.form || '',
            baseWord: word.baseWord || '',
            exampleSentence: word.exampleSentence || '',
            meaning: word.meaning || '',
            arabicMeaning: word.arabicMeaning || '',
            notes: word.notes || '',
            verified: Boolean(word.verified)
        });
        setSources({});
        if (word._id) {
            api.get(`/vocabulary/words/${word._id}/sources`).then(({ data }) => {
                setSources(Object.fromEntries(data.data.map((entry) => [entry.source, { ...EMPTY_SOURCE, ...entry }])));
            }).catch(() => setError('Unable to load dictionary sources.'));
        }
    }, [word]);

    if (!word || !form) return null;
    const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
    const setSource = (source, field, value) => setSources((current) => ({ ...current, [source]: { ...EMPTY_SOURCE, ...(current[source] || {}), [field]: value } }));

    const save = async () => {
        try {
            let id = word._id;
            if (isNew) {
                const { data } = await api.post('/vocabulary/words', { ...form, listId });
                id = data.data._id;
            } else {
                await api.patch(`/vocabulary/words/${id}`, form);
            }
            for (const [source, values] of Object.entries(sources)) {
                const filled = Object.values(values).some((value) => typeof value === 'string' && value.trim());
                if (filled) {
                    await api.put(`/vocabulary/words/${id}/sources/${source}`, {
                        definitionText: values.definitionText, pageUrl: values.pageUrl, audioUsUrl: values.audioUsUrl,
                        audioUkUrl: values.audioUkUrl, exampleAudioUrl: values.exampleAudioUrl
                    });
                }
            }
            onSaved();
            onClose();
        } catch (requestError) {
            setError(errorText(requestError, 'Unable to save the word.'));
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>{isNew ? 'Add word' : `Edit ${word.word}`}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField label="Word" value={form.word} onChange={set('word')} fullWidth required />
                        <TextField label="Part of speech (n., v., adj., adv.)" value={form.partOfSpeech} onChange={set('partOfSpeech')} fullWidth required helperText="Use v./n. for two parts of speech" />
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <FormControl fullWidth>
                            <InputLabel id="vocab-form">Form</InputLabel>
                            <Select labelId="vocab-form" label="Form" value={form.form} onChange={set('form')}>
                                {FORMS.map((entry) => <MenuItem key={entry || 'none'} value={entry}>{entry || 'Base word (none)'}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField label="Base word (whose audio plays)" value={form.baseWord} onChange={set('baseWord')} fullWidth />
                    </Stack>
                    <TextField label="Example sentence" value={form.exampleSentence} onChange={set('exampleSentence')} multiline minRows={2} />
                    <TextField label="Student-friendly meaning" value={form.meaning} onChange={set('meaning')} multiline minRows={2} />
                    <TextField label="Arabic meaning (optional)" value={form.arabicMeaning} onChange={set('arabicMeaning')} inputProps={{ dir: 'auto' }} />
                    <TextField label="Notes" value={form.notes} onChange={set('notes')} />
                    <FormControlLabel control={<Checkbox checked={form.verified} onChange={(event) => setForm((current) => ({ ...current, verified: event.target.checked }))} />} label="Verified" />
                    <Typography variant="subtitle2">Dictionary sources (one chosen meaning per source)</Typography>
                    {['oxford', 'longman', 'webster'].map((source) => {
                        const values = { ...EMPTY_SOURCE, ...(sources[source] || {}) };
                        return (
                            <Stack key={source} spacing={1} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                                <Typography variant="subtitle2">{SOURCE_LABELS[source]}</Typography>
                                <TextField label="Definition text" value={values.definitionText} onChange={(event) => setSource(source, 'definitionText', event.target.value)} multiline minRows={2} />
                                <TextField label="Page URL" value={values.pageUrl} onChange={(event) => setSource(source, 'pageUrl', event.target.value)} />
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                    <TextField label="Audio US URL" value={values.audioUsUrl} onChange={(event) => setSource(source, 'audioUsUrl', event.target.value)} fullWidth />
                                    <TextField label="Audio UK URL" value={values.audioUkUrl} onChange={(event) => setSource(source, 'audioUkUrl', event.target.value)} fullWidth />
                                </Stack>
                                <TextField label="Example audio URL" value={values.exampleAudioUrl} onChange={(event) => setSource(source, 'exampleAudioUrl', event.target.value)} />
                            </Stack>
                        );
                    })}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={save}>Save</Button>
            </DialogActions>
        </Dialog>
    );
};

const VocabWordsTab = () => {
    const [lists, setLists] = useState([]);
    const [listId, setListId] = useState('');
    const [words, setWords] = useState([]);
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get('/vocabulary/lists').then(({ data }) => {
            setLists(data.data);
            if (data.data[0]) setListId((current) => current || data.data[0].listId);
        }).catch((requestError) => setError(errorText(requestError, 'Unable to load lists.')));
    }, []);

    const loadWords = useCallback(async () => {
        if (!listId) return;
        try {
            const { data } = await api.get('/vocabulary/words', { params: { listId } });
            setWords(data.data);
        } catch (requestError) {
            setError(errorText(requestError, 'Unable to load words.'));
        }
    }, [listId]);

    useEffect(() => { loadWords(); }, [loadWords]);

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            <Stack direction="row" spacing={2} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 280 }}>
                    <InputLabel id="vocab-words-list">List</InputLabel>
                    <Select labelId="vocab-words-list" label="List" value={listId} onChange={(event) => setListId(event.target.value)}>
                        {lists.map((list) => <MenuItem key={list.listId} value={list.listId}>{list.listId} - {list.title}</MenuItem>)}
                    </Select>
                </FormControl>
                <Button variant="outlined" disabled={!listId} onClick={() => setEditing({})}>Add word</Button>
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label="Vocabulary words">
                    <TableHead>
                        <TableRow><TableCell>Word</TableCell><TableCell>Part of speech</TableCell><TableCell>Form</TableCell><TableCell>Meaning</TableCell><TableCell>Verified</TableCell><TableCell /></TableRow>
                    </TableHead>
                    <TableBody>
                        {words.map((word) => (
                            <TableRow key={word._id}>
                                <TableCell>{word.word}</TableCell>
                                <TableCell>{word.partOfSpeech.map((entry) => `${entry}.`).join('/')}</TableCell>
                                <TableCell>{word.form ? `${word.form} of ${word.baseWord}` : ''}</TableCell>
                                <TableCell>{word.meaning}</TableCell>
                                <TableCell>{word.verified ? 'Yes' : 'No'}</TableCell>
                                <TableCell><Button size="small" onClick={() => setEditing(word)}>Edit</Button></TableCell>
                            </TableRow>
                        ))}
                        {words.length === 0 && <TableRow><TableCell colSpan={6}>No words in this list yet.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </Box>
            <WordDialog word={editing} listId={listId} onClose={() => setEditing(null)} onSaved={loadWords} />
        </Stack>
    );
};

export default VocabWordsTab;
