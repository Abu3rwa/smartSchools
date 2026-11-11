import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineMicrophone,
    HiOutlineStop,
    HiOutlineArrowPath,
    HiOutlineClock,
    HiOutlineXMark,
    HiOutlineCheck,
    HiOutlineMagnifyingGlass,
    HiOutlinePaperAirplane,
    HiOutlineExclamationTriangle,
    HiOutlineCheckBadge,
    HiOutlineEye,
    HiOutlineFaceSmile,
    HiOutlineChatBubbleLeftEllipsis,
    HiOutlineAcademicCap,
    HiOutlineUserGroup,
    HiOutlinePlus,
    HiOutlineBolt,
    HiOutlineChevronDown
} from 'react-icons/hi2';
import api from '../../config/api';
import timetableService from '../../services/timetableService';
import './PLP.css';
import './PlpObservationLoggerPage.css';

const KINDS = [
    { value: 'observation', key: 'kindObservation', tone: 'blue', Icon: HiOutlineEye },
    { value: 'positive_example', key: 'kindPositive', tone: 'green', Icon: HiOutlineFaceSmile },
    { value: 'incident', key: 'kindIncident', tone: 'red', Icon: HiOutlineExclamationTriangle },
    { value: 'reflection', key: 'kindReflection', tone: 'violet', Icon: HiOutlineChatBubbleLeftEllipsis }
];

const AVATAR_TONES = ['teal', 'blue', 'violet', 'amber', 'green', 'rose'];

