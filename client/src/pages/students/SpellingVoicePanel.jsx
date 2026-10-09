import { useId, useMemo, useState } from 'react';
import { Box, Button, Collapse, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from '@mui/material';
import { HiOutlineSpeakerWave, HiOutlineChevronDown, HiOutlineCheck } from 'react-icons/hi2';
import { DEFAULT_VOICE_ID, DICTIONARY_LABELS } from '../../utils/voicePlayback';

const ACCENTS = [
    ['us', 'US', 'American'],
    ['uk', 'UK', 'British']
];

const TARGET = { minHeight: 44 }; // comfortable touch target

const dictionaryLabel = (dictionary) => DICTIONARY_LABELS[dictionary] || dictionary;

const GROUP_ITEM_SX = { '& .MuiToggleButtonGroup-grouped': { border: 1, borderColor: 'divider', borderRadius: 1.5, m: 0 } };

/**
 * Voice picker, rendered only when the word has custom audio (grade flag ON).
 *
 * Design notes
 * - Collapsed by default: during a test the main "Hear word" button is the hero,
 *   so voice options stay one tap away instead of competing for attention.
 * - The summary row always states which voice is active, so students never have to guess.
 * - Voices are a true single-choice control (ToggleButtonGroup, exclusive), so the
 *   selected state is obvious and can't be deselected into "nothing".
 * - Example sentences are separated from voices: they play audio, they don't change the voice.
 */
const SpellingVoicePanel = ({ audio, selectedVoice, disabled, onSelectVoice, onPlayExample }) => {
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const dictionaries = useMemo(() => Object.entries(audio?.dictionaries || {}), [audio]);

    const activeLabel = useMemo(() => {
        if (selectedVoice === DEFAULT_VOICE_ID) return 'Default';
        for (const [dictionary, section] of dictionaries) {
            for (const [accent, label] of ACCENTS) {
                if (section[accent] && selectedVoice === `${dictionary}-${accent}`) {
                    return `${dictionaryLabel(dictionary)} ${label}`;
                }
            }
        }
        return 'Default';
    }, [dictionaries, selectedVoice]);

    if (dictionaries.length === 0) return null;

    // ToggleButtonGroup passes null when the active button is clicked again; ignore it.
    const handleChange = (_event, value) => {
        if (value) onSelectVoice(value);
    };

    return (
        <Box
            role="group"
            aria-label="Voice settings"
            sx={{
                width: '100%',
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                bgcolor: 'background.paper',
                overflow: 'hidden'
            }}
        >
            <Button
                fullWidth
                color="inherit"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-controls={panelId}
                sx={{
                    ...TARGET,
                    justifyContent: 'space-between',
                    px: 2,
                    py: 1,
                    textTransform: 'none',
                    borderRadius: 0
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <HiOutlineSpeakerWave aria-hidden="true" />
                    <Typography variant="body2" color="text.secondary" component="span">Voice</Typography>
                    <Typography variant="body2" fontWeight={600} component="span" noWrap>{activeLabel}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption" color="text.secondary" component="span">
                        {open ? 'Hide' : 'Change'}
                    </Typography>
                    <HiOutlineChevronDown
                        aria-hidden="true"
                        style={{
                            transform: open ? 'rotate(180deg)' : 'none',
                            transition: reduceMotion ? 'none' : 'transform 150ms ease'
                        }}
                    />
                </Stack>
            </Button>

            <Collapse in={open} timeout={reduceMotion ? 0 : 'auto'} unmountOnExit id={panelId}>
                <Stack spacing={2.5} sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                    <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={selectedVoice}
                        onChange={handleChange}
                        disabled={disabled}
                        aria-label="Choose a voice"
                        sx={{ gap: 1, flexWrap: 'wrap', ...GROUP_ITEM_SX }}
                    >
                        <VoiceOption id={DEFAULT_VOICE_ID} label="Default" selected={selectedVoice === DEFAULT_VOICE_ID} />
                        {dictionaries.flatMap(([dictionary, section]) => ACCENTS
                            .filter(([accent]) => section[accent])
                            .map(([accent, label, full]) => {
                                const id = `${dictionary}-${accent}`;
                                return (
                                    <VoiceOption
                                        key={id}
                                        id={id}
                                        label={`${dictionaryLabel(dictionary)} ${label}`}
                                        ariaLabel={`${dictionaryLabel(dictionary)} ${full} voice`}
                                        selected={selectedVoice === id}
                                        withIcon
                                    />
                                );
                            }))}
                    </ToggleButtonGroup>

                    {dictionaries.map(([dictionary, section]) => {
                        const examples = section.examples || [];
                        if (examples.length === 0) return null;
                        return (
                            <Stack key={dictionary} component="section" aria-label={`${dictionaryLabel(dictionary)} examples`} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="subtitle2">{dictionaryLabel(dictionary)}</Typography>
                                <Typography variant="caption" color="text.secondary">Hear it in a sentence</Typography>
                                {examples.map((url, index) => (
                                    <Button
                                        key={url}
                                        size="small"
                                        variant="text"
                                        aria-label={`${dictionaryLabel(dictionary)} example sentence ${index + 1}`}
                                        startIcon={<HiOutlineSpeakerWave />}
                                        onClick={() => onPlayExample(url)}
                                        disabled={disabled}
                                        sx={{ ...TARGET, textTransform: 'none' }}
                                    >
                                        {`Example ${index + 1}`}
                                    </Button>
                                ))}
                            </Stack>
                        );
                    })}                </Stack>
            </Collapse>
        </Box>
    );
};

// Single selectable voice. Selected state shows a check (not colour alone) plus a tinted fill.
const VoiceOption = ({ id, label, ariaLabel, selected, withIcon = false, ...rest }) => (
    <ToggleButton
        value={id}
        aria-label={ariaLabel || label}
        selected={selected}
        sx={{
            ...TARGET,
            px: 2,
            gap: 0.75,
            textTransform: 'none',
            fontWeight: selected ? 600 : 400,
            '&.Mui-selected': {
                color: 'primary.main',
                bgcolor: 'action.selected',
                borderColor: 'primary.main'
            }
        }}
        {...rest}
    >
        {selected ? <HiOutlineCheck aria-hidden="true" /> : withIcon ? <HiOutlineSpeakerWave aria-hidden="true" /> : null}
        {label}
    </ToggleButton>
);

export default SpellingVoicePanel;