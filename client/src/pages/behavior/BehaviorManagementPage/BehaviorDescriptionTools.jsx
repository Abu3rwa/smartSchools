import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMicrophone, HiOutlineSparkles } from 'react-icons/hi';
import { behaviorLogApi, behaviorError } from './behaviorLogApi';
import { privateSpeechSupport, insertDictation } from './privateDictation';

export default function BehaviorDescriptionTools({
    text,
    onChange,
    student,
    textarea,
    onOriginal,
    onRecording
}) {
    const { t, i18n } = useTranslation('behaviorConsequences');
    const [language, setLanguage] = useState(
        i18n.language.startsWith('ar') ? 'ar-SA' : 'en-US'
    );
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [transcript, setTranscript] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [suggestion, setSuggestion] = useState(null);
    const recognition = useRef(null);
    const timer = useRef(null);
    const request = useRef(null);
    const revision = useRef(0);
    const latest = useRef(text);
    const alive = useRef(true);
    useEffect(() => {
        latest.current = text;
    }, [text]);
    useEffect(() => {
        alive.current = true;
        const hide = () => {
            if (document.hidden) recognition.current?.abort();
        };
        document.addEventListener('visibilitychange', hide);
        return () => {
            alive.current = false;
            recognition.current?.abort();
            clearInterval(timer.current);
            request.current?.abort();
            document.removeEventListener('visibilitychange', hide);
        };
    }, []);
    const stop = (cancel = false) => {
        if (cancel) {
            revision.current++;
            recognition.current?.abort();
            setTranscript('');
        } else recognition.current?.stop();
        clearInterval(timer.current);
        setRecording(false);
        onRecording(false);
    };
    const start = async () => {
        const current = ++revision.current;
        setMessage('');
        setTranscript('');
        setBusy(true);
        const support = await privateSpeechSupport(language);
        if (!alive.current || current !== revision.current) return;
        setBusy(false);
        if (!support.available) {
            setMessage(t(`behaviorLog.voice.${support.reason}`));
            return;
        }
        const speech = new support.Recognition();
        recognition.current = speech;
        speech.processLocally = true;
        speech.lang = language;
        speech.continuous = true;
        speech.interimResults = false;
        let collected = '';
        let failed = false;
        speech.onresult = (event) => {
            if (!alive.current || current !== revision.current) return;
            for (
                let index = event.resultIndex;
                index < event.results.length;
                index++
            ) {
                if (event.results[index].isFinal)
                    collected += `${event.results[index][0].transcript} `;
            }
            setTranscript(collected.trim());
        };
        speech.onerror = (event) => {
            failed = true;
            if (alive.current && current === revision.current)
                setMessage(
                    t(
                        `behaviorLog.voice.${event.error === 'not-allowed' ? 'denied' : 'failed'}`
                    )
                );
        };
        speech.onend = () => {
            clearInterval(timer.current);
            if (!alive.current) return;
            setRecording(false);
            onRecording(false);
            if (current === revision.current && !failed && !collected.trim())
                setMessage(t('behaviorLog.voice.noSpeech'));
        };
        try {
            speech.start();
            setRecording(true);
            onRecording(true);
            setSeconds(0);
            const started = Date.now();
            timer.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - started) / 1000);
                setSeconds(elapsed);
                if (elapsed >= 60) {
                    clearInterval(timer.current);
                    speech.stop();
                }
            }, 250);
        } catch {
            setMessage(t('behaviorLog.voice.failed'));
        }
    };
    const refine = async (diagnostic = false) => {
        const original = text;
        setBusy(true);
        setMessage('');
        setSuggestion(null);
        request.current = new AbortController();
        try {
            const result = await behaviorLogApi.refine(
                {
                    student: student || undefined,
                    text: diagnostic
                        ? 'the student stopped after two reminders.'
                        : original,
                    language: language.startsWith('ar') ? 'ar' : 'en',
                    diagnostic
                },
                request.current.signal
            );
            if (!alive.current) return;
            if (diagnostic) setMessage(t('behaviorLog.testPassed'));
            else if (latest.current !== original)
                setMessage(t('behaviorLog.stale'));
            else setSuggestion({ original, text: result.suggestion });
        } catch (error) {
            if (alive.current && error.code !== 'ERR_CANCELED')
                setMessage(behaviorError(error, t));
        } finally {
            if (alive.current) setBusy(false);
        }
    };
    return (
        <div className="bl-description-tools">
            <div className="bl-actions">
                <label>
                    {t('behaviorLog.voice.language')}
                    <select
                        value={language}
                        disabled={recording || busy}
                        onChange={(event) => setLanguage(event.target.value)}
                    >
                        <option value="en-US">English</option>
                        <option value="ar-SA">العربية</option>
                    </select>
                </label>
                {recording ? (
                    <>
                        <span role="status">
                            {t('behaviorLog.voice.recording', { seconds })}
                        </span>
                        <button type="button" onClick={() => stop()}>
                            {t('behaviorLog.voice.stop')}
                        </button>
                        <button type="button" onClick={() => stop(true)}>
                            {t('behaviorLog.cancel')}
                        </button>
                    </>
                ) : (
                    <button type="button" disabled={busy} onClick={start}>
                        <HiOutlineMicrophone />
                        {t('behaviorLog.voice.start')}
                    </button>
                )}
                <button
                    type="button"
                    disabled={recording || busy || !text.trim() || !student}
                    onClick={() => refine()}
                >
                    <HiOutlineSparkles />
                    {busy ? t('common.loading') : t('behaviorLog.refine')}
                </button>
            </div>
            <small>{t('behaviorLog.voice.private')}</small>
            {message && (
                <p role="status" className="bl-notice">
                    {message}
                </p>
            )}
            {transcript && !recording && (
                <section className="bl-suggestion">
                    <label>
                        {t('behaviorLog.voice.transcript')}
                        <textarea
                            value={transcript}
                            maxLength={1000}
                            onChange={(event) =>
                                setTranscript(event.target.value)
                            }
                        />
                    </label>
                    <div className="bl-actions">
                        <button
                            type="button"
                            onClick={() => {
                                const target = textarea.current;
                                const inserted = insertDictation(
                                    text,
                                    transcript,
                                    target?.selectionStart,
                                    target?.selectionEnd
                                );
                                if (inserted.length > 1000) {
                                    setMessage(t('behaviorLog.tooLong'));
                                    return;
                                }
                                onChange(inserted);
                                setTranscript('');
                                target?.focus();
                            }}
                        >
                            {t('behaviorLog.voice.insert')}
                        </button>
                        <button type="button" onClick={() => setTranscript('')}>
                            {t('behaviorLog.discard')}
                        </button>
                    </div>
                </section>
            )}
            {suggestion && (
                <section className="bl-suggestion">
                    <h3>{t('behaviorLog.reviewWording')}</h3>
                    <p>
                        <strong>{t('behaviorLog.original')}</strong>
                    </p>
                    <p dir="auto">{suggestion.original}</p>
                    <label>
                        {t('behaviorLog.suggestion')}
                        <textarea
                            dir="auto"
                            value={suggestion.text}
                            maxLength={1000}
                            onChange={(event) =>
                                setSuggestion({
                                    ...suggestion,
                                    text: event.target.value
                                })
                            }
                        />
                    </label>
                    <p>{t('behaviorLog.checkFacts')}</p>
                    <div className="bl-actions">
                        <button
                            type="button"
                            disabled={
                                text !== suggestion.original ||
                                !suggestion.text.trim()
                            }
                            onClick={() => {
                                onOriginal(suggestion.original);
                                onChange(suggestion.text);
                                setSuggestion(null);
                            }}
                        >
                            {t('behaviorLog.useWording')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSuggestion(null)}
                        >
                            {t('behaviorLog.keepOriginal')}
                        </button>
                    </div>
                    {text !== suggestion.original && (
                        <p role="status">{t('behaviorLog.stale')}</p>
                    )}
                </section>
            )}
            <details>
                <summary>{t('behaviorLog.diagnostics')}</summary>
                <p>{t('behaviorLog.testHint')}</p>
                <div className="bl-actions">
                    <button
                        type="button"
                        disabled={busy || recording}
                        onClick={async () => {
                            const result = await privateSpeechSupport(language);
                            if (alive.current)
                                setMessage(
                                    result.available
                                        ? t('behaviorLog.voice.testReady')
                                        : t(
                                              `behaviorLog.voice.${result.reason}`
                                          )
                                );
                        }}
                    >
                        {t('behaviorLog.voice.test')}
                    </button>
                    <button
                        type="button"
                        disabled={busy || recording}
                        onClick={() => refine(true)}
                    >
                        {t('behaviorLog.testRefine')}
                    </button>
                </div>
            </details>
        </div>
    );
}
