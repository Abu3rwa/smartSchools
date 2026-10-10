import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, FormControlLabel, Stack, Typography } from '@mui/material';
import api from '../../config/api';

const VocabularyStudentPage = () => {
    const [state, setState] = useState({ loading: true, error: '', data: null });
    const [selected, setSelected] = useState([]);
    const [all, setAll] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.get('/vocabulary/student/overview').then(({ data }) => {
            setState({ loading: false, error: '', data: data.data });
            setSelected(data.data.selection?.listIds || []);
            setAll(Boolean(data.data.selection?.all));
        }).catch((error) => setState({ loading: false, error: error.response?.data?.message || 'Unable to load vocabulary.', data: null }));
    }, []);

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

    return (
        <Box sx={{ p: { xs: 1, md: 3 }, maxWidth: 720 }}>
            <Typography variant="h4" component="h1" gutterBottom>Vocabulary Practice</Typography>
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
            {saved && <Alert severity="success" sx={{ mt: 2 }}>Saved. Practice activities are coming soon.</Alert>}
        </Box>
    );
};

export default VocabularyStudentPage;
