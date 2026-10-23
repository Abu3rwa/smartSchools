import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
    fetchPlpRecords, createPlpRecord, initializePlpRoundRecords, deletePlpRecord,
    fetchPlpTraits,
    fetchPlpCycles, selectPlpCycles,
    selectPlpRecords, selectPlpRecordsPagination, selectPlpLoading, selectPlpError, clearPlpError, selectPlpTraits,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import { selectUser } from '../../store/slices/authSlice';
import toast from 'react-hot-toast';
import api from '../../config/api';
import PlpPagination from './PlpPagination';
import { formatPlpDate } from './plpDateUtils';
import { AWARD_LABELS, RECORD_STATUS_LABELS, studentInitials } from './plpTableLabels';
import './PLP.css';

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function PlpTeacherClassboardPage() {
    const dispatch = useDispatch();
    const records = useSelector(selectPlpRecords);
    const recordsPagination = useSelector(selectPlpRecordsPagination);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);
    const traits = useSelector(selectPlpTraits);
    const cycles = useSelector(selectPlpCycles);

    const [selectedCycleId, setSelectedCycleId] = useState('');
    const [recordsPage, setRecordsPage] = useState(1);
    const [creating, setCreating] = useState(false);
    const [setupOpen, setSetupOpen] = useState(null);
    const [initializingRound, setInitializingRound] = useState(false);
    const [classes, setClasses] = useState([]);
    const [studentsByClass, setStudentsByClass] = useState({});
    const [form, setForm] = useState({ classId: '', studentId: '', focusTrait: '' });
    const [showObservationModal, setShowObservationModal] = useState(false);
    const [observationStep, setObservationStep] = useState('edit');
    const [observationSubmitting, setObservationSubmitting] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [needsReviewQueue, setNeedsReviewQueue] = useState([]);
    const [goalReviewQueue, setGoalReviewQueue] = useState([]);
    const [taskReviewQueue, setTaskReviewQueue] = useState([]);
    const [leaderboardFilterTrait, setLeaderboardFilterTrait] = useState('all');
    const [leaderboardRows, setLeaderboardRows] = useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardMode, setLeaderboardMode] = useState('all');
    const [leaderboardSelectedTrait, setLeaderboardSelectedTrait] = useState(null);
    const [exportTraitId, setExportTraitId] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportingRound, setExportingRound] = useState(false);
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
        dispatch(fetchPlpRecords({
            ...(selectedCycleId ? { academicYear, cycleId: selectedCycleId } : { academicYear }),
            page: recordsPage,
            limit: 30,
        }));
    }, [dispatch, academicYear, selectedCycleId, recordsPage]);

    useEffect(() => {
        setRecordsPage(1);
    }, [academicYear, selectedCycleId]);

    useEffect(() => {
        dispatch(fetchPlpTraits());
        dispatch(fetchPlpCycles({ academicYear }));
    }, [dispatch, academicYear]);

    const loadNeedsReviewQueue = useCallback(async () => {
        if (!['teacher', 'admin'].includes(user?.role)) return;
        try {
            const response = await api.get('/plp/observations/needs-review', { params: { limit: 8 } });
            setNeedsReviewQueue(response?.data?.data || []);
        } catch (_error) {
            setNeedsReviewQueue([]);
        }
    }, [user?.role]);

    const loadGoalReviewQueue = useCallback(async () => {
        if (!['teacher', 'admin'].includes(user?.role)) return;
        try {
            const response = await api.get('/plp/goals/review-queue', {
                params: {
                    academicYear,
                    ...(selectedCycleId ? { cycleId: selectedCycleId } : {}),
                },
            });
            setGoalReviewQueue(response?.data?.data || []);
        } catch (requestError) {
            setGoalReviewQueue([]);
            toast.error(requestError.response?.data?.message || 'Failed to load the PLP goal review queue');
        }
    }, [academicYear, selectedCycleId, user?.role]);

    const loadTaskReviewQueue = useCallback(async () => {
        if (!['teacher', 'admin'].includes(user?.role)) return;
        try {
            const response = await api.get('/plp/tasks/review-queue', {
                params: {
                    academicYear,
                    ...(selectedCycleId ? { cycleId: selectedCycleId } : {}),
                },
            });
            setTaskReviewQueue(response?.data?.data || []);
        } catch (requestError) {
            setTaskReviewQueue([]);
            toast.error(requestError.response?.data?.message || 'Failed to load the PLP task review queue');
        }
    }, [academicYear, selectedCycleId, user?.role]);

    const loadLeaderboard = useCallback(async () => {
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
    }, [academicYear, leaderboardFilterTrait, selectedCycleId, user?.role]);

    const exportObservationsCsv = async () => {
        if (!exportTraitId) {
            toast.error('Select a trait to export');
            return;
        }
        setExporting(true);
        try {
            const response = await api.get('/plp/observations/export', {
                params: {
                    traitId: exportTraitId,
                    academicYear,
                    ...(selectedCycleId ? { cycleId: selectedCycleId } : {}),
                },
                responseType: 'blob',
            });
            const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const traitName = allActiveTraits.find((trait) => trait._id === exportTraitId)?.name || 'trait';
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `plp-observations-${traitName}-${academicYear}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('CSV downloaded');
        } catch (requestError) {
            let message = 'Failed to export observations';
            try {
                const data = requestError?.response?.data;
                const text = typeof data?.text === 'function' ? await data.text() : '';
                if (text) {
                    const parsed = JSON.parse(text);
                    if (parsed?.message) message = parsed.message;
                }
            } catch (_parseError) {
                // Keep the default message for non-JSON error responses.
            }
            toast.error(message);
        } finally {
            setExporting(false);
        }
    };

    const exportRoundReports = async () => {
        if (!selectedCycleId) {
            toast.error('Select a PLP round before exporting reports');
            return;
        }
        setExportingRound(true);
        try {
            const response = await api.get('/plp/records/export-round', {
                params: { academicYear, cycleId: selectedCycleId },
                responseType: 'blob',
            });
            const blob = new Blob([response.data], { type: 'application/zip' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `plp-${academicYear}-${selectedCycleId}-reports.zip`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('PLP round reports downloaded');
        } catch (requestError) {
            let message = 'Failed to export PLP round reports';
            try {
                const responseData = requestError?.response?.data;
                const responseText = typeof responseData?.text === 'function' ? await responseData.text() : '';
                if (responseText) message = JSON.parse(responseText).message || message;
            } catch (_parseError) {
                // Keep the default message if the response is not a JSON error.
            }
            toast.error(message);
        } finally {
            setExportingRound(false);
        }
    };

    useEffect(() => {
        const loadClasses = async () => {
            try {
                const response = await api.get('/classes', { params: { academicYear, limit: 200 } });
                const nextClasses = response?.data?.data?.classes || [];
                setClasses(nextClasses);
                setForm((prev) => nextClasses.some((item) => item._id === prev.classId)
                    ? prev
                    : ({ ...prev, classId: nextClasses[0]?._id || '' }));
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
    }, [loadNeedsReviewQueue]);

    useEffect(() => {
        loadGoalReviewQueue();
    }, [loadGoalReviewQueue]);

    useEffect(() => {
        loadTaskReviewQueue();
    }, [loadTaskReviewQueue]);

    useEffect(() => {
        loadLeaderboard();
    }, [loadLeaderboard]);

    const handleDeleteRecord = async (record) => {
        if (record.status === 'locked') {
            toast.error('Locked records cannot be deleted');
            return;
        }
        if (!window.confirm(`Delete the PLP record for ${record.student?.firstName || ''} ${record.student?.lastName || ''}?`)) return;
        const result = await dispatch(deletePlpRecord(record._id));
        if (!result.error) toast.success('PLP record deleted');
        else toast.error(result.payload || 'Failed to delete PLP record');
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
                theme: traitById.get(String(form.focusTrait))?.themeCode
                    || traitById.get(String(cycleOptions.find((cycle) => String(cycle._id) === String(selectedCycleId))?.spotlightTraits?.[0]))?.themeCode
                    || 'confidence',
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
                const { record, alreadyExists } = result.payload;
                if (alreadyExists) {
                    toast(`A PLP record already exists for ${record?.student?.firstName || 'this student'} in this Round — showing the existing record.`, { icon: 'ℹ️' });
                } else {
                    toast.success('PLP record created');
                }
                dispatch(fetchPlpRecords({ ...(selectedCycleId ? { academicYear, cycleId: selectedCycleId } : { academicYear }), page: recordsPage, limit: 30 }));
            } else {
                toast.error(result.payload || 'Failed to create PLP record');
            }
        } finally {
            setCreating(false);
        }
    };

    const handleInitializeRoundRecords = async () => {
        if (!selectedCycleId || !form.classId) {
            toast.error('Please select a Round and class first');
            return;
        }
        const selectedClass = classes.find((classItem) => String(classItem._id) === String(form.classId));
        if (!window.confirm(`Initialize PLP records for every active student in ${selectedClass?.name || 'this class'} for the selected Round? Existing records will be skipped.`)) return;

        setInitializingRound(true);
        try {
            const result = await dispatch(initializePlpRoundRecords({
                academicYear,
                cycleId: selectedCycleId,
                classId: form.classId,
                focusTrait: form.focusTrait || undefined,
            }));
            if (!result.error) {
                toast.success(`${result.payload.created} records initialized; ${result.payload.skipped} already existed`);
                dispatch(fetchPlpRecords({ academicYear, cycleId: selectedCycleId, page: recordsPage, limit: 30 }));
            } else {
                toast.error(result.payload || 'Failed to initialize Round records');
            }
        } finally {
            setInitializingRound(false);
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
                ...(selectedCycleId ? { cycleId: selectedCycleId } : {}),
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
                    dispatch(fetchPlpRecords({ ...(selectedCycleId ? { academicYear, cycleId: selectedCycleId } : { academicYear }), page: recordsPage, limit: 30 })),
                    loadNeedsReviewQueue(),
                    loadLeaderboard(),
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
            .filter((cycle) => cycle.academicYear === academicYear && cycle.status === 'published')
            .sort((a, b) => (Number(a.printOrder || 0) - Number(b.printOrder || 0)));
    }, [cycles, academicYear]);

    useEffect(() => {
        if (cycleOptions.length === 0) {
            if (selectedCycleId) setSelectedCycleId('');
            return;
        }
        if (selectedCycleId && !cycleOptions.some((cycle) => String(cycle._id) === String(selectedCycleId))) {
            setSelectedCycleId('');
        }
    }, [cycleOptions, selectedCycleId]);

    const getRecordTraitProgressRows = (record) => {
        if (!record) return [];

        const observedTraitIds = Array.isArray(record?.observedTraitIds)
            ? record.observedTraitIds.map((traitId) => String(traitId))
            : [];
        if (observedTraitIds.length === 0) return [];

        const uniqueObservedTraitIds = Array.from(new Set(observedTraitIds));
        return uniqueObservedTraitIds
            .map((traitId) => allActiveTraits.find((trait) => String(trait._id) === String(traitId)))
            .filter(Boolean)
            .slice(0, 4)
            .map((trait) => ({ id: String(trait._id), label: trait.name }));
    };
    useEffect(() => {
        if (form.focusTrait && !traitOptions.some((option) => option._id === form.focusTrait)) {
            setForm((prev) => ({ ...prev, focusTrait: '' }));
        }
    }, [traitOptions, form.focusTrait]);

    const activeCycle = cycleOptions.find((cycle) => String(cycle._id) === String(selectedCycleId));
    const recordTotal = Number(recordsPagination?.total ?? records.length);
    const showSetup = setupOpen ?? (!loading && records.length === 0);
    const canExportRound = ['teacher', 'admin'].includes(user?.role);

    return (
        <div className="plp-page">
            <section className="plp-console">
                <div className="plp-workbar">
                    <div className="plp-workbar-title">
                        <h1>PLP Classboard</h1>
                        <p>
                            {activeCycle?.title || 'All rounds'} · {recordTotal} {recordTotal === 1 ? 'record' : 'records'} · {academicYear}
                        </p>
                    </div>
                    <div className="plp-workbar-field">
                        <label htmlFor="plp-round-select">PLP Round</label>
                        <select
                            id="plp-round-select"
                            value={selectedCycleId}
                            onChange={(event) => setSelectedCycleId(event.target.value)}
                        >
                            {cycleOptions.length > 0 && <option value="">All rounds</option>}
                            {cycleOptions.length === 0 && <option value="">No rounds configured</option>}
                            {cycleOptions.map((cycle) => (
                                <option key={cycle._id} value={cycle._id}>{cycle.title}</option>
                            ))}
                        </select>
                    </div>
                    {canExportRound && (
                        <div className="plp-workbar-actions">
                            <button type="button" className="btn btn-primary btn-sm" onClick={openObservationModal}>Log Observation</button>
                            {canCreateRecord && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setSetupOpen(!showSetup)}
                                    aria-expanded={showSetup}
                                    aria-controls="plp-record-setup"
                                >
                                    {showSetup ? 'Hide record setup' : 'Record setup'}
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={exportRoundReports}
                                disabled={!selectedCycleId || exportingRound}
                                title={selectedCycleId ? 'Download every record in this round as DOCX' : 'Select a round first'}
                            >
                                {exportingRound ? 'Exporting...' : 'Export round reports'}
                            </button>
                        </div>
                    )}
                </div>

                {canCreateRecord && showSetup && (
                    <div className="plp-setup" id="plp-record-setup">
                        <form onSubmit={handleCreateRecord}>
                            <div className="plp-setup-grid">
                                <div className="plp-form-group">
                                    <label htmlFor="plp-setup-class">Class</label>
                                    <select
                                        id="plp-setup-class"
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
                                <div className="plp-form-group">
                                    <label htmlFor="plp-setup-student">Student</label>
                                    <select
                                        id="plp-setup-student"
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
                                <div className="plp-form-group">
                                    <label htmlFor="plp-setup-trait">Primary Character Trait (optional)</label>
                                    <select
                                        id="plp-setup-trait"
                                        value={form.focusTrait}
                                        onChange={(e) => setForm((prev) => ({ ...prev, focusTrait: e.target.value }))}
                                        disabled={traitOptions.length === 0}
                                    >
                                        <option value="">No primary trait</option>
                                        {traitOptions.length === 0 && <option value="">No active traits found</option>}
                                        {traitOptions.map((trait) => (
                                            <option key={trait._id} value={trait._id}>{trait.name}{trait.month ? ` (${MONTHS[trait.month - 1]})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="plp-setup-foot">
                                <p className="plp-setup-hint">
                                    {!selectedCycleId
                                        ? 'Choose a PLP round above before creating records.'
                                        : 'Create the round record first, then open the student to add goals and tasks.'}
                                </p>
                                <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !selectedCycleId || !form.classId || !form.studentId}>
                                    {creating ? 'Creating...' : 'Create Record'}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleInitializeRoundRecords}
                                    disabled={initializingRound || creating || !selectedCycleId || !form.classId}
                                >
                                    {initializingRound ? 'Initializing...' : 'Initialize All Students'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </section>

            {loading && <div className="plp-loading">Loading…</div>}
            {!loading && records.length === 0 && (
                <div className="plp-section plp-empty">
                    No PLP records {activeCycle ? `for ${activeCycle.title}` : 'for this academic year'} yet.
                    {canCreateRecord && ' Use Record setup above to create one, or initialize the whole class at once.'}
                </div>
            )}
            {records.length > 0 && (
                <div className="plp-section plp-section-flush">
                    <div className="plp-roster-head">
                        <h2>Student records</h2>
                        <span className="plp-count-pill">{recordTotal}</span>
                    </div>
                    <div className="plp-table-wrap">
                        <table className="plp-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th className="plp-col-optional">Class</th>
                                    <th className="plp-col-optional">Round</th>
                                    <th>Observed traits</th>
                                    <th className="plp-cell-number">Observations</th>
                                    <th>Award</th>
                                    <th>Status</th>
                                    <th className="plp-cell-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map((r) => {
                                    const observedTraits = getRecordTraitProgressRows(r);
                                    const studentName = `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim();
                                    const observations = Number(r.evidenceCount || 0);
                                    return (
                                        <tr key={r._id}>
                                            <td>
                                                <div className="plp-student-cell">
                                                    <span className="plp-student-avatar" aria-hidden="true">{studentInitials(r.student)}</span>
                                                    <Link className="plp-student-name" to={`/portal/plp/records/${r._id}`}>
                                                        {studentName || 'Unnamed student'}
                                                    </Link>
                                                </div>
                                            </td>
                                            <td className="plp-col-optional">{r.class?.name || '-'}</td>
                                            <td className="plp-col-optional">{r.cycle?.title || 'Unassigned round'}</td>
                                            <td>
                                                <div className="plp-trait-progress-list">
                                                    {observedTraits.map((item) => (
                                                        <span key={item.id} className="plp-trait-progress-chip">
                                                            {item.label}
                                                        </span>
                                                    ))}
                                                    {observedTraits.length === 0 && observations > 0 && (
                                                        <span className="plp-cell-muted">Observation saved (trait not tagged yet)</span>
                                                    )}
                                                    {observedTraits.length === 0 && observations === 0 && (
                                                        <span className="plp-cell-muted">No observations</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="plp-cell-number">
                                                <span className={`plp-count-pill${observations ? '' : ' is-empty'}`}>{observations}</span>
                                            </td>
                                            <td><span className={`plp-badge plp-badge-${r.awardDecision}`}>{AWARD_LABELS[r.awardDecision] || r.awardDecision || 'No decision'}</span></td>
                                            <td><span className={`plp-badge plp-badge-${r.status}`}>{RECORD_STATUS_LABELS[r.status] || r.status}</span></td>
                                            <td className="plp-cell-actions">
                                                <div className="plp-row-actions">
                                                    <Link to={`/portal/plp/records/${r._id}`} className="btn btn-primary btn-sm">Open</Link>
                                                    {canCreateRecord && r.status !== 'locked' && (
                                                        <button type="button" className="plp-quiet-button" onClick={() => handleDeleteRecord(r)}>Delete</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            <PlpPagination pagination={recordsPagination} onPageChange={setRecordsPage} />

            <div className="plp-split">
                <section className="plp-section">
                    <div className="plp-block-head">
                        <div>
                            <h2 style={{ marginBottom: 4 }}>Evidence Leaderboard</h2>
                            <p className="plp-block-note">
                                Students ranked by the number of saved observation records for the selected trait.
                            </p>
                        </div>
                        <div className="plp-form-group plp-block-filter">
                            <label htmlFor="plp-leaderboard-trait">Filter by Trait</label>
                            <select
                                id="plp-leaderboard-trait"
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
                        <p className="plp-block-note" style={{ marginBottom: 10 }}>
                            Ranked by evidence tagged to <strong>{leaderboardSelectedTrait.name}</strong>
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
                                        <th className="plp-col-optional">Class</th>
                                        <th className="plp-cell-number">Observations</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaderboardRows.map((row) => {
                                        const r = row.record;
                                        const studentName = `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim();
                                        return (
                                            <tr key={r._id}>
                                                <td><span className={`plp-rank${row.rank <= 3 ? ' is-top' : ''}`}>{row.rank}</span></td>
                                                <td>
                                                    <div className="plp-student-cell">
                                                        <span className="plp-student-avatar" aria-hidden="true">{studentInitials(r.student)}</span>
                                                        <Link className="plp-student-name" to={`/portal/plp/records/${r._id}`}>
                                                            {studentName || 'Unnamed student'}
                                                        </Link>
                                                    </div>
                                                </td>
                                                <td className="plp-col-optional">{r.class?.name || '-'}</td>
                                                <td className="plp-cell-number">
                                                    <span className={`plp-count-pill${row.matchedEvidenceCount ? '' : ' is-empty'}`}>
                                                        {row.matchedEvidenceCount}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="plp-section">
                    <h2>Export Observations by Trait</h2>
                    <p className="plp-block-note" style={{ marginBottom: 14 }}>
                        A CSV of every student's recorded observations for one trait, in the current round and academic year.
                    </p>
                    <div className="plp-form-group">
                        <label htmlFor="plp-export-trait">Trait</label>
                        <select
                            id="plp-export-trait"
                            value={exportTraitId}
                            onChange={(event) => setExportTraitId(event.target.value)}
                        >
                            <option value="">Select a trait...</option>
                            {allActiveTraits.map((trait) => (
                                <option key={trait._id} value={trait._id}>{trait.name}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={exportObservationsCsv}
                        disabled={!exportTraitId || exporting}
                    >
                        {exporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                </section>
            </div>

            {(needsReviewQueue.length > 0 || goalReviewQueue.length > 0 || taskReviewQueue.length > 0) && (
                <div className="plp-queue-grid">
                    {needsReviewQueue.length > 0 && (
                        <section className="plp-section">
                            <div className="plp-queue-head">
                                <h2>Observations to confirm</h2>
                            </div>
                            <p className="plp-queue-note">The most recent {needsReviewQueue.length} awaiting a trait.</p>
                            <div className="plp-queue-list">
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
                                        <Link
                                            className="plp-quiet-link"
                                            to={`/portal/plp/records/${item?.plpRecord?._id || ''}`}
                                        >
                                            Open record
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {goalReviewQueue.length > 0 && (
                        <section className="plp-section">
                            <div className="plp-queue-head">
                                <h2>Goals Due for Review</h2>
                            </div>
                            <p className="plp-queue-note">{goalReviewQueue.length} {goalReviewQueue.length === 1 ? 'goal' : 'goals'} at or past their check-in date.</p>
                            <div className="plp-queue-list">
                                {goalReviewQueue.map((item) => (
                                    <div key={item.goalId} className="plp-evidence-item">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <div>
                                                <strong>{item.student?.firstName} {item.student?.lastName} · {item.title}</strong>
                                                <div className="plp-evidence-meta">
                                                    {item.class?.name || 'Class'} · {item.goalType}
                                                    {item.checkInDate && ` · check-in ${formatPlpDate(item.checkInDate)}`}
                                                    {!item.checkInDate && item.targetDate && ` · target ${formatPlpDate(item.targetDate)}`}
                                                </div>
                                            </div>
                                            <Link
                                                className="btn btn-secondary btn-sm"
                                                to={`/portal/plp/records/${item.recordId}?goalId=${item.goalId}`}
                                            >
                                                Review goal
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {taskReviewQueue.length > 0 && (
                        <section className="plp-section">
                            <div className="plp-queue-head">
                                <h2>Student Tasks Awaiting Review</h2>
                            </div>
                            <p className="plp-queue-note">{taskReviewQueue.length} {taskReviewQueue.length === 1 ? 'submission' : 'submissions'} ready to grade.</p>
                            <div className="plp-queue-list">
                                {taskReviewQueue.map((item) => (
                                    <div key={item.taskId} className="plp-evidence-item">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                                            <div>
                                                <strong>{item.student?.firstName} {item.student?.lastName} · {item.title}</strong>
                                                <div className="plp-evidence-meta">
                                                    {item.class?.name || 'Class'} · Goal: {item.goalTitle || 'PLP goal'}
                                                    {item.submittedAt && ` · submitted ${new Date(item.submittedAt).toLocaleDateString()}`}
                                                </div>
                                                {item.studentCompletionNote && <p style={{ margin: '6px 0 0' }}>{item.studentCompletionNote}</p>}
                                            </div>
                                            <Link
                                                className="btn btn-secondary btn-sm"
                                                to={`/portal/plp/records/${item.recordId}?goalId=${item.goalId}&taskId=${item.taskId}`}
                                            >
                                                Review task
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
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
