import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material';
import api from '../../../config/api';

const STATUS_TEXT = { pending: 'Waiting for your teacher', accepted: 'Teacher says: good job', needs_work: 'Teacher says: needs work' };

const VocabProgressView = ({ onPracticeWeak }) => {
    const [state, setState] = useState({ loading: true, error: '', data: null });
    useEffect(() => {
        api.get('/vocabulary/student/progress').then(({ data }) => setState({ loading: false, error: '', data: data.data }))
            .catch((e) => setState({ loading: false, error: e.response?.data?.message || 'Unable to load your progress.', data: null }));
    }, []);
    if (state.loading) return <CircularProgress aria-label="Loading" />;
    if (state.error) return <Alert severity="error">{state.error}</Alert>;
    const { lists, weakCount, recentSessions, sentences } = state.data;
    return (
        <Stack spacing={2}>
            {lists.map((list) => (
                <Card key={list.listId} variant="outlined"><CardContent>
                    <Typography variant="subtitle1">{list.title}</Typography>
                    <LinearProgress variant="determinate" value={list.total ? (list.mastered / list.total) * 100 : 0} aria-label={`${list.mastered} of ${list.total} mastered`} sx={{ my: 1 }} />
                    <Typography variant="body2">
                        Mastered {list.mastered} · Practising {list.practicing} · Needs review {list.needsReview} · Not started {list.notStarted}
                    </Typography>
                </CardContent></Card>
            ))}
            <Box>
                <Button variant="contained" disabled={weakCount === 0} onClick={onPracticeWeak}>Practise my weak words ({weakCount})</Button>
            </Box>
            <Typography variant="h6" component="h2">Recent practice</Typography>
            {recentSessions.length === 0 && <Typography variant="body2">Nothing yet. Start a practice activity!</Typography>}
            {recentSessions.map((s) => (
                <Typography key={s.sessionId} variant="body2">{new Date(s.date).toLocaleDateString()}: {s.correct} of {s.total} correct</Typography>
            ))}
            {sentences.length > 0 && (<>
                <Typography variant="h6" component="h2">My sentences</Typography>
                {sentences.map((s) => (
                    <Card key={s.id} variant="outlined"><CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                        <Typography variant="subtitle2">{s.word}</Typography>
                        <Typography variant="body2">{s.sentence}</Typography>
                        <Typography variant="caption" color="text.secondary">{STATUS_TEXT[s.status] || s.status}</Typography>
                        {s.teacherComment && <Typography variant="body2" dir="auto">{s.teacherComment}</Typography>}
                    </CardContent></Card>
                ))}
            </>)}
        </Stack>
    );
};

export default VocabProgressView;
