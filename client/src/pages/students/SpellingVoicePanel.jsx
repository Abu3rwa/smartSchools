import { Box, Button, Stack, Typography } from '@mui/material';
import { HiOutlineSpeakerWave } from 'react-icons/hi2';
import { DEFAULT_VOICE_ID, DICTIONARY_LABELS } from '../../utils/voicePlayback';

const ACCENTS = [['us', 'US'], ['uk', 'UK']];

// Rendered only when the word has custom audio (grade flag ON). One section per dictionary.
const SpellingVoicePanel = ({ audio, selectedVoice, disabled, onSelectVoice, onPlayExample }) => {
    const dictionaries = Object.entries(audio?.dictionaries || {});
    if (dictionaries.length === 0) return null;

    return (
        <Stack spacing={1.5} role="group" aria-label="Voice" sx={{ width: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle2" component="span">Voice</Typography>
                <Button
                    size="small"
                    variant={selectedVoice === DEFAULT_VOICE_ID ? 'contained' : 'outlined'}
                    aria-pressed={selectedVoice === DEFAULT_VOICE_ID}
                    onClick={() => onSelectVoice(DEFAULT_VOICE_ID)}
                    disabled={disabled}
                    sx={{ minHeight: 40 }}
                >
                    Default
                </Button>
            </Stack>
            {dictionaries.map(([dictionary, section]) => (
                <Box key={dictionary} component="section" aria-label={DICTIONARY_LABELS[dictionary] || dictionary}>
                    <Typography variant="caption" color="text.secondary">{DICTIONARY_LABELS[dictionary] || dictionary}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        {ACCENTS.filter(([accent]) => section[accent]).map(([accent, label]) => {
                            const id = `${dictionary}-${accent}`;
                            return (
                                <Button
                                    key={id}
                                    size="small"
                                    variant={selectedVoice === id ? 'contained' : 'outlined'}
                                    aria-pressed={selectedVoice === id}
                                    aria-label={`${DICTIONARY_LABELS[dictionary]} ${label} voice`}
                                    startIcon={<HiOutlineSpeakerWave />}
                                    onClick={() => onSelectVoice(id)}
                                    disabled={disabled}
                                    sx={{ minHeight: 40 }}
                                >
                                    {label}
                                </Button>
                            );
                        })}
                        {(section.examples || []).map((url, index) => (
                            <Button
                                key={url}
                                size="small"
                                variant="text"
                                aria-label={`${DICTIONARY_LABELS[dictionary]} example sentence ${index + 1}`}
                                startIcon={<HiOutlineSpeakerWave />}
                                onClick={() => onPlayExample(url)}
                                disabled={disabled}
                                sx={{ minHeight: 40 }}
                            >
                                {`Example ${index + 1}`}
                            </Button>
                        ))}
                    </Stack>
                </Box>
            ))}
        </Stack>
    );
};

export default SpellingVoicePanel;
