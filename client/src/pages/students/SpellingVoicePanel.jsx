import { useId, useMemo, useState } from 'react';
import { Box, Button, Collapse, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from '@mui/material';
import { HiOutlineSpeakerWave, HiOutlineChevronDown, HiOutlineCheck } from 'react-icons/hi2';
import { DEFAULT_VOICE_ID, getSpellingVoiceOptions } from '../../utils/voicePlayback';

const TARGET = { minHeight: 44 }; // comfortable touch target

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
    const [open, setOpen] = useState(true);
    const panelId = useId();
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const dictionaries = useMemo(() => Object.entries(audio?.dictionaries || {}), [audio]);
    const voices = useMemo(() => {
        const options = getSpellingVoiceOptions(audio);
        const aiAccents = new Set(Object.keys(audio?.ai || {}));
        // Once a generated clip exists for an accent, its dictionary recordings are not offered any more.
        return aiAccents.size === 0
            ? options
            : options.filter((option) => option.dictionary === 'ai' || !aiAccents.has(option.accent));
    }, [audio]);
    const exampleSets = useMemo(
        () => dictionaries
            .map(([, section]) => section.examples || [])
            .filter((examples) => examples.length > 0),
        [dictionaries]
    );

    const activeVoice = useMemo(
        () => (voices.some((option) => option.id === selectedVoice) ? selectedVoice : DEFAULT_VOICE_ID),
        [selectedVoice, voices]
    );
    const activeLabel = useMemo(
        () => voices.find((option) => option.id === activeVoice)?.label || 'Default',
        [activeVoice, voices]
    );

    if (voices.length === 0 && exampleSets.length === 0) return null;

    // Clicking the active voice again passes null: replay the current voice.
    const handleChange = (_event, value) => onSelectVoice(value || activeVoice);

    return (
        <Box
            role="group"
            aria-label="Voice settings"
            sx={{
                width: '100%',
                border: 1,
                borderColor: 'primary.light',
                borderRadius: 2,
                bgcolor: 'background.paper',
                boxShadow: '0 5px 18px rgba(15, 23, 42, 0.08)',
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
                <Stack spacing={2.5} sx={{ p: 2, borderTop: 1, borderColor: 'primary.light', background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.045), rgba(124, 58, 237, 0.045))' }}>
                    <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={activeVoice}
                        onChange={handleChange}
                        disabled={disabled}
                        aria-label="Choose a voice"
                        sx={{ gap: 1, flexWrap: 'wrap', ...GROUP_ITEM_SX }}
                    >
                        <VoiceOption id={DEFAULT_VOICE_ID} label="Default" selected={activeVoice === DEFAULT_VOICE_ID} />
                        {voices.map((option) => (
                            <VoiceOption
                                key={option.id}
                                id={option.id}
                                label={option.label}
                                ariaLabel={`${option.label} voice`}
                                selected={activeVoice === option.id}
                                withIcon
                            />
                        ))}
                    </ToggleButtonGroup>

                    {exampleSets.map((examples, index) => {
                        const setLabel = `Set ${index + 1}`;
                        return (
                            <Stack key={setLabel} component="section" aria-label={`${setLabel} examples`} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                                <Typography variant="subtitle2" sx={{ color: 'primary.dark', fontWeight: 700 }}>{setLabel}</Typography>
                                <Typography variant="caption" color="text.secondary">Hear it in a sentence</Typography>
                                {examples.map((url, exampleIndex) => (
                                    <Button
                                        key={url}
                                        size="small"
                                        variant="contained"
                                        aria-label={`${setLabel} example sentence ${exampleIndex + 1}`}
                                        startIcon={<HiOutlineSpeakerWave />}
                                        onClick={() => onPlayExample(url)}
                                        disabled={disabled}
                                        sx={{ ...TARGET, textTransform: 'none', fontWeight: 700, boxShadow: 'none', bgcolor: 'secondary.main', '&:hover': { bgcolor: 'secondary.dark', boxShadow: 'none' } }}
                                    >
                                        {`Example ${exampleIndex + 1}`}
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
                color: 'primary.contrastText',
                bgcolor: 'primary.main',
                borderColor: 'primary.main'
            },
            '&.Mui-selected:hover': { bgcolor: 'primary.dark' }
        }}
        {...rest}
    >
        {selected ? <HiOutlineCheck aria-hidden="true" /> : withIcon ? <HiOutlineSpeakerWave aria-hidden="true" /> : null}
        {label}
    </ToggleButton>
);

export default SpellingVoicePanel;