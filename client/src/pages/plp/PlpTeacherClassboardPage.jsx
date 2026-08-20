import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
    fetchPlpRecords, submitPlpRecord, createPlpRecord,
    fetchPlpTraits,
    fetchPlpCycles, selectPlpCycles,
    fetchPlpAwardCandidates, setPlpAwardDecision,
    selectPlpRecords, selectPlpLoading, selectPlpError, clearPlpError, selectPlpTraits, selectPlpAwardCandidates,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import { selectUser } from '../../store/slices/authSlice';
import toast from 'react-hot-toast';
import api from '../../config/api';
import './PLP.css';

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const SCORE_SLOT_BY_ORDER = ['coreTrait', 'secondaryTrait1', 'secondaryTrait2', 'secondaryTrait3'];

export default function PlpTeacherClassboardPage() {
    const dispatch = useDispatch();
    const records = useSelector(selectPlpRecords);
    const awardCandidates = useSelector(selectPlpAwardCandidates);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);
    const traits = useSelector(selectPlpTraits);
    const cycles = useSelector(selectPlpCycles);

    const [selectedCycleId, setSelectedCycleId] = useState('');
    const [creating, setCreating] = useState(false);
    const [classes, setClasses] = useState([]);
    const [studentsByClass, setStudentsByClass] = useState({});
    const [form, setForm] = useState({ classId: '', studentId: '', focusTrait: '' });
    const [showObservationModal, setShowObservationModal] = useState(false);
    const [observationStep, setObservationStep] = useState('edit');
    const [observationSubmitting, setObservationSubmitting] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [needsReviewQueue, setNeedsReviewQueue] = useState([]);
    const [awardDecisionModal, setAwardDecisionModal] = useState(null);
    const [awardDecisionReason, setAwardDecisionReason] = useState('');
    const [awardFilterTrait, setAwardFilterTrait] = useState('all');
    const [leaderboardFilterTrait, setLeaderboardFilterTrait] = useState('all');
    const [leaderboardRows, setLeaderboardRows] = useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardMode, setLeaderboardMode] = useState('all');
    const [leaderboardSelectedTrait, setLeaderboardSelectedTrait] = useState(null);
    const recognitionRef = useRef(null);
    const [observationForm, setObservationForm] = useState({
        classId: '',
        studentId: '',
        rawText: '',
        traitId: '',
        capturedAt: new Date().toISOString(),
    });
    const [classificationDraft, setClassificationDraft] = useState(null);
    const [confirmedTraitId, setConfirmedTraitId] = useState('');

    useEffect(() => {
        const params = { academicYear };
        if (selectedCycleId) params.cycleId = selectedCycleId;
        if (awardFilterTrait !== 'all') params.traitId = awardFilterTrait;
        dispatch(fetchPlpRecords(selectedCycleId ? { academicYear, cycleId: selectedCycleId } : { academicYear }));
        dispatch(fetchPlpAwardCandidates(params));
    }, [dispatch, academicYear, selectedCycleId, awardFilterTrait]);

    useEffect(() => {
        dispatch(fetchPlpTraits());
        dispatch(fetchPlpCycles({ academicYear }));
    }, [dispatch, academicYear]);

    const loadNeedsReviewQueue = async () => {
        if (!['teacher', 'admin'].includes(user?.role)) return;
        try {
            const response = await api.get('/plp/observations/needs-review', { params: { limit: 8 } });
            setNeedsReviewQueue(response?.data?.data || []);
        } catch (_error) {
            setNeedsReviewQueue([]);
        }
    };

    const loadLeaderboard = async () => {
        if (!['teacher', 'admin', 'department_principal'].includes(user?.role)) {
            setLeaderboardRows([]);
            return;
        }
        setLeaderboardLoading(true);
        try {
            const response = await api.get('/plp/leaderboard', {
                params: {
                    academicYear,
                    ...(selectedCycleId ? { cycleId: selectedCycleId } : {}),
                    traitId: leaderboardFilterTrait,
                    limit: 100,
                }
            });
            const payload = response?.data?.data || {};
            setLeaderboardMode(payload.mode || 'all');
            setLeaderboardSelectedTrait(payload.selectedTrait || null);
            setLeaderboardRows(payload.rows || []);
        } catch (_error) {
            setLeaderboardRows([]);
            setLeaderboardMode('all');
            setLeaderboardSelectedTrait(null);
        } finally {
            setLeaderboardLoading(false);
        }
    };

    useEffect(() => {
        const loadClasses = async () => {
            try {
                const response = await api.get('/classes', { params: { academicYear, limit: 200 } });
                const nextClasses = response?.data?.data?.classes || [];
                setClasses(nextClasses);
                if (!form.classId && nextClasses.length > 0) {
                    setForm((prev) => ({ ...prev, classId: nextClasses[0]._id }));
                }
            } catch (_error) {
                setClasses([]);
            }
        };

        loadClasses();
    }, [academicYear]);

    useEffect(() => {
        const classId = form.classId;
        if (!classId || studentsByClass[classId]) return;

        const loadStudents = async () => {
            try {
                const response = await api.get(`/classes/${classId}`);
                const classStudents = response?.data?.data?.students || [];
                setStudentsByClass((prev) => ({ ...prev, [classId]: classStudents }));
                if (!form.studentId && classStudents.length > 0) {
                    setForm((prev) => ({ ...prev, studentId: classStudents[0]._id }));
                }
            } catch (_error) {
                setStudentsByClass((prev) => ({ ...prev, [classId]: [] }));
            }
        };

        loadStudents();
    }, [form.classId, form.studentId, studentsByClass]);

    useEffect(() => {
        const classId = observationForm.classId;
        if (!classId || studentsByClass[classId]) return;

        const loadStudents = async () => {
            try {
                const response = await api.get(`/classes/${classId}`);
                const classStudents = response?.data?.data?.students || [];
                setStudentsByClass((prev) => ({ ...prev, [classId]: classStudents }));
                if (!observationForm.studentId && classStudents.length > 0) {
                    setObservationForm((prev) => ({ ...prev, studentId: classStudents[0]._id }));
                }
            } catch (_error) {
                setStudentsByClass((prev) => ({ ...prev, [classId]: [] }));
            }
        };

        loadStudents();
    }, [observationForm.classId, observationForm.studentId, studentsByClass]);

    useEffect(() => {
        if (error) { toast.error(error); dispatch(clearPlpError()); }
    }, [error, dispatch]);

    useEffect(() => {
        loadNeedsReviewQueue();
    }, [user?.role]);

    useEffect(() => {
        loadLeaderboard();
    }, [user?.role, academicYear, selectedCycleId, leaderboardFilterTrait]);

    const openAwardDecision = (record, decision) => {
        setAwardDecisionModal({ record, decision });
        setAwardDecisionReason('');
    };

    const confirmAwardDecision = async () => {
        if (!awardDecisionModal) return;
        if (awardDecisionModal.decision === 'not_selected' && !awardDecisionReason.trim()) {
            toast.error('Reason required when not selecting');
            return;
        }

        const result = await dispatch(setPlpAwardDecision({
            recordId: awardDecisionModal.record._id,
            decision: awardDecisionModal.decision,
            reason: awardDecisionReason,
        }));

        if (!result.error) {
            setAwardDecisionModal(null);
            setAwardDecisionReason('');
            toast.success('Decision saved');
        } else {
            toast.error(result.payload || 'Failed to save award decision');
        }
    };

    const handleSubmit = async (id) => {
        const r = await dispatch(submitPlpRecord(id));
        if (!r.error) toast.success('Record submitted');
        else toast.error(r.payload);
    };

    const handleCreateRecord = async (event) => {
        event.preventDefault();
        if (!selectedCycleId || !form.classId || !form.studentId) {
            toast.error('Please select round, class, and student');
            return;
        }

        setCreating(true);
        try {
            const result = await dispatch(createPlpRecord({
                academicYear,
                cycleId: selectedCycleId,
                theme: traitById.get(String(form.focusTrait))?.themeCode || 'confidence',
                focusTrait: form.focusTrait || undefined,
                classId: form.classId,
                studentId: form.studentId,
                scores: {
                    coreTrait: 0,
                    secondaryTrait1: 0,
                    secondaryTrait2: 0,
                    secondaryTrait3: 0,
                },
            }));

            if (createPlpRecord.fulfilled.match(result)) {
                toast.success('PLP record created');
                dispatch(fetchPlpRecords(selectedCycleId ? { academicYear, cycleId: selectedCycleId } : { academicYear }));
            } else {
                toast.error(result.payload || 'Failed to create PLP record');
            }
        } finally {
            setCreating(false);
        }
    };

    const openObservationModal = () => {
        const defaultClassId = form.classId || classes[0]?._id || '';
        const defaultStudents = studentsByClass[defaultClassId] || [];
        const defaultStudentId = defaultStudents[0]?._id || '';
        setObservationForm({
            classId: defaultClassId,
            studentId: defaultStudentId,
            rawText: '',
            traitId: '',
            capturedAt: new Date().toISOString(),
        });
        setClassificationDraft(null);
        setConfirmedTraitId('');
        setObservationStep('edit');
        setShowObservationModal(true);
    };

    const closeObservationModal = () => {
        setShowObservationModal(false);
        setObservationStep('edit');
        setClassificationDraft(null);
        setConfirmedTraitId('');
        setIsListening(false);
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
    };

    const startVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error('Voice input is not supported in this browser');
            return;
        }

        const baseText = String(observationForm.rawText || '').trim();
        let sessionTranscript = '';

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const transcript = Array.from(event?.results || [])
                .map((result) => String(result?.[0]?.transcript || '').trim())
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!transcript) {
                return;
            }

            // SpeechRecognition often emits cumulative transcripts; replace the
            // in-session text instead of appending each callback payload.
            sessionTranscript = transcript;
            setObservationForm((prev) => ({
                ...prev,
                rawText: [baseText, sessionTranscript].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
            }));
        };
        recognition.onerror = (event) => {
            const errorCode = String(event?.error || '').trim().toLowerCase();
            if (errorCode === 'aborted') {
                return;
            }
            if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
                toast.error('Microphone access is blocked. Allow mic permission and try again.');
                return;
            }
            if (errorCode === 'no-speech') {
                toast.error('No speech detected. Please speak and try again.');
                return;
            }
            toast.error('Voice capture failed. Please type or try again.');
        };
        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        setIsListening(true);
        recognition.start();
    };

    const stopVoiceInput = () => {
        if (!recognitionRef.current) return;
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setIsListening(false);
    };

    const submitObservation = async ({ traitIdOverride = undefined, source = undefined, aiConfidenceValue = undefined, aiRationaleValue = undefined, reviewStatusValue = undefined, evidenceTypeValue = undefined, structuredNoteValue = undefined } = {}) => {
        setObservationSubmitting(true);
        try {
            const payload = {
                studentId: observationForm.studentId,
                classId: observationForm.classId,
                rawText: observationForm.rawText,
                capturedAt: observationForm.capturedAt,
                academicYear,
                ...(traitIdOverride ? { traitId: traitIdOverride } : {}),
                ...(source ? { source } : {}),
                ...(aiConfidenceValue ? { aiConfidence: aiConfidenceValue } : {}),
                ...(aiRationaleValue ? { aiRationale: aiRationaleValue } : {}),
                ...(reviewStatusValue ? { reviewStatus: reviewStatusValue } : {}),
                ...(evidenceTypeValue ? { evidenceType: evidenceTypeValue } : {}),
                ...(structuredNoteValue ? { structuredNote: structuredNoteValue } : {}),
            };

            const result = await api.post('/plp/observations', payload);
            if (result?.data?.success) {
                toast.success('Observation saved');
                await Promise.all([
                    dispatch(fetchPlpRecords(selectedCycleId ? { academicYear, cycleId: selectedCycleId } : { academicYear })),
                    loadNeedsReviewQueue(),
                ]);
                closeObservationModal();
            } else {
                toast.error('Failed to save observation');
            }
        } catch (requestError) {
            toast.error(requestError?.response?.data?.message || 'Failed to save observation');
        } finally {
            setObservationSubmitting(false);
        }
    };

    const handleQuickObservationSave = async (event) => {
        event.preventDefault();
        if (!observationForm.classId || !observationForm.studentId || !String(observationForm.rawText || '').trim()) {
            toast.error('Select student and enter an observation note');
            return;
        }

        if (observationForm.traitId) {
            await submitObservation({ traitIdOverride: observationForm.traitId, source: 'manual' });
            return;
        }

        setObservationSubmitting(true);
        try {
            const response = await api.post('/plp/observations/classify', {
                studentId: observationForm.studentId,
                classId: observationForm.classId,
                rawText: observationForm.rawText,
                capturedAt: observationForm.capturedAt,
            });
            const classification = response?.data?.data?.classification;
            if (!classification) {
                toast.error('Could not classify observation. Please choose trait manually.');
                return;
            }

            setClassificationDraft(classification);
            setConfirmedTraitId(classification.traitId || '');
            setObservationStep('confirm');
        } catch (requestError) {
            toast.error(requestError?.response?.data?.message || 'Classification failed. Saving for manual review.');
            await submitObservation({ traitIdOverride: undefined, source: 'ai_classified', reviewStatusValue: 'needs_review' });
        } finally {
            setObservationSubmitting(false);
        }
    };

    const confirmAiClassification = async () => {
        await submitObservation({
            traitIdOverride: confirmedTraitId || undefined,
            source: 'ai_classified',
            aiConfidenceValue: classificationDraft?.confidence,
            aiRationaleValue: classificationDraft?.rationale,
            evidenceTypeValue: classificationDraft?.evidenceType,
            structuredNoteValue: classificationDraft?.structuredNote,
            reviewStatusValue: confirmedTraitId ? 'confirmed' : 'needs_review',
        });
    };

    const isAdmin = ['admin', 'department_principal'].includes(user?.role);
    const canCreateRecord = user?.role === 'teacher' || user?.role === 'admin';
    const classStudents = studentsByClass[form.classId] || [];
    const observationStudents = studentsByClass[observationForm.classId] || [];
    const allActiveTraits = useMemo(() => {
        return traits
            .filter((trait) => trait.isActive)
            .sort((a, b) => {
                const order = (a.displayOrder || 0) - (b.displayOrder || 0);
                if (order !== 0) return order;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
    }, [traits]);
    const traitById = useMemo(() => {
        const map = new Map();
        allActiveTraits.forEach((trait) => {
            map.set(String(trait._id), trait);
        });
        return map;
    }, [allActiveTraits]);
    const traitOptions = useMemo(() => {
        return allActiveTraits;
    }, [allActiveTraits]);
    const cycleOptions = useMemo(() => {
        return cycles
            .filter((cycle) => cycle.academicYear === academicYear)
            .sort((a, b) => (Number(a.printOrder || 0) - Number(b.printOrder || 0)));
    }, [cycles, academicYear]);

    useEffect(() => {
        if (cycleOptions.length === 0) {
            if (selectedCycleId) setSelectedCycleId('');
            return;
        }
        if (!selectedCycleId || !cycleOptions.some((cycle) => String(cycle._id) === String(selectedCycleId))) {
            setSelectedCycleId(String(cycleOptions[0]._id));
        }
    }, [cycleOptions, selectedCycleId]);

    const getRecordTraitProgressRows = (record) => {
        const rankedTraits = [...allActiveTraits].sort((a, b) => {
            const displayOrderDiff = Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
            if (displayOrderDiff !== 0) return displayOrderDiff;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        return rankedTraits.slice(0, 4).map((trait, index) => {
            const scoreField = SCORE_SLOT_BY_ORDER[index] || null;
            const scoreValue = scoreField ? Number(record?.scores?.[scoreField] || 0) : null;
            return {
                id: String(trait._id),
                label: trait.name,
                scoreValue,
            };
        });
    };
    useEffect(() => {
        if (traitOptions.length === 0) {
            if (form.focusTrait) {
                setForm((prev) => ({ ...prev, focusTrait: '' }));
            }
            return;
        }
        if (!traitOptions.some((option) => option._id === form.focusTrait)) {
            setForm((prev) => ({ ...prev, focusTrait: traitOptions[0]._id }));
        }
    }, [traitOptions, form.focusTrait]);

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <h1 style={{ marginBottom: 6 }}>PLP Classboard</h1>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                        Open a student record to create goals and assign tasks.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="plp-form-group" style={{ marginBottom: 0, minWidth: 220 }}>
                        <label style={{ marginBottom: 6 }}>PLP Round</label>
                        <select value={selectedCycleId} onChange={(event) => setSelectedCycleId(event.target.value)}>
                            {cycleOptions.length === 0 && <option value="">No rounds configured</option>}
                            {cycleOptions.map((cycle) => (
                                <option key={cycle._id} value={cycle._id}>{cycle.title}</option>
                            ))}
                        </select>
                    </div>
                    {['teacher', 'admin'].includes(user?.role) && (
                        <button className="btn btn-primary btn-sm" onClick={openObservationModal}>Log Observation</button>
                    )}
                </div>
            </div>

            {canCreateRecord && (
                <div className="plp-section">
                    <h2>Create PLP Record</h2>
                    <form onSubmit={handleCreateRecord} style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                            <div className="plp-form-group" style={{ marginBottom: 0 }}>
                                <label>Class</label>
                                <select
                                    value={form.classId}
                                    onChange={(e) => setForm((prev) => ({ ...prev, classId: e.target.value, studentId: '' }))}
                                    required
                                >
                                    <option value="">Select class</option>
                                    {classes.map((c) => (
                                        <option key={c._id} value={c._id}>{c.name} ({c.academicYear})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="plp-form-group" style={{ marginBottom: 0 }}>
                                <label>Student</label>
                                <select
                                    value={form.studentId}
                                    onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
                                    required
                                    disabled={!form.classId}
                                >
                                    <option value="">Select student</option>
                                    {classStudents.map((s) => (
                                        <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="plp-form-group" style={{ marginBottom: 0 }}>
                                <label>Character Trait</label>
                                <select
                                    value={form.focusTrait}
                                    onChange={(e) => setForm((prev) => ({ ...prev, focusTrait: e.target.value }))}
                                    required={traitOptions.length > 0}
                                    disabled={traitOptions.length === 0}
                                >
                                    {traitOptions.length === 0 && <option value="">No active traits found</option>}
                                    {traitOptions.map((trait) => (
                                        <option key={trait._id} value={trait._id}>{trait.name}{trait.month ? ` (${MONTHS[trait.month - 1]})` : ''}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                Create the round record first, then open Manage Goals & Tasks.
                            </p>
                            <button type="submit" className="btn btn-primary" disabled={creating || !selectedCycleId || !form.classId || !form.studentId}>
                                {creating ? 'Creating...' : 'Create Record'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {loading && <div className="plp-loading">Loading…</div>}
            {!loading && records.length === 0 && (
                <div className="plp-empty">
                    No PLP records for this round. Create or load records first, then use the student detail page to add goals and tasks.
                </div>
            )}
            {records.length > 0 && (
                <div className="plp-section" style={{ padding: 0 }}>
                    <div className="plp-table-wrap">
                        <table className="plp-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Class</th>
                                <th>Round</th>
                                <th>Trait Progress</th>
                                <th>Level</th>
                                <th>Score</th>
                                <th>Evidence</th>
                                <th>Award</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((r) => (
                                <tr key={r._id}>
                                    <td>{r.student?.firstName} {r.student?.lastName}</td>
                                    <td>{r.class?.name}</td>
                                <td>{r.cycle?.title || 'Unassigned Round'}</td>
                                    <td>
                                        <div className="plp-trait-progress-list">
                                            {getRecordTraitProgressRows(r).map((item) => (
                                                <span key={item.id} className="plp-trait-progress-chip">
                                                    {item.label}: {item.scoreValue !== null ? item.scoreValue.toFixed(1) : 'n/a'}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td><span className={`plp-badge plp-badge-${r.level}`}>{r.level}</span></td>
                                    <td>{r.weightedScore?.toFixed(1)}</td>
                                    <td>{r.evidenceCount}</td>
                                    <td><span className={`plp-badge plp-badge-${r.awardDecision}`}>{r.awardDecision?.replace('_', ' ')}</span></td>
                                    <td><span className={`plp-badge plp-badge-${r.status}`}>{r.status}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <Link to={`/portal/plp/records/${r._id}`} className="btn btn-secondary btn-sm">Manage Goals & Tasks</Link>
                                            {r.status === 'in_progress' && !isAdmin && (
                                                <button className="btn btn-primary btn-sm" onClick={() => handleSubmit(r._id)}>Submit</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="plp-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                        <h2 style={{ marginBottom: 4 }}>Evidence Leaderboard</h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Students with the strongest evidence appear first. Filter by all traits or a single character trait.
                        </p>
                    </div>
                    <div className="plp-form-group" style={{ marginBottom: 0, minWidth: 250 }}>
                        <label style={{ marginBottom: 6 }}>Filter by Trait</label>
                        <select
                            value={leaderboardFilterTrait}
                            onChange={(event) => setLeaderboardFilterTrait(event.target.value)}
                        >
                            <option value="all">All Traits</option>
                            {allActiveTraits.map((trait) => (
                                <option key={trait._id} value={trait._id}>{trait.name}{trait.month ? ` (${MONTHS[trait.month - 1]})` : ''}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {leaderboardMode === 'trait' && leaderboardSelectedTrait && (
                    <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Showing students ranked by evidence tagged to <strong>{leaderboardSelectedTrait.name}</strong>
                        {leaderboardSelectedTrait.month ? ` (${MONTHS[leaderboardSelectedTrait.month - 1]})` : ''}.
                    </p>
                )}

                {leaderboardLoading && <div className="plp-loading" style={{ padding: 12 }}>Loading leaderboard…</div>}
                {!leaderboardLoading && leaderboardRows.length === 0 && (
                    <div className="plp-empty" style={{ padding: 16 }}>No leaderboard data for this trait filter.</div>
                )}
                {!leaderboardLoading && leaderboardRows.length > 0 && (
                    <div className="plp-table-wrap">
                        <table className="plp-table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th>Evidence</th>
                                    {leaderboardMode === 'trait' && <th>Trait Score</th>}
                                    <th>Overall Score</th>
                                    <th>Level</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboardRows.map((row) => {
                                    const r = row.record;
                                    return (
                                        <tr key={r._id}>
                                            <td>{row.rank}</td>
                                            <td>{r.student?.firstName} {r.student?.lastName}</td>
                                            <td>{r.class?.name || '-'}</td>
                                            <td>{row.matchedEvidenceCount}</td>
                                            {leaderboardMode === 'trait' && <td>{row.selectedTraitScore === null ? '-' : Number(row.selectedTraitScore).toFixed(1)}</td>}
                                            <td>{Number(r.weightedScore || 0).toFixed(1)}</td>
                                            <td><span className={`plp-badge plp-badge-${r.level}`}>{r.level}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="plp-section">
                <div className="plp-awards-header">
                    <h2>Award Decisions</h2>
                    <div className="plp-form-group" style={{ marginBottom: 0, minWidth: 250 }}>
                        <label style={{ marginBottom: 6 }}>Award Trait Filter</label>
                        <select value={awardFilterTrait} onChange={(event) => setAwardFilterTrait(event.target.value)}>
                            <option value="all">All Active Traits</option>
                            {allActiveTraits.map((trait) => (
                                <option key={trait._id} value={trait._id}>{trait.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {!loading && awardCandidates.length === 0 && (
                    <div className="plp-empty" style={{ padding: 18 }}>No award candidates for this trait filter.</div>
                )}
                {awardCandidates.length > 0 && (
                    <div className="plp-table-wrap">
                        <table className="plp-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th>Round</th>
                                    <th>Level</th>
                                    <th>Score</th>
                                    <th>Matched Evidence</th>
                                    <th>Decision</th>
                                    <th>Reason</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {awardCandidates.map((record) => (
                                    <tr key={record._id}>
                                        <td>{record.student?.firstName} {record.student?.lastName}</td>
                                        <td>{record.class?.name}</td>
                                        <td>{record.cycle?.title || 'Unassigned Round'}</td>
                                        <td><span className={`plp-badge plp-badge-${record.level}`}>{record.level}</span></td>
                                        <td>{Number(record.weightedScore || 0).toFixed(1)}</td>
                                        <td>{Number(record.matchedEvidenceCount || 0)}</td>
                                        <td><span className={`plp-badge plp-badge-${record.awardDecision}`}>{record.awardDecision?.replace('_', ' ')}</span></td>
                                        <td style={{ maxWidth: 200, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{record.awardDecisionReason || '—'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <button className="btn btn-primary btn-sm" onClick={() => openAwardDecision(record, 'selected')}>Select</button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => openAwardDecision(record, 'not_selected')}>Not Select</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {needsReviewQueue.length > 0 && (
                <div className="plp-section">
                    <h2>Needs Review</h2>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {needsReviewQueue.map((item) => (
                            <div key={item._id} className="plp-evidence-item">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                    <strong>
                                        {item?.plpRecord?.student?.firstName} {item?.plpRecord?.student?.lastName}
                                    </strong>
                                    <span className="plp-evidence-meta">{new Date(item.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="plp-evidence-meta">
                                    {item?.plpRecord?.class?.name || 'Class'} · {item?.type?.replace('_', ' ')}
                                </div>
                                <p style={{ margin: '6px 0 0' }}>{item.note}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {awardDecisionModal && (
                <div className="plp-modal-overlay" onClick={() => setAwardDecisionModal(null)}>
                    <div className="plp-modal" onClick={(event) => event.stopPropagation()}>
                        <h2>{awardDecisionModal.decision === 'selected' ? 'Select Award' : 'Not Selecting'}</h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                            {awardDecisionModal.record.student?.firstName} {awardDecisionModal.record.student?.lastName}
                        </p>
                        {awardDecisionModal.decision === 'not_selected' && (
                            <div className="plp-form-group">
                                <label>Reason (required)</label>
                                <textarea value={awardDecisionReason} onChange={(event) => setAwardDecisionReason(event.target.value)} placeholder="Why was this student not selected?" />
                            </div>
                        )}
                        {awardDecisionModal.decision === 'selected' && (
                            <div className="plp-form-group">
                                <label>Note (optional)</label>
                                <textarea value={awardDecisionReason} onChange={(event) => setAwardDecisionReason(event.target.value)} placeholder="Any note about this selection…" />
                            </div>
                        )}
                        <div className="plp-modal-actions">
                            <button className="btn btn-secondary" onClick={() => setAwardDecisionModal(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={confirmAwardDecision}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {showObservationModal && (
                <div className="plp-modal-overlay" onClick={closeObservationModal}>
                    <div className="plp-modal" onClick={(event) => event.stopPropagation()}>
                        <h2>Quick Observation Capture</h2>
                        {observationStep === 'edit' && (
                            <form onSubmit={handleQuickObservationSave} style={{ display: 'grid', gap: 10 }}>
                                <div className="plp-form-group">
                                    <label>Class</label>
                                    <select
                                        value={observationForm.classId}
                                        onChange={(e) => setObservationForm((prev) => ({ ...prev, classId: e.target.value, studentId: '' }))}
                                        required
                                    >
                                        <option value="">Select class</option>
                                        {classes.map((c) => (
                                            <option key={c._id} value={c._id}>{c.name} ({c.academicYear})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="plp-form-group">
                                    <label>Student</label>
                                    <select
                                        value={observationForm.studentId}
                                        onChange={(e) => setObservationForm((prev) => ({ ...prev, studentId: e.target.value }))}
                                        required
                                    >
                                        <option value="">Select student</option>
                                        {observationStudents.map((student) => (
                                            <option key={student._id} value={student._id}>{student.firstName} {student.lastName}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="plp-form-group">
                                    <label>Observation</label>
                                    <textarea
                                        value={observationForm.rawText}
                                        onChange={(e) => setObservationForm((prev) => ({ ...prev, rawText: e.target.value }))}
                                        placeholder="Type or dictate what you observed"
                                        required
                                    />
                                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {!isListening ? (
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={startVoiceInput}>Start Voice</button>
                                        ) : (
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={stopVoiceInput}>Stop Voice</button>
                                        )}
                                    </div>
                                </div>
                                <div className="plp-form-group">
                                    <label>Trait (optional)</label>
                                    <select
                                        value={observationForm.traitId}
                                        onChange={(e) => setObservationForm((prev) => ({ ...prev, traitId: e.target.value }))}
                                    >
                                        <option value="">Auto-classify with AI</option>
                                        {allActiveTraits.map((trait) => (
                                            <option key={trait._id} value={trait._id}>
                                                {trait.name}{trait.month ? ` (${MONTHS[trait.month - 1]})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="plp-modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={closeObservationModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={observationSubmitting}>
                                        {observationSubmitting ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {observationStep === 'confirm' && classificationDraft && (
                            <div style={{ display: 'grid', gap: 10 }}>
                                <p style={{ margin: 0 }}>
                                    Filed under <strong>{confirmedTraitId ? (traitById.get(String(confirmedTraitId))?.name || 'Selected trait') : 'Needs review'}</strong>
                                    {confirmedTraitId && traitById.get(String(confirmedTraitId))?.month ? ` (${MONTHS[traitById.get(String(confirmedTraitId))?.month - 1]})` : ''}.
                                </p>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Confidence: {classificationDraft.confidence} · Type: {classificationDraft.evidenceType.replace('_', ' ')}
                                </p>
                                {classificationDraft.rationale && (
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{classificationDraft.rationale}</p>
                                )}
                                <div className="plp-form-group" style={{ marginBottom: 0 }}>
                                    <label>Reassign trait (optional)</label>
                                    <select value={confirmedTraitId} onChange={(e) => setConfirmedTraitId(e.target.value)}>
                                        <option value="">No clear trait (Needs review)</option>
                                        {allActiveTraits.map((trait) => (
                                            <option key={trait._id} value={trait._id}>
                                                {trait.name}{trait.month ? ` (${MONTHS[trait.month - 1]})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="plp-modal-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setObservationStep('edit');
                                            setClassificationDraft(null);
                                            setConfirmedTraitId('');
                                        }}
                                    >
                                        Back
                                    </button>
                                    <button type="button" className="btn btn-primary" disabled={observationSubmitting} onClick={confirmAiClassification}>
                                        {observationSubmitting ? 'Saving...' : 'Confirm & Save'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
