import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineMicrophone, HiOutlineX } from 'react-icons/hi';
import api from '../../../../config/api';

const TYPE_OPTIONS = [
    { value: 'observation', label: 'Observation' },
    { value: 'positive_example', label: 'Positive' },
    { value: 'incident', label: 'Incident' },
];

const TYPE_LABELS = TYPE_OPTIONS.reduce((map, option) => {
    map[option.value] = option.label;
    return map;
}, {});

const studentName = (student) => `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';

const ObservationCapturePanel = ({ slot, onSaved, onClose }) => {
    const [traits, setTraits] = useState([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [search, setSearch] = useState('');
    const [type, setType] = useState('observation');
    const [traitId, setTraitId] = useState('');
    const [note, setNote] = useState('');
    const [listening, setListening] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const recognitionRef = useRef(null);
    const noteRef = useRef(null);

    const students = useMemo(() => (Array.isArray(slot?.students) ? slot.students : []), [slot?.students]);
    const recent = useMemo(() => (Array.isArray(slot?.recentObservations) ? slot.recentObservations : []), [slot?.recentObservations]);
    const supportsSpeech = typeof window !== 'undefined'
        && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

    useEffect(() => {
        let alive = true;
        api.get('/plp/traits')
            .then((response) => {
                if (!alive) return;
                const list = Array.isArray(response?.data?.data) ? response.data.data : [];
                setTraits(list.filter((trait) => trait.isActive !== false));
            })
            .catch(() => {
                if (alive) setTraits([]);
            });
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => () => {
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
    }, []);

    const visibleStudents = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return students;
        return students.filter((student) => studentName(student).toLowerCase().includes(term));
    }, [students, search]);

    const toggleStudent = (studentId) => {
        setStatus(null);
        setSelectedStudentIds((current) => (
            current.includes(studentId)
                ? current.filter((id) => id !== studentId)
                : [...current, studentId]
        ));
    };

    const stopVoiceInput = () => {
        if (!recognitionRef.current) return;
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setListening(false);
    };

    const startVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setStatus({ tone: 'error', text: 'This browser cannot turn speech into text. Type the note instead.' });
            return;
        }
        const lang = (document.documentElement.lang || 'en').toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-US';
        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        const baseText = note.trim();
        let sessionTranscript = '';
        recognition.onresult = (event) => {
            const transcript = Array.from(event?.results || [])
                .map((result) => String(result?.[0]?.transcript || '').trim())
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!transcript) return;
            sessionTranscript = transcript;
            setNote([baseText, sessionTranscript].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
        };
        recognition.onerror = (event) => {
            const code = String(event?.error || '').toLowerCase();
            if (code === 'aborted') return;
            setStatus({
                tone: 'error',
                text: code === 'not-allowed' || code === 'service-not-allowed'
                    ? 'Microphone access is blocked. Allow it and try again, or type the note.'
                    : 'Voice capture failed. Type the note or try again.',
            });
        };
        recognition.onend = () => {
            setListening(false);
            recognitionRef.current = null;
        };
        recognitionRef.current = recognition;
        setListening(true);
        setStatus(null);
        recognition.start();
    };

    const handleSave = async () => {
        const cleanNote = note.trim();
        if (selectedStudentIds.length === 0) {
            setStatus({ tone: 'error', text: 'Select at least one student.' });
            return;
        }
        if (!cleanNote) {
            setStatus({ tone: 'error', text: 'Write or dictate what you noticed.' });
            return;
        }
        if (selectedStudentIds.length > 1 && !traitId) {
            setStatus({ tone: 'error', text: 'Choose a tag to log the same note for more than one student.' });
            return;
        }

        setSaving(true);
        setStatus(null);
        const failed = [];
        try {
            for (const studentId of selectedStudentIds) {
                try {
                    await api.post('/plp/observations', {
                        studentId,
                        classId: slot?.class?._id,
                        periodId: slot?.period?._id,
                        tzOffset: new Date().getTimezoneOffset(),
                        rawText: cleanNote,
                        evidenceType: type,
                        ...(traitId ? { traitId } : {}),
                    });
                } catch (requestError) {
                    failed.push(studentName(students.find((student) => student._id === studentId)));
                    const message = requestError?.response?.data?.message;
                    if (message && failed.length === 1) {
                        setStatus({ tone: 'error', text: message });
                    }
                }
            }

            if (failed.length === 0) {
                const count = selectedStudentIds.length;
                setStatus({ tone: 'success', text: count === 1 ? 'Observation saved.' : `Observation saved for ${count} students.` });
                setSelectedStudentIds([]);
                setNote('');
                setType('observation');
                setTraitId('');
                if (onSaved) onSaved();
            } else if (failed.length < selectedStudentIds.length) {
                setStatus({ tone: 'error', text: `Saved for some students, failed for: ${failed.join(', ')}.` });
                if (onSaved) onSaved();
            }
        } finally {
            setSaving(false);
        }
    };

    if (!slot?.class?._id) return null;

    return (
        <section className="obs-panel" aria-label="Log an observation">
            <div className="obs-panel-head">
                <div>
                    <h2>Observation</h2>
                    <p>
                        {slot.period?.name || 'Lesson'} · {slot.subject?.name || 'Subject'} · {slot.class?.name || 'Class'}
                    </p>
                </div>
                <button type="button" className="obs-icon-button" onClick={() => { stopVoiceInput(); onClose(); }} aria-label="Close observation panel">
                    <HiOutlineX size={18} />
                </button>
            </div>

            <div className="obs-panel-body">
                <div className="obs-column">
                    <div className="obs-field">
                        <div className="obs-label-row">
                            <span className="obs-label">Students</span>
                            <span className="obs-hint">{selectedStudentIds.length} selected</span>
                        </div>
                        {students.length > 8 && (
                            <input
                                type="search"
                                className="obs-input"
                                placeholder="Find a student"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                aria-label="Find a student"
                            />
                        )}
                        <div className="obs-student-list" role="group" aria-label="Class roster">
                            {visibleStudents.length === 0 ? (
                                <p className="obs-empty">No students in this class yet.</p>
                            ) : visibleStudents.map((student) => {
                                const checked = selectedStudentIds.includes(student._id);
                                return (
                                    <button
                                        key={student._id}
                                        type="button"
                                        className={`obs-student${checked ? ' is-selected' : ''}`}
                                        aria-pressed={checked}
                                        onClick={() => toggleStudent(student._id)}
                                    >
                                        <span className="obs-student-initials" aria-hidden="true">
                                            {(student.firstName || '?').charAt(0)}{(student.lastName || '').charAt(0)}
                                        </span>
                                        <span className="obs-student-name">{studentName(student)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="obs-column">
                    <div className="obs-field">
                        <span className="obs-label">Kind</span>
                        <div className="obs-segmented" role="group" aria-label="Observation kind">
                            {TYPE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={type === option.value ? 'is-active' : ''}
                                    aria-pressed={type === option.value}
                                    onClick={() => setType(option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="obs-field">
                        <label className="obs-label" htmlFor="obs-trait">Tag</label>
                        <select
                            id="obs-trait"
                            className="obs-input"
                            value={traitId}
                            onChange={(event) => setTraitId(event.target.value)}
                        >
                            <option value="">Let the app classify it</option>
                            {traits.map((trait) => (
                                <option key={trait._id} value={trait._id}>{trait.name}</option>
                            ))}
                        </select>
                        <span className="obs-hint">A tag is required when logging the same note for several students.</span>
                    </div>

                    <div className="obs-field">
                        <div className="obs-label-row">
                            <label className="obs-label" htmlFor="obs-note">What did you notice?</label>
                            <button
                                type="button"
                                className={`obs-mic${listening ? ' is-listening' : ''}`}
                                onClick={listening ? stopVoiceInput : startVoiceInput}
                                disabled={!supportsSpeech}
                                title={supportsSpeech ? 'Dictate the note' : 'This browser cannot turn speech into text'}
                            >
                                <HiOutlineMicrophone size={16} />
                                {listening ? 'Stop' : 'Dictate'}
                            </button>
                        </div>
                        <textarea
                            id="obs-note"
                            ref={noteRef}
                            className="obs-textarea"
                            rows={3}
                            maxLength={1000}
                            placeholder="A short, factual note. No full names are needed."
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                        />
                        <span className="obs-hint">{note.length}/1000</span>
                    </div>

                    <div className="obs-actions">
                        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save observation'}
                        </button>
                    </div>
                    {status && (
                        <p className={`obs-status ${status.tone}`} role="status">{status.text}</p>
                    )}
                </div>
            </div>

            {recent.length > 0 && (
                <div className="obs-recent">
                    <div className="obs-label-row">
                        <span className="obs-label">Your observations today in this class</span>
                        <span className="obs-hint">{recent.length}</span>
                    </div>
                    <ul>
                        {recent.map((item) => (
                            <li key={item._id}>
                                <span className={`obs-recent-type type-${item.type}`}>{TYPE_LABELS[item.type] || item.type}</span>
                                <span className="obs-recent-name">{studentName(item.student)}</span>
                                {item.traitId?.name && <span className="obs-recent-tag">{item.traitId.name}</span>}
                                <span className="obs-recent-note">{item.note}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
};

export default ObservationCapturePanel;
