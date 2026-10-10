import { useCallback, useEffect, useState } from 'react';
import { Chip, Paper, Stack, Typography } from '@mui/material';
import api from '../../../config/api';

// Floating queue of students who raised their hand, oldest first. Closing a chip means the teacher said the word.
const RaisedHandsPopup = ({ classId }) => {
    const [hands, setHands] = useState([]);

    const load = useCallback(async () => {
        if (!classId) return;
        try {
            const response = await api.get('/spelling/sessions/hands', { params: { classId } });
            setHands(response.data.data || []);
        } catch {
            // Keep the last known queue; the next poll retries.
        }
    }, [classId]);

    useEffect(() => {
        setHands([]);
        if (!classId) return undefined;
        load();
        const poll = () => { if (document.visibilityState === 'visible') load(); };
        const intervalId = window.setInterval(poll, 5000);
        return () => window.clearInterval(intervalId);
    }, [classId, load]);

    const lower = async (hand) => {
        setHands((current) => current.filter((entry) => entry.sessionId !== hand.sessionId));
        try {
            await api.post(`/spelling/sessions/${hand.sessionId}/lower-hand`);
        } catch {
            load();
        }
    };

    if (!hands.length) return null;

    return (
        <Paper
            elevation={8}
            role="status"
            aria-live="polite"
            sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1400, p: 2, maxWidth: 340 }}
        >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>✋ Raised hands — say the word, then close the chip</Typography>
            <Stack spacing={1} alignItems="flex-start">
                {hands.map((hand, index) => (
                    <Chip
                        key={hand.sessionId}
                        color="warning"
                        label={`${index + 1}. ${hand.name || 'Student'}${hand.word ? ` — ${hand.word}` : ''}`}
                        onDelete={() => lower(hand)}
                    />
                ))}
            </Stack>
        </Paper>
    );
};

export default RaisedHandsPopup;
