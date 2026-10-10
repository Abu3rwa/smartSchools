import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Radio, RadioGroup, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import api from '../../../config/api';
import { createQueue, currentItem, isDone, recordResult } from '../../../utils/vocabSession';
import { BaseWordNotice, WordAudioControls, useWordAudio } from './VocabStudyView';

const POS_CHOICES = ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron'];

const TYPES = [
    { id: 'spelling', label: 'Spelling', help: 'Listen, then type the word.' },
    { id: 'match', label: 'Match', help: 'Match the word to its sound or its meaning.' },
    { id: 'fill', label: 'Fill in the blank', help: 'Complete the example sentence.' },
    { id: 'pos', label: 'Part of speech', help: 'Is the word a noun, verb, adjective...?' },
    { id: 'use_it', label: 'Use it', help: 'Write your own sentence. Your teacher reads it.' },
    { id: 'mcq', label: 'Multiple choice', help: 'Questions from your teacher.' }
];

const blankOut = (sentence, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    return pattern.test(sentence) ? sentence.replace(pattern, '_____') : null;
};

const eligible = (type, words) => {
    if (type === 'fill') return words.filter((w) => w.exampleSentence && blankOut(w.exampleSentence, w.word));
    if (type === 'pos') return words.filter((w) => (w.partOfSpeech || []).length === 1 && w.exampleSentence);
    return words;
};

const Feedback = ({ result }) => (
    <Box aria-live="polite" role="status">
        {result && (result.status === 'pending'
            ? <Alert severity="info">Sent! Your teacher will read your sentence. This does not change your score.</Alert>
            : (
                <Alert severity={result.correct ? 'success' : result.nearMiss ? 'warning' : 'error'} sx={{ textAlign: 'left', py: 0 }}>
                    <strong>{result.correct ? 'Correct!' : 'Not quite.'}</strong>
                    {result.message && <> {result.message}</>}
                    {!result.correct && result.correctAnswer && <> The answer is <strong>{result.correctAnswer}</strong>.</>}
                    {result.meaning && <Typography variant="body2">Meaning: {result.meaning}</Typography>}
                    {result.explanation && <Typography variant="body2">{result.explanation}</Typography>}
                </Alert>
            ))}
    </Box>
);

const Question = ({ type, item, pool, onSubmit, result, onNext }) => {
    const word = item.word;
    const audioState = useWordAudio(word || { audio: {}, word: '' });
    const [text, setText] = useState('');
    const [choice, setChoice] = useState('');
    const inputRef = useRef(null);
    const start = useRef(Date.now());
    const reverse = useMemo(() => type === 'match' && Boolean(word?.meaning) && Math.random() < 0.5, [type, word]);
    const options = useMemo(() => {
        if (type !== 'match') return [];
        const others = pool.filter((w) => w.id !== word.id).sort(() => Math.random() - 0.5).slice(0, 3);
        return [...others, word].sort(() => Math.random() - 0.5);
    }, [type, pool, word]);

    useEffect(() => { inputRef.current?.focus(); }, []);
    const submit = () => {
        const timeMs = Date.now() - start.current;
        if (type === 'match') return onSubmit({ chosenWordId: choice, timeMs });
        if (type === 'pos' || type === 'mcq') return onSubmit({ answer: choice, timeMs });
        return onSubmit({ answer: text, timeMs });
    };
    const answered = Boolean(result);
    const canSubmit = !answered && (type === 'match' || type === 'pos' || type === 'mcq' ? Boolean(choice) : text.trim().length > 0);

    return (
        <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <CardContent sx={{ flex: 1, minHeight: 0, overflow: 'auto', textAlign: 'center' }}>
            {type === 'mcq' && <Typography variant="h6" component="h2">{item.question}</Typography>}
            {type === 'spelling' && (<>
                <Typography variant="h6" component="h2">Listen and spell the word</Typography>
                <BaseWordNotice word={word} />
                <WordAudioControls word={word} audioState={audioState} />
                {word.meaning && <Typography variant="body2" sx={{ mt: 1 }}>Meaning: {word.meaning}</Typography>}
            </>)}
            {type === 'match' && (reverse
                ? <Typography variant="h6" component="h2">Which word means: {word.meaning}</Typography>
                : (<><Typography variant="h6" component="h2">Listen. Which word do you hear?</Typography><BaseWordNotice word={word} /><WordAudioControls word={word} audioState={audioState} /></>))}
            {type === 'fill' && (<>
                <Typography variant="h6" component="h2">Fill in the blank</Typography>
                <Typography sx={{ my: 1 }}>{blankOut(word.exampleSentence, word.word)}</Typography>
                {word.meaning && <Typography variant="body2">Meaning: {word.meaning}</Typography>}
            </>)}
            {type === 'pos' && (<>
                <Typography variant="h6" component="h2">What part of speech is “{word.word}” here?</Typography>
                <Typography sx={{ my: 1 }}><em>{word.exampleSentence}</em></Typography>
            </>)}
            {type === 'use_it' && (<>
                <Typography variant="h6" component="h2">Write a sentence using “{word.word}”</Typography>
                {word.meaning && <Typography variant="body2">Meaning: {word.meaning}</Typography>}
            </>)}

            <Box sx={{ mt: 2 }}>
                {['spelling', 'fill', 'use_it'].includes(type) && (
                    <TextField inputRef={inputRef} fullWidth multiline={type === 'use_it'} minRows={type === 'use_it' ? 2 : 1}
                        label={type === 'use_it' ? 'Your sentence' : 'Your answer'} value={text} disabled={answered}
                        onChange={(e) => setText(e.target.value)} inputProps={{ maxLength: 500, autoComplete: 'off', spellCheck: false }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && type !== 'use_it' && canSubmit) submit(); }} />
                )}
                {type === 'match' && (
                    <RadioGroup sx={{ alignItems: 'flex-start', display: 'inline-flex' }} aria-label="Choose a word" value={choice} onChange={(e) => setChoice(e.target.value)}>
                        {options.map((o) => <FormControlLabel key={o.id} value={o.id} disabled={answered} control={<Radio />} label={reverse ? o.word : o.word} />)}
                    </RadioGroup>
                )}
                {type === 'pos' && (
                    <RadioGroup row sx={{ justifyContent: 'center' }} aria-label="Choose a part of speech" value={choice} onChange={(e) => setChoice(e.target.value)}>
                        {POS_CHOICES.map((p) => <FormControlLabel key={p} value={p} disabled={answered} control={<Radio />} label={p} />)}
                    </RadioGroup>
                )}
                {type === 'mcq' && (
                    <RadioGroup sx={{ alignItems: 'flex-start', display: 'inline-flex' }} aria-label="Choose an answer" value={choice} onChange={(e) => setChoice(e.target.value)}>
                        {item.options.map((o) => <FormControlLabel key={o.key} value={o.key} disabled={answered} control={<Radio />} label={o.text} />)}
                    </RadioGroup>
                )}
            </Box>
        </CardContent>
        <Box sx={{ flexShrink: 0, p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Feedback result={result} />
            <Button fullWidth size="large" variant="contained" onClick={answered ? onNext : submit} disabled={!answered && !canSubmit} autoFocus={answered} sx={{ minHeight: 52, borderRadius: 3, mt: result ? 1 : 0 }}>{answered ? 'Next' : 'Check'}</Button>
        </Box>
        </Card>
    );
};

