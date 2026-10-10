import { useEffect, useState } from 'react';
import { Alert, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import api from '../../../config/api';

const AudioCheck = () => {
    const [state, setState] = useState({ running: false, checked: 0, total: 0, broken: [], done: false, error: '' });
    const run = async () => {
        let offset = 0; let broken = [];
        setState({ running: true, checked: 0, total: 0, broken: [], done: false, error: '' });
        try {
            for (;;) {
                const { data } = await api.post('/vocabulary/audio-check', { offset });
                const batch = data.data;
                broken = broken.concat(batch.broken);
                setState({ running: true, checked: batch.checked + offset, total: batch.total, broken, done: false, error: '' });
                if (batch.nextOffset == null) break;
                offset = batch.nextOffset;
            }
            setState((s) => ({ ...s, running: false, done: true }));
        } catch (e) {
            setState((s) => ({ ...s, running: false, error: e.response?.data?.message || 'The check stopped. Try again.' }));
        }
    };
    return (
        <Stack spacing={1}>
            <Typography variant="h6" component="h2">Check audio links</Typography>
            <Typography variant="caption" color="text.secondary">Tests the recording links in small batches and lists the ones that do not work.</Typography>
            <Button variant="outlined" onClick={run} disabled={state.running} sx={{ alignSelf: 'flex-start' }}>{state.running ? 'Checking...' : 'Check audio links'}</Button>
            {state.error && <Alert severity="error">{state.error}</Alert>}
            {(state.running || state.done) && <Typography aria-live="polite">Checked {state.checked} of {state.total}. Broken: {state.broken.length}</Typography>}
            {state.done && state.broken.length === 0 && <Alert severity="success">All audio links work.</Alert>}
            {state.broken.map((b, i) => <Typography key={i} variant="body2" sx={{ wordBreak: 'break-all' }}>{JSON.stringify(b)}</Typography>)}
        </Stack>
    );
};

const VocabSettingsTab = () => {
    const [settings, setSettings] = useState(null);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        api.get('/vocabulary/settings').then(({ data }) => setSettings(data.data))
            .catch((error) => setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to load settings.' }));
    }, []);

    if (!settings) return message ? <Alert severity={message.severity}>{message.text}</Alert> : null;

    const save = async () => {
        try {
            const { data } = await api.patch('/vocabulary/settings', {
                enabled: settings.enabled,
                masteryThreshold: Number(settings.masteryThreshold),
                inactivityDays: Number(settings.inactivityDays),
                showDictionaryText: settings.showDictionaryText
            });
            setSettings(data.data);
            setMessage({ severity: 'success', text: 'Settings saved.' });
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to save settings.' });
        }
    };

    return (
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
            {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
            <FormControlLabel
                control={<Switch checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />}
                label="Vocabulary Practice is available to students"
            />
            <Typography variant="caption" color="text.secondary">While off, students see nothing; you can still prepare lists and words.</Typography>
            <TextField type="number" label="Correct answers in a row to master a word" value={settings.masteryThreshold} onChange={(event) => setSettings({ ...settings, masteryThreshold: event.target.value })} inputProps={{ min: 1, max: 10 }} />
            <TextField type="number" label="Days of inactivity before a word needs review" value={settings.inactivityDays} onChange={(event) => setSettings({ ...settings, inactivityDays: event.target.value })} inputProps={{ min: 1, max: 365 }} />
            <FormControlLabel
                control={<Switch checked={settings.showDictionaryText} onChange={(event) => setSettings({ ...settings, showDictionaryText: event.target.checked })} />}
                label="Show dictionary definition text to students"
            />
            <Button variant="contained" onClick={save} sx={{ alignSelf: 'flex-start' }}>Save settings</Button>
            <AudioCheck />
        </Stack>
    );
};

export default VocabSettingsTab;
