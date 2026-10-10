import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/source-serif-4/wght-italic.css';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/instrument-sans';
import './VocabStudyView.css';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Link, Stack, Typography } from '@mui/material';
import { HiOutlineSpeakerWave, HiOutlineChevronDown, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi2';
import { playChain, planAudio, speakText, baseWordNotice, needsBaseWordNotice } from '../../../utils/vocabAudio';
import { DICTIONARY_LABELS, getVoiceOptions, readStoredVoice, storeVoice } from '../../../utils/voicePlayback';

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

// One compact row: a big Listen button, small voice chips, and example buttons. Nothing to scroll for.
export const WordAudioControls = ({ word, audioState, showPlayButton = true }) => {
    const options = getVoiceOptions(word.audio);
    const examples = Object.entries(word.audio?.dictionaries || {}).flatMap(([dictionary, section]) => (section.examples || []).map((url) => ({ dictionary, url })));
    return (
        <Stack spacing={0.5} alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap>
                {showPlayButton && <Button variant="contained" size="large" startIcon={<HiOutlineSpeakerWave aria-hidden="true" />} onClick={() => audioState.play()} sx={{ minHeight: 48, borderRadius: 3 }}>Listen</Button>}
                {examples.slice(0, 1).map((example) => (
                    <Button key={example.url} variant="outlined" onClick={() => audioState.playExample(example.url)} sx={{ minHeight: 48, borderRadius: 3 }}>Example</Button>
                ))}
            </Stack>
            {options.length > 0 && (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="center" role="group" aria-label="Choose a voice">
                    {options.map((option) => (
                        <Chip key={option.id} label={option.label} clickable color={audioState.voice === option.id ? 'primary' : 'default'}
                            variant={audioState.voice === option.id ? 'filled' : 'outlined'} onClick={() => audioState.chooseVoice(option.id)}
                            aria-pressed={audioState.voice === option.id} sx={{ minHeight: 32 }} />
                    ))}
                </Stack>
            )}
            <Box aria-live="polite" sx={{ minHeight: 18 }}>{audioState.notice && <Typography variant="caption" color="text.secondary">{audioState.notice}</Typography>}</Box>
        </Stack>
    );
};
const STATE_LABELS = { not_started: 'New', practicing: 'Learning', mastered: 'Mastered', needs_review: 'Review again' };

// Wraps the word inside its example sentence in <mark>; falls back to plain text when it is not found.
const HighlightedExample = ({ sentence, word }) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = sentence.split(new RegExp(`(\\b${escaped}\\b)`, 'i'));
    return <>{parts.map((part, i) => (part.toLowerCase() === word.toLowerCase() ? <mark key={i} className="vsv__mark">{part}</mark> : part))}</>;
};

const StudyCard = ({ word }) => {
    const audioState = useWordAudio(word);
    const [showMore, setShowMore] = useState(false);
    const options = getVoiceOptions(word.audio);
    const longMeaning = (word.meaning || '').length > 90;
    return (
        <div className="vsv__card">
            <section className="vsv__left" aria-label="Word">
                <div className="vsv__tags">
                    {word.partOfSpeech?.length > 0 && <span className="vsv__tag">{word.partOfSpeech.join(' / ')}</span>}
                    <span className="vsv__tag vsv__tag--state">{STATE_LABELS[word.mastery.state] || ''}</span>
                </div>
                <h2 className="vsv__word">{word.word}</h2>
                <div className="vsv__actions">
                    <button type="button" className="vsv__btn vsv__btn--primary" onClick={() => audioState.play()}>
                        <HiOutlineSpeakerWave aria-hidden="true" /> Listen
                    </button>
                    {word.exampleSentence && (
                        <button type="button" className="vsv__btn vsv__btn--outline" onClick={() => audioState.playExample(Object.values(word.audio?.dictionaries || {}).flatMap((d) => d.examples || [])[0])}>
                            Example
                        </button>
                    )}
                </div>
                <BaseWordNotice word={word} />
                <div aria-live="polite" className="vsv__notice">{audioState.notice}</div>
            </section>

            <section className="vsv__right" aria-label="Meaning">
                {word.meaning && (<>
                    <p className="vsv__label">Meaning</p>
                    <p className={`vsv__meaning${longMeaning ? ' vsv__meaning--long' : ''}`}>{word.meaning}</p>
                </>)}
                {word.arabicMeaning && <p className="vsv__arabic" dir="auto">{word.arabicMeaning}</p>}
                {word.exampleSentence && <p className="vsv__example"><HighlightedExample sentence={word.exampleSentence} word={word.word} /></p>}
                {word.sources?.length > 0 && (
                    <div>
                        <button type="button" className="vsv__more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
                            {showMore ? 'Hide more meanings' : 'More meanings'} <HiOutlineChevronDown aria-hidden="true" className={showMore ? 'vsv__chev vsv__chev--open' : 'vsv__chev'} />
                        </button>
                        {showMore && (
                            <div className="vsv__sources">
                                {word.sources.map((source) => (
                                    <div key={source.source}>
                                        <strong>{DICTIONARY_LABELS[source.source] || source.source}</strong>
                                        {source.definitionText && <div>{source.definitionText}</div>}
                                        {source.pageUrl && <Link href={source.pageUrl} target="_blank" rel="noopener noreferrer">Open the dictionary page</Link>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {options.length > 0 && (
                    <div className="vsv__voices" role="group" aria-label="Choose a voice">
                        {options.map((option) => (
                            <button key={option.id} type="button" className={`vsv__voice${audioState.voice === option.id ? ' vsv__voice--on' : ''}`}
                                aria-pressed={audioState.voice === option.id} onClick={() => audioState.chooseVoice(option.id)}>
                                <HiOutlineSpeakerWave aria-hidden="true" /> {option.label}
                            </button>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

const VocabStudyView = ({ words, onPosition }) => {
    const [index, setIndex] = useState(0);
    const current = Math.min(index, Math.max(words.length - 1, 0));
    useEffect(() => { onPosition?.(words.length ? { index: current, total: words.length } : null); return () => onPosition?.(null); }, [current, words.length]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!words.length) return <Alert severity="info">Choose at least one list first.</Alert>;
    const word = words[current];
    return (
        <div className="vsv">
            <StudyCard key={word.id} word={word} />
            <div className="vsv__bar">
                <button type="button" className="vsv__nav" disabled={current === 0} onClick={() => setIndex(current - 1)}>
                    <HiOutlineChevronLeft aria-hidden="true" /> Previous
                </button>
                <button type="button" className="vsv__nav vsv__nav--primary" disabled={current >= words.length - 1} onClick={() => setIndex(current + 1)}>
                    Next <HiOutlineChevronRight aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};

export default VocabStudyView;