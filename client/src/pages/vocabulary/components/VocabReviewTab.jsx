import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import api from '../../../config/api';

const VocabReviewTab = () => {
    const [mode, setMode] = useState('pending');
    const [items, setItems] = useState([]);
    const [comments, setComments] = useState({});
    const [message, setMessage] = useState(null);

    const load = useCallback(() => {
        api.get(`/vocabulary/reviews?status=${mode}`).then(({ data }) => setItems(data.data))
            .catch((e) => setMessage({ severity: 'error', text: e.response?.data?.message || 'Unable to load sentences.' }));
    }, [mode]);
    useEffect(() => { load(); }, [load]);

    const review = async (item, status) => {
        try {
            await api.patch(`/vocabulary/reviews/${item.id}`, { status, comment: comments[item.id] || '' });
            setItems((current) => current.filter((entry) => entry.id !== item.id));
        } catch (e) {
            setMessage({ severity: 'error', text: e.response?.data?.message || 'Unable to save your review.' });
        }
    };

    return (
        <Stack spacing={2} sx={{ maxWidth: 720 }}>
            <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} aria-label="Sentence filter">
                <ToggleButton value="pending">Waiting for review</ToggleButton>
                <ToggleButton value="reviewed">Reviewed</ToggleButton>
            </ToggleButtonGroup>
            {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
            {items.length === 0 && <Typography>{mode === 'pending' ? 'No sentences are waiting.' : 'Nothing reviewed yet.'}</Typography>}
            {items.map((item) => (
                <Card key={item.id} variant="outlined"><CardContent>
                    <Typography variant="subtitle2">{item.student} · {item.word} ({item.listId})</Typography>
                    <Typography sx={{ my: 1 }} dir="auto">{item.sentence}</Typography>
                    {mode === 'pending' ? (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField size="small" fullWidth label="Comment (optional)" value={comments[item.id] || ''} onChange={(e) => setComments({ ...comments, [item.id]: e.target.value })} inputProps={{ maxLength: 500 }} />
                            <Button variant="contained" color="success" onClick={() => review(item, 'accepted')}>Accept</Button>
                            <Button variant="outlined" color="warning" onClick={() => review(item, 'needs_work')}>Needs work</Button>
                        </Stack>
                    ) : <Typography variant="body2">{item.status === 'accepted' ? 'Accepted' : 'Needs work'}{item.teacherComment ? ` — ${item.teacherComment}` : ''}</Typography>}
                </CardContent></Card>
            ))}
        </Stack>
    );
};

export default VocabReviewTab;
