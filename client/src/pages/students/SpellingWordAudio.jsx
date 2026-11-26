import { Box, Button, CircularProgress } from '@mui/material';
import { HiOutlineSpeakerWave } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { accentPlaybackKey } from '../../utils/voicePlayback';

// Both accents sit next to the word so a student can hear the difference
// between spellings such as "stationery" and "stationary".
const ACCENTS = [
    { key: 'us', label: 'US', ariaKey: 'playUsAria' },
    { key: 'uk', label: 'UK', ariaKey: 'playUkAria' }
];

const SpellingWordAudio = ({ word, audio = null, disabled = false, playingKey = null, onPlay }) => {
    const { t } = useTranslation('spelling');
    if (!String(word || '').trim()) return null;

    return (
        <Box component="span" dir="ltr" sx={{ display: 'inline-flex', gap: 0.5, flexShrink: 0 }}>
            {ACCENTS.map((accent) => {
                const playing = playingKey === accentPlaybackKey(word, accent.key);
                return (
                    <Button
                        key={accent.key}
                        type="button"
                        size="small"
                        variant="outlined"
                        color="inherit"
                        disabled={disabled}
                        onClick={() => onPlay(word, accent.key, audio)}
                        aria-label={t(accent.ariaKey, { word })}
                        title={t(accent.ariaKey, { word })}
                        startIcon={playing ? <CircularProgress size={12} color="inherit" /> : <HiOutlineSpeakerWave />}
                        sx={{
                            minWidth: 0,
                            minHeight: 30,
                            px: 0.75,
                            py: 0.25,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            lineHeight: 1.1,
                            '& .MuiButton-startIcon': { mr: 0.4, ml: 0 }
                        }}
                    >
                        {accent.label}
                    </Button>
                );
            })}
        </Box>
    );
};

export default SpellingWordAudio;
