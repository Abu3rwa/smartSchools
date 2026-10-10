import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Link, Stack, Typography } from '@mui/material';
import SpellingVoicePanel from '../../students/SpellingVoicePanel';
import { playChain, planAudio, speakText, baseWordNotice, needsBaseWordNotice } from '../../../utils/vocabAudio';
import { DICTIONARY_LABELS, readStoredVoice, storeVoice } from '../../../utils/voicePlayback';

// Plays a word's recording (with fallbacks) and exposes the voice picker.
export const useWordAudio = (word) => {
    const [voice, setVoice] = useState(() => readStoredVoice());
    const [notice, setNotice] = useState('');
    const playing = useRef(null);

    useEffect(() => () => playing.current?.cancel(), []);

    const play = (voiceId = voice) => {
        playing.current?.cancel();
        setNotice('');
        playing.current = playChain({
            urls: planAudio(word.audio, voiceId),
            text: word.word,
            onFallback: (kind) => setNotice(kind === 'tts' ? 'No recording is available, so the computer voice is reading this word.' : 'Playing another recording of this word.')
        });
    };
    const playExample = (url) => {
        playing.current?.cancel();
        playing.current = playChain({ urls: url ? [url] : [], text: word.exampleSentence, onFallback: () => setNotice('Reading the example with the computer voice.') });
    };
    const chooseVoice = (id) => { setVoice(id); storeVoice(id); play(id); };
    return { voice, chooseVoice, play, playExample, notice };
};

export const BaseWordNotice = ({ word }) => (needsBaseWordNotice(word)
    ? <Alert severity="info" role="note" sx={{ my: 1 }}>{baseWordNotice(word)}</Alert>
    : null);

export const WordAudioControls = ({ word, audioState, showPlayButton = true }) => (
    <Stack spacing={1}>
        {showPlayButton && <Button variant="outlined" onClick={() => audioState.play()} sx={{ alignSelf: 'flex-start' }}>Listen to the word</Button>}
        <SpellingVoicePanel audio={word.audio} selectedVoice={audioState.voice} onSelectVoice={audioState.chooseVoice} onPlayExample={audioState.playExample} />
        <Box aria-live="polite">{audioState.notice && <Typography variant="caption" color="text.secondary">{audioState.notice}</Typography>}</Box>
    </Stack>
);

const StudyCard = ({ word }) => {
    const audioState = useWordAudio(word);
    const [showMore, setShowMore] = useState(false);
    const hasExampleAudio = useMemo(() => Object.values(word.audio?.dictionaries || {}).some((entry) => entry.examples?.length), [word]);
    return (
        <Card variant="outlined">
            <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="h5" component="h2">{word.word}</Typography>
                    <Chip size="small" label={(word.partOfSpeech || []).join(' / ')} />
                    <Chip size="small" variant="outlined" label={word.mastery.state.replace('_', ' ')} />
                </Stack>
                <BaseWordNotice word={word} />
                <WordAudioControls word={word} audioState={audioState} />
                {word.meaning && <Typography sx={{ mt: 1 }}><strong>Meaning:</strong> {word.meaning}</Typography>}
                {word.arabicMeaning && <Typography dir="auto" sx={{ mt: 0.5 }}>{word.arabicMeaning}</Typography>}
                {word.exampleSentence && (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                        <Typography><em>{word.exampleSentence}</em></Typography>
                        {!hasExampleAudio && <Button size="small" onClick={() => speakText(word.exampleSentence)} aria-label="Read the example aloud">Read aloud</Button>}
                    </Stack>
                )}
                {word.sources?.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                        <Button size="small" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>{showMore ? 'Hide more meanings' : 'More meanings'}</Button>
                        {showMore && word.sources.map((source) => (
                            <Box key={source.source} sx={{ mt: 0.5 }}>
                                <Typography variant="subtitle2">{DICTIONARY_LABELS[source.source] || source.source}</Typography>
                                {source.definitionText && <Typography variant="body2">{source.definitionText}</Typography>}
                                {source.pageUrl && <Link href={source.pageUrl} target="_blank" rel="noopener noreferrer" variant="body2">Open the dictionary page</Link>}
                            </Box>
                        ))}
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};

const VocabStudyView = ({ words }) => {
    const [index, setIndex] = useState(0);
    if (!words.length) return <Alert severity="info">Choose at least one list first.</Alert>;
    const word = words[Math.min(index, words.length - 1)];
    return (
        <Stack spacing={2}>
            <StudyCard key={word.id} word={word} />
            <Stack direction="row" spacing={1} alignItems="center">
                <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
                <Typography aria-live="polite">{index + 1} of {words.length}</Typography>
                <Button disabled={index >= words.length - 1} onClick={() => setIndex(index + 1)}>Next</Button>
            </Stack>
        </Stack>
    );
};

export default VocabStudyView;