const VocabPracticeView = ({ words, settings, selection, onFinished }) => {
    const [type, setType] = useState(null);
    const [queue, setQueue] = useState(null);
    const [mcq, setMcq] = useState([]);
    const [mcqIndex, setMcqIndex] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ total: 0, correct: 0 });
    const sessionId = useRef('');

    const begin = async (nextType) => {
        setError(''); setResult(null); setStats({ total: 0, correct: 0 });
        sessionId.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        if (nextType === 'mcq') {
            setLoading(true);
            try {
                const params = selection.all ? 'all=true' : `listIds=${selection.listIds.join(',')}`;
                const { data } = await api.get(`/vocabulary/student/mcq?${params}`);
                setMcq(data.data); setMcqIndex(0);
            } catch (e) { setError(e.response?.data?.message || 'Unable to load questions.'); setLoading(false); return; }
            setLoading(false);
        } else {
            const usable = eligible(nextType, words).sort(() => Math.random() - 0.5);
            setQueue(createQueue(usable, nextType === 'use_it' ? 1 : settings.masteryThreshold));
        }
        setType(nextType);
    };

    const item = type === 'mcq' ? mcq[mcqIndex] : queue && currentItem(queue);
    const finished = type && (type === 'mcq' ? mcqIndex >= mcq.length : queue && isDone(queue));

    const submit = async (body) => {
        setError('');
        try {
            const payload = { type, sessionId: sessionId.current, ...body };
            if (type === 'mcq') payload.questionId = item.questionId; else payload.wordId = item.word.id;
            const { data } = await api.post('/vocabulary/student/answer', payload);
            setResult(data.data);
            setStats((s) => ({ total: s.total + 1, correct: s.correct + (data.data.correct ? 1 : 0) }));
        } catch (e) { setError(e.response?.data?.message || 'Could not save your answer. Please try again.'); }
    };

    const next = () => {
        if (type === 'mcq') setMcqIndex((i) => i + 1);
        else setQueue((q) => recordResult(q, result.correct !== false));
        setResult(null);
    };

    if (loading) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress aria-label="Loading" /></Box>;

    if (!type) {
        return (
            <Stack spacing={1}>
                <Typography>Pick an activity.</Typography>
                {TYPES.map((t) => {
                    const count = t.id === 'mcq' ? null : eligible(t.id, words).length;
                    return (
                        <Card key={t.id} variant="outlined"><CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                <Box><Typography variant="subtitle1">{t.label}</Typography><Typography variant="caption" color="text.secondary">{t.help}</Typography></Box>
                                <Button variant="contained" disabled={count === 0} onClick={() => begin(t.id)}>Start</Button>
                            </Stack>
                        </CardContent></Card>
                    );
                })}
                {error && <Alert severity="error">{error}</Alert>}
            </Stack>
        );
    }

    if (finished || !item) {
        return (
            <Stack spacing={2}>
                <Alert severity="success" role="status">{type === 'mcq' && !mcq.length ? 'No questions yet for your lists.' : `Well done! You answered ${stats.total} question${stats.total === 1 ? '' : 's'} and got ${stats.correct} right.`}</Alert>
                <Stack direction="row" spacing={1}>
                    <Button variant="contained" onClick={() => { setType(null); onFinished?.(); }}>Choose another activity</Button>
                </Stack>
            </Stack>
        );
    }

    return (
        <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                <Chip label={TYPES.find((t) => t.id === type).label} />
                <Typography variant="caption">{type === 'mcq' ? `Question ${mcqIndex + 1} of ${mcq.length}` : `${queue.items.length} left`}</Typography>
                <Button size="small" onClick={() => { setType(null); setResult(null); }}>Stop</Button>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            <Question key={`${type}-${type === 'mcq' ? item.questionId : item.word.id}-${type === 'mcq' ? mcqIndex : queue.answered}`} type={type} item={item} pool={words} onSubmit={submit} result={result} onNext={next} />
        </Stack>
    );
};

export default VocabPracticeView;
