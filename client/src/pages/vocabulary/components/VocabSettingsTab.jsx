import { useEffect, useState } from 'react';
import { Alert, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import api from '../../../config/api';

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
        </Stack>
    );
};

export default VocabSettingsTab;
