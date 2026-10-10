import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, FormControlLabel, Stack, Tab, Tabs, Typography } from '@mui/material';
import api from '../../config/api';
import VocabStudyView from './components/VocabStudyView';
import VocabPracticeView from './components/VocabPracticeView';
import VocabProgressView from './components/VocabProgressView';
import './VocabularyStudentPage.css';

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
        <div className="vsp__picker">
            <Typography component="h2" className="vsp__intro">Which lists do you want to practise?</Typography>
            <div className={`vsp__all${all ? ' vsp__all--on' : ''}`}>
                <FormControlLabel
                    control={<Checkbox checked={all} onChange={(event) => { setSaved(false); setAll(event.target.checked); if (event.target.checked) setSelected([]); }} />}
                    label={<strong>All my lists</strong>}
                />
                <span className="vsp__list-meta">{total} words</span>
            </div>
            <div className="vsp__lists">
                {lists.map((list) => {
                    const on = all || selected.includes(list.listId);
                    return (
                        <Card key={list.listId} variant="outlined" className={`vsp__list${on ? ' vsp__list--on' : ''}`}>
                            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                                <FormControlLabel
                                    className="vsp__list-label"
                                    control={<Checkbox checked={on} disabled={all} onChange={() => toggle(list.listId)} />}
                                    label={(
                                        <>
                                            <span className="vsp__list-title">{list.title}</span>
                                            <span className="vsp__list-meta">Semester {list.semester} · {list.wordCount} words</span>
                                        </>
                                    )}
                                />
                                {list.lessonTitle && <span className="vsp__list-lesson">{list.lessonTitle}</span>}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
            <div className="vsp__savebar">
                {saved && <Alert severity="success" sx={{ mb: 1 }} role="status">Saved! Open Study or Practice to begin.</Alert>}
                <Button fullWidth variant="contained" className="vsp__save" onClick={save} disabled={!all && selected.length === 0}>Save my choice</Button>
            </div>
        </div>
    );
    const needList = <Alert severity="info">Choose and save your lists first.</Alert>;
    const loading = wordsState.loading ? <CircularProgress aria-label="Loading" /> : null;

    return (
        <div className="vsp">
            <Tabs value={tab} onChange={(_, v) => { setTab(v); setWeakOnly(false); }} variant="scrollable" scrollButtons={false} aria-label="Vocabulary sections" className="vsp__tabs">
                <Tab label="Choose lists" /><Tab label="Study" /><Tab label="Practice" /><Tab label="Progress" />
            </Tabs>
            <div className="vsp__body">
            {tab === 0 && picker}
            {tab === 1 && (!savedOnce ? needList : loading || <VocabStudyView words={wordsState.words} />)}
            {tab === 2 && (!savedOnce ? needList : loading || <VocabPracticeView key={weakOnly ? 'weak' : 'all'} words={wordsState.words} settings={wordsState.settings} selection={{ all, listIds: selected }} />)}
            {tab === 3 && <VocabProgressView onPracticeWeak={() => { setWeakOnly(true); setTab(2); }} />}
            </div>
        </div>
    );
};

export default VocabularyStudentPage;
