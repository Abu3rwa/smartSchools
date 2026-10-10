import './VocabularyStudentPage.css';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, FormControlLabel, Stack, Tab, Tabs, Typography } from '@mui/material';
import api from '../../config/api';
import VocabStudyView from './components/VocabStudyView';
import VocabPracticeView from './components/VocabPracticeView';
import VocabProgressView from './components/VocabProgressView';

const VocabularyStudentPage = () => {
    const [state, setState] = useState({ loading: true, error: '', data: null });
    const [selected, setSelected] = useState([]);
    const [all, setAll] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tab, setTab] = useState(0);
    const [wordsState, setWordsState] = useState({ words: [], settings: { masteryThreshold: 2 }, loading: false });
    const [weakOnly, setWeakOnly] = useState(false);

    useEffect(() => {
        api.get('/vocabulary/student/overview').then(({ data }) => {
            setState({ loading: false, error: '', data: data.data });
            setSelected(data.data.selection?.listIds || []);
            setAll(Boolean(data.data.selection?.all));
        }).catch((error) => setState({ loading: false, error: error.response?.data?.message || 'Unable to load vocabulary.', data: null }));
    }, []);

    const selectionKey = [all, selected.join(","), saved].join("|");
    const savedOnce = Boolean(state.data?.selection && (state.data.selection.all || state.data.selection.listIds?.length)) || saved;
    const loadWords = (weak) => {
        setWordsState((c) => ({ ...c, loading: true }));
        api.get(`/vocabulary/student/words${weak ? '?weak=true' : ''}`).then(({ data }) => setWordsState({ words: data.data.words, settings: data.data.settings, loading: false }))
            .catch(() => setWordsState({ words: [], settings: { masteryThreshold: 2 }, loading: false }));
    };
    useEffect(() => { if (savedOnce && tab > 0 && tab < 3) loadWords(weakOnly); }, [tab, weakOnly, savedOnce, selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

    if (state.loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>;
    if (state.error) return <Box sx={{ p: 3 }}><Alert severity="error">{state.error}</Alert></Box>;

    const { enabled, lists } = state.data;
    if (!enabled) return <Box sx={{ p: 3 }}><Alert severity="info">Vocabulary Practice is not available yet.</Alert></Box>;
    if (!lists.length) return <Box sx={{ p: 3 }}><Alert severity="info">Your teacher has not assigned any vocabulary lists yet.</Alert></Box>;

    const toggle = (listId) => {
        setSaved(false);
        setAll(false);
        setSelected((current) => (current.includes(listId) ? current.filter((id) => id !== listId) : [...current, listId]));
    };

    const save = async () => {
        try {
            await api.put('/vocabulary/student/selection', { listIds: selected, all });
            setSaved(true);
        } catch (error) {
            setState((current) => ({ ...current, error: error.response?.data?.message || 'Unable to save your choice.' }));
        }
    };

    const total = lists.reduce((sum, list) => sum + list.wordCount, 0);

    const picker = (
        <>
            <Typography variant="body1" sx={{ mb: 2 }}>Choose the lists you want to practise.</Typography>
            <FormControlLabel
                control={<Checkbox checked={all} onChange={(event) => { setSaved(false); setAll(event.target.checked); if (event.target.checked) setSelected([]); }} />}
                label={`All my lists (${total} words)`}
            />
            <Stack spacing={1} sx={{ my: 2 }}>
                {lists.map((list) => (
                    <Card key={list.listId} variant="outlined">
                        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                            <FormControlLabel
                                control={<Checkbox checked={all || selected.includes(list.listId)} disabled={all} onChange={() => toggle(list.listId)} />}
                                label={`${list.title} - Semester ${list.semester} (${list.wordCount} words)`}
                            />
                            {list.lessonTitle && <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 4 }}>{list.lessonTitle}</Typography>}
                        </CardContent>
                    </Card>
                ))}
            </Stack>
            <Button variant="contained" onClick={save} disabled={!all && selected.length === 0}>Save my choice</Button>
            {saved && <Alert severity="success" sx={{ mt: 2 }} role="status">Saved. Open the Study or Practice tab to begin.</Alert>}
        </>
    );

    const needList = <Alert severity="info">Choose and save your lists first.</Alert>;
    const loading = wordsState.loading ? <CircularProgress aria-label="Loading" /> : null;

    return (
        <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 720, mx: 'auto', height: { xs: 'calc(100dvh - 72px)', md: 'calc(100dvh - 96px)' }, display: 'flex', flexDirection: 'column' }}>
            <Tabs value={tab} onChange={(_, v) => { setTab(v); setWeakOnly(false); }} variant="scrollable" aria-label="Vocabulary sections" sx={{ mb: 1, flexShrink: 0, minHeight: 44 }}>
                <Tab label="Choose lists" /><Tab label="Study" /><Tab label="Practice" /><Tab label="Progress" />
            </Tabs>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {tab === 0 && picker}
            {tab === 1 && (!savedOnce ? needList : loading || <VocabStudyView words={wordsState.words} />)}
            {tab === 2 && (!savedOnce ? needList : loading || <VocabPracticeView key={weakOnly ? 'weak' : 'all'} words={wordsState.words} settings={wordsState.settings} selection={{ all, listIds: selected }} />)}
            {tab === 3 && <VocabProgressView onPracticeWeak={() => { setWeakOnly(true); setTab(2); }} />}
            </Box>
        </Box>
    );
};

export default VocabularyStudentPage;