const studentName = (student, fallback = 'Student') => (
    `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || fallback
);

const initialsOf = (student, fallback = '?') => {
    const first = String(student?.firstName || '').trim();
    const last = String(student?.lastName || '').trim();
    const value = `${first.charAt(0)}${last.charAt(0)}`.trim();
    return value ? value.toUpperCase() : fallback;
};

const toneOf = (value = '') => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) % 997;
    }
    return AVATAR_TONES[hash % AVATAR_TONES.length];
};

const timeLabel = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const minutesUntil = (endTime, now) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(endTime || '').trim());
    if (!match) return null;
    const target = new Date(now);
    target.setHours(Number(match[1]), Number(match[2]), 0, 0);
    const diff = Math.round((target.getTime() - now.getTime()) / 60000);
    return diff > 0 && diff < 240 ? diff : null;
};

function Avatar({ student, size = 'md', fallback = '?' }) {
    return (
        <span className={`obs-avatar obs-avatar-${size} obs-tone-${toneOf(studentName(student, ''))}`} aria-hidden="true">
            {initialsOf(student, fallback)}
        </span>
    );
}

function Waveform({ active }) {
    return (
        <span className={`obs-wave${active ? ' is-active' : ''}`} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                <i key={bar} style={{ animationDelay: `${bar * 0.11}s` }} />
            ))}
        </span>
    );
}

export default function PlpObservationLoggerPage() {
    const { t } = useTranslation('plp');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [context, setContext] = useState(null);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [text, setText] = useState('');
    const [listening, setListening] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [proposal, setProposal] = useState(null);
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [preselectedIds, setPreselectedIds] = useState([]);
    const [ambiguous, setAmbiguous] = useState([]);
    const [kind, setKind] = useState('observation');
    const [traitId, setTraitId] = useState('');
    const [detail, setDetail] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [pendingEntries, setPendingEntries] = useState([]);
    const [flashIds, setFlashIds] = useState([]);
    const [feedQuery, setFeedQuery] = useState('');
    const [feedKind, setFeedKind] = useState('all');
    const [feedSort, setFeedSort] = useState('newest');
    const [now, setNow] = useState(() => new Date());

    const recognitionRef = useRef(null);
    const dictationRef = useRef('');
    const selectedClassIdRef = useRef('');
    const textRef = useRef(null);
    const reviewRef = useRef(null);
    const consoleRef = useRef(null);
    const statusTimerRef = useRef(null);

    const kinds = useMemo(
        () => KINDS.map((option) => ({ ...option, label: t(`logger.${option.key}`) })),
        [t]
    );
    const kindMeta = useCallback(
        (value) => KINDS.find((option) => option.value === value) || KINDS[0],
        []
    );
    const kindLabel = useCallback((value) => t(`logger.${kindMeta(value).key}`), [t, kindMeta]);

    const fallbackName = t('logger.studentFallback');
    const nameOf = useCallback((student) => studentName(student, fallbackName), [fallbackName]);

    const classLabel = useCallback((option) => {
        if (!option) return '';
        const name = String(option.name || '').trim();
        const grade = String(option.grade || '').trim();
        return name || grade || t('logger.defaultClass');
    }, [t]);

    const students = useMemo(() => (Array.isArray(context?.students) ? context.students : []), [context?.students]);
    const classes = useMemo(() => (Array.isArray(context?.classes) ? context.classes : []), [context?.classes]);
    const selectedClass = useMemo(
        () => classes.find((option) => option._id === selectedClassId) || null,
        [classes, selectedClassId]
    );
    const capture = context?.capture || { open: false, reason: '' };
    const supportsSpeech = typeof window !== 'undefined'
        && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

    const rawFeed = useMemo(() => {
        const saved = Array.isArray(context?.recentObservations) ? context.recentObservations : [];
        const seen = new Set(saved.map((entry) => String(entry._id)));
        const optimistic = pendingEntries.filter((entry) => !seen.has(String(entry._id)));
        return [...optimistic, ...saved];
    }, [context?.recentObservations, pendingEntries]);

    const feedCounts = useMemo(() => {
        const counts = { all: rawFeed.length };
        for (const option of KINDS) counts[option.value] = 0;
        for (const entry of rawFeed) {
            if (counts[entry.type] !== undefined) counts[entry.type] += 1;
        }
        return counts;
    }, [rawFeed]);

    const feed = useMemo(() => {
        const term = feedQuery.trim().toLowerCase();
        const rows = rawFeed.filter((entry) => {
            if (feedKind !== 'all' && entry.type !== feedKind) return false;
            if (!term) return true;
            return `${nameOf(entry.student)} ${entry.note || ''} ${entry.traitId?.name || ''}`.toLowerCase().includes(term);
        });
        return rows.sort((left, right) => {
            const a = new Date(left.createdAt).getTime() || 0;
            const b = new Date(right.createdAt).getTime() || 0;
            return feedSort === 'oldest' ? a - b : b - a;
        });
    }, [rawFeed, feedQuery, feedKind, feedSort, nameOf]);

    const periodEndsIn = useMemo(
        () => (selectedClass?.kind === 'lesson' ? minutesUntil(context?.context?.period?.endTime, now) : null),
        [selectedClass?.kind, context?.context?.period?.endTime, now]
    );

    const showStatus = useCallback((next) => {
        setStatus(next);
        if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
        if (next?.tone === 'success') {
            statusTimerRef.current = window.setTimeout(() => setStatus(null), 7000);
        }
    }, []);

    const load = useCallback(async (classId = '') => {
        try {
            setLoadError(null);
            const tzOffset = new Date().getTimezoneOffset();
            const response = await timetableService.getCurrentPeriod(tzOffset, { classId });
            const data = response?.data || {};
            setContext(data);
            setPendingEntries([]);
            setSelectedClassId((current) => {
                const exists = (value) => Boolean(value) && (data.classes || []).some((option) => option._id === value);
                const preferred = classId || current;
                if (exists(preferred)) return preferred;
                return data.activeClassId || '';
            });
        } catch (error) {
            setLoadError(error?.response?.data?.message || error.message || t('logger.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        selectedClassIdRef.current = selectedClassId;
    }, [selectedClassId]);

    useEffect(() => {
        load();
        // Never swap the roster while the teacher is dictating.
        const timer = window.setInterval(() => {
            if (!recognitionRef.current) load(selectedClassIdRef.current);
        }, 60000);
        const clock = window.setInterval(() => setNow(new Date()), 30000);
        return () => {
            window.clearInterval(timer);
            window.clearInterval(clock);
        };
    }, [load]);

    useEffect(() => () => {
        if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
    }, []);

    const clearProposal = useCallback(() => {
        setProposal(null);
        setSelectedStudentIds([]);
        setAmbiguous([]);
        setTraitId('');
        setDetail('');
        setKind('observation');
        setStudentSearch('');
    }, []);

    const stopVoiceInput = useCallback(() => {
        if (!recognitionRef.current) return;
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setListening(false);
    }, []);

    const chooseClass = (option) => {
        if (option._id === selectedClassId) return;
        stopVoiceInput();
        setSelectedClassId(option._id);
        setText('');
        setStatus(null);
        setPreselectedIds([]);
        setPendingEntries([]);
        setFeedQuery('');
        setFeedKind('all');
        clearProposal();
        setLoading(true);
        load(option._id);
    };

    const visibleStudents = useMemo(() => {
        const term = studentSearch.trim().toLowerCase();
        if (!term) return students;
        return students.filter((student) => nameOf(student).toLowerCase().includes(term));
    }, [students, studentSearch, nameOf]);

    const toggleStudent = (studentId) => {
        setStatus(null);
        setSelectedStudentIds((current) => (
            current.includes(studentId)
                ? current.filter((id) => id !== studentId)
                : [...current, studentId]
        ));
    };

    const togglePreselect = (studentId) => {
        setPreselectedIds((current) => (
            current.includes(studentId)
                ? current.filter((id) => id !== studentId)
                : [...current, studentId]
        ));
    };

    const resolveAmbiguous = (candidateId) => {
        setSelectedStudentIds((current) => (current.includes(candidateId) ? current : [...current, candidateId]));
        setStatus(null);
    };

    const requestReview = useCallback(async (rawValue) => {
        const cleanText = String(rawValue ?? '').trim();
        if (!cleanText) {
            showStatus({ tone: 'error', text: t('logger.errNoText') });
            return;
        }
        if (!selectedClassId) {
            showStatus({ tone: 'error', text: t('logger.errNoClass') });
            return;
        }
        if (!capture.open) {
            showStatus({ tone: 'error', text: capture.reason || t('logger.errClosed') });
            return;
        }

        setReviewing(true);
        setStatus(null);
        try {
            const response = await api.post('/plp/observations/parse', {
                text: cleanText,
                classId: selectedClassId,
                ...(selectedClass?.kind === 'lesson' && selectedClass.periodId
                    ? { periodId: selectedClass.periodId }
                    : {}),
                tzOffset: new Date().getTimezoneOffset()
            });
            const data = response?.data?.data || {};
            const classification = data.classification || {};
            const detected = (data.matches || []).map((match) => match.studentId);
            setProposal(data);
            setSelectedStudentIds([...new Set([...preselectedIds, ...detected])]);
            setAmbiguous(data.ambiguous || []);
            setKind(classification.evidenceType || 'observation');
            setTraitId(classification.traitId || '');
            setDetail(classification.structuredNote || cleanText);
            window.setTimeout(() => {
                reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 60);
        } catch (error) {
            showStatus({
                tone: 'error',
                text: error?.response?.data?.message || error.message || t('logger.errRead')
            });
        } finally {
            setReviewing(false);
        }
    }, [capture.open, capture.reason, preselectedIds, selectedClass, selectedClassId, showStatus, t]);

    const startVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showStatus({ tone: 'error', text: t('logger.errSpeech') });
            return;
        }
        const lang = (document.documentElement.lang || 'en').toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-US';
        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        const baseText = text.trim();
        dictationRef.current = '';
        recognition.onresult = (event) => {
            const transcript = Array.from(event?.results || [])
                .map((result) => String(result?.[0]?.transcript || '').trim())
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!transcript) return;
            const combined = [baseText, transcript].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            dictationRef.current = combined;
            setText(combined);
        };
        recognition.onerror = (event) => {
            const code = String(event?.error || '').toLowerCase();
            if (code === 'aborted') return;
            dictationRef.current = '';
            showStatus({
                tone: 'error',
                text: code === 'not-allowed' || code === 'service-not-allowed'
                    ? t('logger.errMicBlocked')
                    : t('logger.errVoice')
            });
        };
        recognition.onend = () => {
            setListening(false);
            recognitionRef.current = null;
            const spoken = dictationRef.current.trim();
            dictationRef.current = '';
            // The teacher pressed the microphone to log something, so show the
            // proposal straight away instead of asking for a second click.
            if (spoken) requestReview(spoken);
        };
        recognitionRef.current = recognition;
        setListening(true);
        setStatus(null);
        recognition.start();
    };

    const handleSave = async () => {
        const cleanDetail = detail.trim();
        if (selectedStudentIds.length === 0) {
            showStatus({ tone: 'error', text: t('logger.errNoStudent') });
            return;
        }
        if (!cleanDetail) {
            showStatus({ tone: 'error', text: t('logger.errNoDetail') });
            return;
        }
        if (selectedStudentIds.length > 1 && !traitId) {
            showStatus({ tone: 'error', text: t('logger.errNeedTag') });
            return;
        }

        setSaving(true);
        setStatus(null);
        const failed = [];
        const created = [];
        try {
            for (const studentId of selectedStudentIds) {
                const student = students.find((row) => row._id === studentId);
                try {
                    const response = await api.post('/plp/observations', {
                        studentId,
                        classId: selectedClassId,
                        ...(selectedClass?.kind === 'lesson' && selectedClass.periodId
                            ? { periodId: selectedClass.periodId }
                            : {}),
                        tzOffset: new Date().getTimezoneOffset(),
                        capturedAt: proposal?.capturedAt,
                        rawText: cleanDetail,
                        structuredNote: cleanDetail,
                        evidenceType: kind,
                        skipClassification: true,
                        source: 'ai_classified',
                        aiConfidence: proposal?.classification?.confidence || null,
                        aiRationale: proposal?.classification?.rationale || null,
                        ...(traitId ? { traitId } : {})
                    });
                    const saved = response?.data?.data?.evidence;
                    created.push({
                        _id: saved?._id || `optimistic-${studentId}-${Date.now()}`,
                        student: student || { firstName: '', lastName: '' },
                        type: kind,
                        note: cleanDetail,
                        traitId: (proposal?.availableTraits || []).find((trait) => trait._id === traitId) || null,
                        class: selectedClass || null,
                        subject: proposal?.capture?.subject || null,
                        period: proposal?.capture?.period || null,
                        capturedVia: 'timetable',
                        createdAt: saved?.createdAt || proposal?.capturedAt || new Date().toISOString()
                    });
                } catch (error) {
                    failed.push(nameOf(student));
                    const message = error?.response?.data?.message;
                    if (message && failed.length === 1) showStatus({ tone: 'error', text: message });
                }
            }

            if (created.length > 0) {
                setPendingEntries((current) => [...created, ...current]);
                setFlashIds(created.map((entry) => String(entry._id)));
                window.setTimeout(() => setFlashIds([]), 2600);
            }

            if (failed.length === 0) {
                const first = students.find((student) => student._id === selectedStudentIds[0]);
                showStatus({
                    tone: 'success',
                    text: created.length === 1
                        ? t('logger.savedOne', { name: nameOf(first) })
                        : t('logger.savedMany', { value: created.length })
                });
                setText('');
                setPreselectedIds([]);
                clearProposal();
                load(selectedClassId);
            } else if (failed.length < selectedStudentIds.length) {
                showStatus({ tone: 'error', text: t('logger.savedSome', { names: failed.join(', ') }) });
                load(selectedClassId);
            }
        } finally {
            setSaving(false);
        }
    };

    const logAnotherFor = (entry) => {
        const studentId = String(entry.student?._id || '');
        clearProposal();
        setText('');
        setStatus(null);
        setPreselectedIds(studentId && students.some((row) => row._id === studentId) ? [studentId] : []);
        consoleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => textRef.current?.focus(), 260);
    };

    useEffect(() => {
        const onKeyDown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (!reviewing && capture.open && text.trim()) requestReview(text);
            } else if (event.key === 'Escape' && proposal) {
                clearProposal();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [capture.open, clearProposal, proposal, requestReview, reviewing, text]);

    if (loading && !context) {
        return (
            <div className="plp-page obs-logger">
                <div className="obs-skeleton" role="status" aria-label={t('logger.loading')}>
                    <div className="obs-skel obs-skel-title" />
                    <div className="obs-skel obs-skel-rail" />
                    <div className="obs-skel obs-skel-console" />
                    <div className="obs-skel obs-skel-feed" />
                    <span className="obs-sr">{t('logger.loading')}</span>
                </div>
            </div>
        );
    }

    if (loadError && !context) {
        return (
            <div className="plp-page obs-logger">
                <div className="obs-offline" role="alert">
                    <span className="obs-offline-icon"><HiOutlineExclamationTriangle size={24} /></span>
                    <div className="obs-offline-body">
                        <h2>{t('logger.loadFailed')}</h2>
                        <p>{loadError}</p>
                    </div>
                    <button type="button" className="obs-btn obs-btn-ghost" onClick={() => load(selectedClassId)}>
                        <HiOutlineArrowPath size={16} /> {t('logger.tryAgain')}
                    </button>
                </div>
            </div>
        );
    }

    const contextLine = selectedClass?.kind === 'lesson'
        ? [selectedClass.periodName, selectedClass.subjectName, classLabel(selectedClass)].filter(Boolean).join(' · ')
        : selectedClass
            ? `${classLabel(selectedClass)} · ${t('logger.homeroom')}`
            : t('logger.noClass');

    const activeKind = kindMeta(kind);
    const filtersActive = feedKind !== 'all' || Boolean(feedQuery.trim());

    return (
        <div className="plp-page obs-logger">
            <header className="obs-head">
                <div className="obs-head-text">
                    <p className="obs-eyebrow">
                        <span className={`obs-live-dot${capture.open ? ' is-live' : ''}`} aria-hidden="true" />
                        {capture.open ? t('logger.liveNow') : t('logger.statusClosed')}
                        {selectedClass?.kind === 'lesson' && selectedClass.periodName
                            ? ` · ${selectedClass.periodName}`
                            : ''}
                        {selectedClass?.subjectName ? ` · ${selectedClass.subjectName}` : ''}
                    </p>
                    <h1>{t('logger.title')}</h1>
                    <p className="obs-sub">{t('logger.subtitle')}</p>
                </div>
                <div className="obs-head-tools">
                    <span className="obs-clock" title={t('logger.clockLabel')}>
                        <HiOutlineClock size={15} />
                        <strong>{timeLabel(now)}</strong>
                        {periodEndsIn !== null && (
                            <em>{t('logger.minutesLeft', { value: periodEndsIn })}</em>
                        )}
                    </span>
                    <button
                        type="button"
                        className="obs-btn obs-btn-ghost obs-btn-icon"
                        onClick={() => load(selectedClassId)}
                        disabled={loading}
                        aria-label={t('logger.refresh')}
                        title={t('logger.refresh')}
                    >
                        <HiOutlineArrowPath size={17} className={loading ? 'obs-spin' : ''} />
                    </button>
                </div>
            </header>

            {classes.length > 0 && (
                <div className="obs-classes" role="group" aria-label={t('logger.classPicker')}>
                    {classes.map((option) => {
                        const active = option._id === selectedClassId;
                        return (
                            <button
                                key={option._id}
                                type="button"
                                className={`obs-class${active ? ' is-active' : ''}${option.canCapture ? '' : ' is-locked'}`}
                                aria-pressed={active}
                                onClick={() => chooseClass(option)}
                                disabled={!option.canCapture}
                                title={option.canCapture ? classLabel(option) : option.unavailableReason || t('logger.closed')}
                            >
                                <span className="obs-class-icon">
                                    {option.kind === 'lesson' ? <HiOutlineBolt size={15} /> : <HiOutlineUserGroup size={15} />}
                                </span>
                                <span className="obs-class-text">
                                    <span className="obs-class-name">{classLabel(option)}</span>
                                    <span className="obs-class-meta">
                                        {option.kind === 'lesson'
                                            ? [option.periodName, option.subjectName].filter(Boolean).join(' · ') || t('logger.lesson')
                                            : t('logger.homeroom')}
                                    </span>
                                </span>
                                {!option.canCapture && <span className="obs-class-lock">{t('logger.statusClosed')}</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {loadError && (
                <div className="obs-banner obs-banner-warn" role="alert">
                    <HiOutlineExclamationTriangle size={17} />
                    <span>{loadError} {t('logger.stale')}</span>
                    <button type="button" className="obs-link" onClick={() => load(selectedClassId)}>{t('logger.tryAgain')}</button>
                </div>
            )}

            {selectedClass ? (
                <div className={`obs-context${capture.open ? ' is-open' : ''}`}>
                    <span className="obs-context-icon"><HiOutlineAcademicCap size={18} /></span>
                    <div className="obs-context-text">
                        <strong>{contextLine}</strong>
                        <span>
                            {selectedClass.kind === 'lesson' && selectedClass.periodName
                                ? t('logger.lessonOpenHint', { period: selectedClass.periodName })
                                : t('logger.homeroomOpenHint')}
                        </span>
                    </div>
                    {context?.context?.period?.endTime && (
                        <span className="obs-context-end">
                            {t('logger.endsAt', { time: context.context.period.endTime })}
                        </span>
                    )}
                    <span className={`obs-pill${capture.open ? ' is-open' : ''}`}>
                        {capture.open ? t('logger.statusOpen') : t('logger.statusClosed')}
                    </span>
                </div>
            ) : (
                <div className="obs-empty-note" role="status">
                    <HiOutlineAcademicCap size={20} />
                    <span>{context?.status === 'off-day' ? t('logger.offDay') : t('logger.noLesson')}</span>
                </div>
            )}

            {!capture.open && selectedClass && capture.reason && (
                <p className="obs-closed-reason">{capture.reason}</p>
            )}

            <section className="obs-console" ref={consoleRef} aria-label={t('logger.newObservation')}>
                <div className="obs-console-glow" aria-hidden="true" />
                <div className="obs-capture">
                    <div className="obs-mic-wrap">
                        <button
                            type="button"
                            className={`obs-mic${listening ? ' is-listening' : ''}`}
                            onClick={listening ? stopVoiceInput : startVoiceInput}
                            disabled={!supportsSpeech || !capture.open}
                            aria-pressed={listening}
                            aria-label={listening ? t('logger.stopDictating') : t('logger.dictate')}
                            title={supportsSpeech ? t('logger.dictate') : t('logger.dictateUnsupported')}
                        >
                            <span className="obs-mic-ring" aria-hidden="true" />
                            <span className="obs-mic-ring obs-mic-ring-2" aria-hidden="true" />
                            {listening ? <HiOutlineStop size={26} /> : <HiOutlineMicrophone size={26} />}
                        </button>
                        <span className={`obs-mic-label${listening ? ' is-listening' : ''}`}>
                            {listening ? t('logger.listening') : t('logger.speak')}
                        </span>
                        <Waveform active={listening} />
                    </div>

                    <div className="obs-capture-body">
                        <label className="obs-label" htmlFor="obs-logger-text">{t('logger.promptLabel')}</label>
                        <textarea
                            id="obs-logger-text"
                            ref={textRef}
                            rows={3}
                            maxLength={2000}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder={t('logger.promptPlaceholder')}
                            disabled={!capture.open}
                        />
                        <div className="obs-capture-foot">
                            <span className="obs-hint">
                                {supportsSpeech ? t('logger.promptHelp') : t('logger.promptHelpTyped')}
                            </span>
                            <span className={`obs-count${text.length > 1800 ? ' is-near' : ''}`}>{text.length}/2000</span>
                        </div>
                        <div className="obs-capture-actions">
                            <button
                                type="button"
                                className="obs-btn obs-btn-primary"
                                onClick={() => requestReview(text)}
                                disabled={reviewing || !capture.open || !text.trim()}
                            >
                                {reviewing ? <HiOutlineArrowPath size={16} className="obs-spin" /> : <HiOutlinePaperAirplane size={16} />}
                                {reviewing ? t('logger.reviewing') : t('logger.review')}
                            </button>
                            <span className="obs-hint obs-kbd-hint">
                                <kbd>Ctrl</kbd>+<kbd>Enter</kbd> {t('logger.kbdReview')}
                            </span>
                            <span className="obs-hint obs-review-hint">{t('logger.reviewHint')}</span>
                        </div>
                    </div>
                </div>

                {students.length > 0 && (
                    <div className="obs-prepick">
                        <div className="obs-prepick-head">
                            <span className="obs-label">{t('logger.aboutWhom')}</span>
                            <span className="obs-hint">{t('logger.aboutWhomHint')}</span>
                        </div>
                        <div className="obs-prepick-rail" role="group" aria-label={t('logger.aboutWhom')}>
                            {students.map((student) => {
                                const picked = preselectedIds.includes(student._id);
                                return (
                                    <button
                                        key={student._id}
                                        type="button"
                                        className={`obs-person${picked ? ' is-picked' : ''}`}
                                        onClick={() => togglePreselect(student._id)}
                                        aria-pressed={picked}
                                        disabled={!capture.open}
                                    >
                                        <Avatar student={student} size="sm" fallback={fallbackName.charAt(0)} />
                                        <span>{nameOf(student)}</span>
                                        {picked && <HiOutlineCheck size={13} className="obs-person-check" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </section>

            {reviewing && !proposal && (
                <section className="obs-review is-loading" aria-label={t('logger.reviewing')} aria-busy="true">
                    <div className="obs-skel obs-skel-line" />
                    <div className="obs-skel obs-skel-line short" />
                    <div className="obs-skel obs-skel-block" />
                    <span className="obs-sr">{t('logger.reviewing')}</span>
                </section>
            )}

            {proposal && (
                <section
                    className={`obs-review obs-tone-border-${activeKind.tone}`}
                    ref={reviewRef}
                    aria-label={t('logger.confirmTitle')}
                >
                    <div className="obs-review-head">
                        <div className="obs-review-title">
                            <span className={`obs-kind-icon obs-tone-bg-${activeKind.tone}`}><activeKind.Icon size={17} /></span>
                            <div>
                                <h2>{t('logger.confirmTitle')}</h2>
                                <p>
                                    {proposal.class?.name || classLabel(selectedClass)}
                                    {proposal.capture?.period?.name ? ` · ${proposal.capture.period.name}` : ''}
                                    {proposal.capture?.subject?.name ? ` · ${proposal.capture.subject.name}` : ''}
                                    {proposal.capturedAt ? ` · ${timeLabel(proposal.capturedAt)}` : ''}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="obs-btn obs-btn-ghost obs-btn-icon"
                            onClick={clearProposal}
                            aria-label={t('logger.discardProposal')}
                            title={t('logger.discardProposal')}
                        >
                            <HiOutlineXMark size={17} />
                        </button>
                    </div>

                    {proposal.matches?.length > 0 && (
                        <p className="obs-heard">
                            <HiOutlineMicrophone size={14} />
                            {proposal.matches.length === 1
                                ? t('logger.heardOne', { name: proposal.matches[0].matchedText })
                                : t('logger.heardMany', { names: proposal.matches.map((match) => match.matchedText).join(', ') })}
                        </p>
                    )}

                    {ambiguous.length > 0 && (
                        <div className="obs-ambiguous" role="group" aria-label={t('logger.ambiguousGroup')}>
                            {ambiguous.map((item) => (
                                <div key={item.matchedText} className="obs-ambiguous-row">
                                    <span className="obs-label">{t('logger.ambiguous', { name: item.matchedText })}</span>
                                    <div className="obs-chips">
                                        {item.candidateIds.map((candidateId) => {
                                            const student = students.find((row) => row._id === candidateId);
                                            const picked = selectedStudentIds.includes(candidateId);
                                            return (
                                                <button
                                                    key={candidateId}
                                                    type="button"
                                                    className={`obs-chip${picked ? ' is-selected' : ''}`}
                                                    onClick={() => resolveAmbiguous(candidateId)}
                                                    aria-pressed={picked}
                                                >
                                                    <Avatar student={student} size="xs" fallback={fallbackName.charAt(0)} />
                                                    {nameOf(student)}
                                                    {picked && <HiOutlineCheck size={12} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="obs-field">
                        <div className="obs-field-head">
                            <span className="obs-label">{t('logger.students')}</span>
                            <span className="obs-hint">{t('logger.selectedCount', { value: selectedStudentIds.length })}</span>
                        </div>
                        {selectedStudentIds.length > 0 ? (
                            <div className="obs-chips">
                                {selectedStudentIds.map((studentId) => {
                                    const student = students.find((row) => row._id === studentId);
                                    return (
                                        <span key={studentId} className="obs-chip is-selected is-static">
                                            <Avatar student={student} size="xs" fallback={fallbackName.charAt(0)} />
                                            {nameOf(student)}
                                            <button
                                                type="button"
                                                onClick={() => toggleStudent(studentId)}
                                                aria-label={t('logger.removeStudent', { name: nameOf(student) })}
                                            >
                                                <HiOutlineXMark size={12} />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="obs-hint">{t('logger.noMatch')}</p>
                        )}
                    </div>

                    <div className="obs-field">
                        <label className="obs-label" htmlFor="obs-logger-search">{t('logger.addStudent')}</label>
                        <div className="obs-search">
                            <HiOutlineMagnifyingGlass size={15} />
                            <input
                                id="obs-logger-search"
                                type="search"
                                value={studentSearch}
                                onChange={(event) => setStudentSearch(event.target.value)}
                                placeholder={t('logger.searchClass')}
                            />
                        </div>
                        <div className="obs-roster" role="group" aria-label={t('logger.students')}>
                            {visibleStudents.length === 0 ? (
                                <span className="obs-hint">{students.length === 0 ? t('logger.noRoster') : t('logger.noStudents')}</span>
                            ) : visibleStudents.map((student) => {
                                const checked = selectedStudentIds.includes(student._id);
                                return (
                                    <button
                                        key={student._id}
                                        type="button"
                                        className={`obs-chip${checked ? ' is-selected' : ''}`}
                                        onClick={() => toggleStudent(student._id)}
                                        aria-pressed={checked}
                                    >
                                        <Avatar student={student} size="xs" fallback={fallbackName.charAt(0)} />
                                        {nameOf(student)}
                                        {checked && <HiOutlineCheck size={12} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="obs-grid">
                        <div className="obs-field">
                            <span className="obs-label" id="obs-kind-label">{t('logger.kind')}</span>
                            <div className="obs-kinds" role="group" aria-labelledby="obs-kind-label">
                                {kinds.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`obs-kind obs-tone-${option.tone}${kind === option.value ? ' is-active' : ''}`}
                                        aria-pressed={kind === option.value}
                                        onClick={() => setKind(option.value)}
                                    >
                                        <option.Icon size={16} />
                                        <span>{option.label}</span>
                                    </button>
                                ))}
                            </div>
                            {kind === 'incident' && (
                                <span className="obs-hint obs-hint-warn">
                                    <HiOutlineExclamationTriangle size={13} /> {t('logger.incidentNote')}
                                </span>
                            )}
                        </div>

                        <div className="obs-field">
                            <label className="obs-label" htmlFor="obs-logger-trait">{t('logger.tag')}</label>
                            <div className="obs-select">
                                <select
                                    id="obs-logger-trait"
                                    value={traitId}
                                    onChange={(event) => setTraitId(event.target.value)}
                                >
                                    <option value="">{t('logger.noTag')}</option>
                                    {(proposal.availableTraits || []).map((trait) => (
                                        <option key={trait._id} value={trait._id}>{trait.name}</option>
                                    ))}
                                </select>
                                <HiOutlineChevronDown size={15} />
                            </div>
                            <span className="obs-hint">
                                {proposal.classification?.rationale || t('logger.tagHint')}
                            </span>
                        </div>
                    </div>

                    <div className="obs-field">
                        <label className="obs-label" htmlFor="obs-logger-detail">{t('logger.detail')}</label>
                        <textarea
                            id="obs-logger-detail"
                            rows={3}
                            maxLength={1000}
                            value={detail}
                            onChange={(event) => setDetail(event.target.value)}
                        />
                        <div className="obs-capture-foot">
                            <span className="obs-hint">{t('logger.detailHint')}</span>
                            <span className={`obs-count${detail.length > 900 ? ' is-near' : ''}`}>{detail.length}/1000</span>
                        </div>
                    </div>

                    <div className="obs-review-actions">
                        <button
                            type="button"
                            className="obs-btn obs-btn-primary"
                            onClick={handleSave}
                            disabled={saving || selectedStudentIds.length === 0 || !detail.trim()}
                        >
                            {saving ? <HiOutlineArrowPath size={16} className="obs-spin" /> : <HiOutlineCheckBadge size={16} />}
                            {saving
                                ? t('logger.saving')
                                : selectedStudentIds.length > 1
                                    ? t('logger.saveMany', { value: selectedStudentIds.length })
                                    : t('logger.save')}
                        </button>
                        <button type="button" className="obs-btn obs-btn-ghost" onClick={clearProposal} disabled={saving}>
                            {t('logger.discard')}
                        </button>
                        <span className="obs-hint obs-kbd-hint"><kbd>Esc</kbd> {t('logger.kbdDiscard')}</span>
                    </div>
                </section>
            )}

            {status && (
                <div className={`obs-banner obs-banner-${status.tone}`} role="status" aria-live="polite">
                    {status.tone === 'success'
                        ? <HiOutlineCheckBadge size={18} className="obs-pop" />
                        : <HiOutlineExclamationTriangle size={18} />}
                    <span>{status.text}</span>
                    <button
                        type="button"
                        className="obs-btn obs-btn-ghost obs-btn-icon obs-banner-close"
                        onClick={() => setStatus(null)}
                        aria-label={t('logger.dismiss')}
                    >
                        <HiOutlineXMark size={15} />
                    </button>
                </div>
            )}

            <section className="obs-feed" aria-label={t('logger.today')}>
                <div className="obs-feed-head">
                    <div className="obs-feed-title">
                        <h2>{t('logger.today')}</h2>
                        <span className="obs-hint">
                            {rawFeed.length === 1 ? t('logger.entryOne') : t('logger.entryMany', { value: rawFeed.length })}
                            {selectedClass ? ` · ${t('logger.inClass', { class: classLabel(selectedClass) })}` : ''}
                        </span>
                    </div>
                    <div className="obs-feed-tools">
                        <div className="obs-search obs-search-sm">
                            <HiOutlineMagnifyingGlass size={14} />
                            <input
                                type="search"
                                value={feedQuery}
                                onChange={(event) => setFeedQuery(event.target.value)}
                                placeholder={t('logger.feedSearchPlaceholder')}
                                aria-label={t('logger.feedSearch')}
                            />
                        </div>
                        <div className="obs-select obs-select-sm">
                            <select
                                value={feedSort}
                                onChange={(event) => setFeedSort(event.target.value)}
                                aria-label={t('logger.sortLabel')}
                            >
                                <option value="newest">{t('logger.sortNewest')}</option>
                                <option value="oldest">{t('logger.sortOldest')}</option>
                            </select>
                            <HiOutlineChevronDown size={14} />
                        </div>
                    </div>
                </div>

                <div className="obs-filters" role="group" aria-label={t('logger.kind')}>
                    <button
                        type="button"
                        className={`obs-filter${feedKind === 'all' ? ' is-active' : ''}`}
                        onClick={() => setFeedKind('all')}
                        aria-pressed={feedKind === 'all'}
                    >
                        {t('logger.filterAll')} <em>{feedCounts.all}</em>
                    </button>
                    {kinds.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`obs-filter obs-tone-${option.tone}${feedKind === option.value ? ' is-active' : ''}`}
                            onClick={() => setFeedKind(option.value)}
                            aria-pressed={feedKind === option.value}
                        >
                            <option.Icon size={13} /> {option.label} <em>{feedCounts[option.value] || 0}</em>
                        </button>
                    ))}
                </div>

                {feed.length === 0 ? (
                    <div className="obs-feed-empty">
                        <HiOutlineChatBubbleLeftEllipsis size={22} />
                        <p>{filtersActive ? t('logger.filteredEmpty') : t('logger.feedEmpty')}</p>
                        {filtersActive && (
                            <button
                                type="button"
                                className="obs-btn obs-btn-ghost"
                                onClick={() => { setFeedKind('all'); setFeedQuery(''); }}
                            >
                                {t('logger.clearFilters')}
                            </button>
                        )}
                    </div>
                ) : (
                    <ol className="obs-timeline">
                        {feed.map((entry, index) => {
                            const meta = kindMeta(entry.type);
                            const flashing = flashIds.includes(String(entry._id));
                            return (
                                <li
                                    key={entry._id}
                                    className={`obs-entry obs-tone-${meta.tone}${flashing ? ' is-new' : ''}`}
                                    style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                                >
                                    <span className="obs-entry-node" aria-hidden="true" />
                                    <div className="obs-entry-card">
                                        <div className="obs-entry-head">
                                            <span className="obs-entry-time">{timeLabel(entry.createdAt)}</span>
                                            <Avatar student={entry.student} size="sm" fallback={fallbackName.charAt(0)} />
                                            <strong className="obs-entry-name">{nameOf(entry.student)}</strong>
                                            <span className={`obs-tag obs-tone-bg-${meta.tone}`}>
                                                <meta.Icon size={12} /> {kindLabel(entry.type)}
                                            </span>
                                            {entry.traitId?.name && <span className="obs-entry-trait">{entry.traitId.name}</span>}
                                            <button
                                                type="button"
                                                className="obs-entry-again"
                                                onClick={() => logAnotherFor(entry)}
                                                title={t('logger.logAnother')}
                                            >
                                                <HiOutlinePlus size={13} /> {t('logger.logAnother')}
                                            </button>
                                        </div>
                                        <p className="obs-entry-note">{entry.note}</p>
                                        <div className="obs-entry-meta">
                                            {entry.subject?.name && <span>{entry.subject.name}</span>}
                                            {entry.period?.name && (
                                                <span><HiOutlineClock size={12} /> {entry.period.name}</span>
                                            )}
                                            {entry.capturedVia === 'timetable' && (
                                                <span><HiOutlineBolt size={12} /> {t('logger.fromTimetable')}</span>
                                            )}
                                            {entry.class?.name && !selectedClass && <span>{entry.class.name}</span>}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </section>
        </div>
    );
}