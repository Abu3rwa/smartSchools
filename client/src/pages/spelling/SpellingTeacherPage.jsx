import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, FormControl, InputLabel, MenuItem, Select, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import { downloadStudentSpellingDetailsDocx } from '../../services/spellingDetailsDocxExport';
import './SpellingTeacherPage.css';
import TeacherSessionDialog from './components/TeacherSessionDialog';
import SpellingClassSessionControls from './components/SpellingClassSessionControls';
import SpellingStudentRosterTable from './components/SpellingStudentRosterTable';
import SpellingCurriculumTab from './components/SpellingCurriculumTab';
import SpellingSettingsTab from './components/SpellingSettingsTab';
import { ConfirmDialog, EndSessionPassageReviewDialog, PassageDeliveryDialog, StudentSessionsDialog } from './components/SpellingTeacherDialogs';
import { PASSAGE_STATUS_COLOR, isSkippedSpellingAttempt } from './components/spellingTeacherConstants';
import { fetchClass, fetchClasses, selectClassStudents, selectClasses, selectClassesLoading, selectCurrentClass } from '../../store/slices/classSlice';
import { updateStudent } from '../../store/slices/studentSlice';
import {
    fetchSpellingCurrentItem,
    fetchSpellingDictionaryEntry,
    fetchSpellingHistory,
    fetchSpellingWords,
    selectSpelling,
    endSpellingSession,
    startTeacherSpellingSession,
    submitTeacherSpellingAttempt
} from '../../store/slices/spellingSlice';

const DEFAULT_CLASS_STORAGE_KEY = 'spelling.defaultClassId';

const SpellingTeacherPage = () => {
    const dispatch = useDispatch();
    const { t, i18n } = useTranslation('spelling');
    const classes = useSelector(selectClasses);
    const classStudents = useSelector(selectClassStudents);
    const selectedClass = useSelector(selectCurrentClass);
    const classesLoading = useSelector(selectClassesLoading);
    const spelling = useSelector(selectSpelling);
    const [classId, setClassId] = useState('');
    const [activeTab, setActiveTab] = useState(0);

    useEffect(() => {
        if (classId || !classes.length) return;
        const savedClassId = localStorage.getItem(DEFAULT_CLASS_STORAGE_KEY);
        if (savedClassId && classes.some((schoolClass) => schoolClass._id === savedClassId)) setClassId(savedClassId);
    }, [classId, classes]);

    const selectClass = (nextClassId) => {
        setClassId(nextClassId);
        localStorage.setItem(DEFAULT_CLASS_STORAGE_KEY, nextClassId);
        setActiveTab(0);
    };
    const [studentId, setStudentId] = useState('');
    const [activeSession, setActiveSession] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
    const [integrityEvents, setIntegrityEvents] = useState({ count: 0, events: [], error: '' });
    const [message, setMessage] = useState('');
    const [messageSeverity, setMessageSeverity] = useState('info');
    const [loading, setLoading] = useState(false);
    const [classStarting, setClassStarting] = useState(false);
    const [assessmentMode, setAssessmentMode] = useState('self-serve');
    const [classGrade, setClassGrade] = useState('KG');
    const [classGradeProgress, setClassGradeProgress] = useState({ week: null, status: 'loading', error: '' });
    const [maxMistakesAllowed, setMaxMistakesAllowed] = useState(3);
    const [emailNotification, setEmailNotification] = useState('student-and-parents');
    const [passageEmailAudience, setPassageEmailAudience] = useState('none');
    const [passageEnabled, setPassageEnabled] = useState(false);
    const [passageTrigger, setPassageTrigger] = useState('manual');
    const [passageStyle, setPassageStyle] = useState('sentence-list');
    const [dictationEnabled, setDictationEnabled] = useState(false);
    const [dictationAutoPlay, setDictationAutoPlay] = useState(true);
    const [classDefaults, setClassDefaults] = useState(null);
    const [sessionOverrideOpen, setSessionOverrideOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [importing, setImporting] = useState(false);
    const [gradingFeedback, setGradingFeedback] = useState(null);
    const [dictionaryEntry, setDictionaryEntry] = useState(null);
    const [passage, setPassage] = useState(null);
    const [passageContent, setPassageContent] = useState('');
    const [passageLoading, setPassageLoading] = useState(false);
    const [passageDeliveryDialogOpen, setPassageDeliveryDialogOpen] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });
    const [endSessionPassageReview, setEndSessionPassageReview] = useState(null);
    const [sessionsStudent, setSessionsStudent] = useState(null);
    const [wordFilters, setWordFilters] = useState({ grade: 'KG', week: '', category: '' });
    const [deletingWordId, setDeletingWordId] = useState(null);
    const [correctingAttemptId, setCorrectingAttemptId] = useState(null);
    const [rowLevels, setRowLevels] = useState({});
    const [savingRowId, setSavingRowId] = useState(null);
    const [exportingRowId, setExportingRowId] = useState(null);
    const [rowActionLoadingId, setRowActionLoadingId] = useState(null);
    const [studentHistoryMap, setStudentHistoryMap] = useState({});
    const studentHistoryMapRef = useRef(studentHistoryMap);
    studentHistoryMapRef.current = studentHistoryMap;
    const activeSessionIdRef = useRef(null);
    const [overviewLoading, setOverviewLoading] = useState(false);
    const wordList = spelling.words;
    const wordCategories = spelling.categories;
    const wordsLoading = spelling.wordsLoading;

    const notify = useCallback((text, severity = 'info') => {
        setMessage(text);
        setMessageSeverity(severity);
    }, []);

    const requestConfirm = (title, description, onConfirm) => setConfirmDialog({ open: true, title, description, onConfirm });
    const closeConfirm = () => setConfirmDialog({ open: false, title: '', description: '', onConfirm: null });

    const selectedStudent = useMemo(
        () => classStudents.find((student) => String(student._id) === String(studentId)),
        [classStudents, studentId]
    );

    const applyDefaultsToFields = useCallback((settings) => {
        setMaxMistakesAllowed(settings?.defaultMaxMistakes || 3);
        setEmailNotification(settings?.defaultEmailAudience || 'student-and-parents');
        setPassageEnabled(settings?.passageGeneration?.enabled === true);
        setPassageTrigger(settings?.passageGeneration?.trigger || 'manual');
        setPassageStyle(settings?.passageGeneration?.style || 'sentence-list');
        setPassageEmailAudience(settings?.passageGeneration?.passageEmailAudience || 'none');
        setDictationEnabled(settings?.dictationMode?.enabled === true);
        setDictationAutoPlay(settings?.dictationMode?.autoPlayOnShow !== false);
    }, []);

    useEffect(() => {
        dispatch(fetchClasses({ limit: 100 }));
    }, [dispatch]);

    useEffect(() => {
        if (!classId) return;
        dispatch(fetchSpellingWords(wordFilters.grade ? { grade: wordFilters.grade } : {}));
    }, [classId, dispatch, wordFilters.grade]);

    useEffect(() => {
        if (!classId) return;
        dispatch(fetchClass(classId));
        api.get(`/spelling/classes/${classId}/settings`).then(({ data }) => {
            const settings = data.data;
            setClassDefaults(settings);
            applyDefaultsToFields(settings);
        }).catch(() => {});
        setStudentId('');
        setRowLevels({});
        setSessionOverrideOpen(false);
    }, [classId, dispatch, applyDefaultsToFields]);

    useEffect(() => {
        if (!classId || !classGrade) {
            setClassGradeProgress({ week: null, status: 'loading', error: '' });
            return undefined;
        }
        let cancelled = false;
        setClassGradeProgress((current) => ({ ...current, status: 'loading', error: '' }));
        api.get('/spelling/sessions/class/progress', { params: { classId, grade: classGrade } })
            .then(({ data }) => {
                if (!cancelled) setClassGradeProgress({ ...data.data, error: '' });
            })
            .catch((error) => {
                if (!cancelled) setClassGradeProgress({
                    week: null,
                    status: 'error',
                    error: error.response?.data?.message || t('classProgressError')
                });
            });
        return () => { cancelled = true; };
    }, [classId, classGrade, t]);

    useEffect(() => {
        if (!classStudents.length) return;
        setRowLevels((current) => {
            const next = { ...current };
            classStudents.forEach((student) => {
                if (!next[student._id]) {
                    const grade = student.spelling?.currentGrade || '';
                    next[student._id] = { grade };
                }
            });
            return next;
        });
    }, [classStudents]);

    const refreshStudentHistory = useCallback(async (targetStudentId) => {
        const result = await dispatch(fetchSpellingHistory({ studentId: targetStudentId }));
        if (fetchSpellingHistory.fulfilled.match(result)) {
            setStudentHistoryMap((current) => ({ ...current, [targetStudentId]: result.payload }));
        }
    }, [dispatch]);

    const loadAllHistories = useCallback(async ({ showLoading = true } = {}) => {
        if (!classStudents.length) return;
        if (showLoading) setOverviewLoading(true);
        try {
            const studentIds = classStudents.map((s) => s._id).join(',');
            const result = await dispatch(fetchSpellingHistory({ studentIds, limit: 300 }));
            if (fetchSpellingHistory.fulfilled.match(result)) {
                const sessions = Array.isArray(result.payload) ? result.payload : [];
                const map = {};
                classStudents.forEach((student) => { map[student._id] = []; });
                sessions.forEach((session) => {
                    const sid = String(session.student?._id || session.student);
                    if (map[sid]) {
                        map[sid].push(session);
                    }
                });
                setStudentHistoryMap(map);
            }
        } finally {
            if (showLoading) setOverviewLoading(false);
        }
    }, [classStudents, dispatch]);

    useEffect(() => {
        if (!classId || !classStudents.length) {
            setStudentHistoryMap({});
            return;
        }
        loadAllHistories();
    }, [classId, classStudents, loadAllHistories]);

    useEffect(() => {
        if (!classId || !classStudents.length) return undefined;
        // Check if any student currently has an active in-progress session
        const hasActiveSession = classStudents.some((student) => {
            const sessions = studentHistoryMapRef.current[student._id] || [];
            return sessions.some((session) => session.status === 'in-progress');
        });

        // Use a single batched query: 5s when sessions are active, 20s when idle
        const pollMs = hasActiveSession ? 5000 : 20000;
        const intervalId = window.setInterval(() => {
            loadAllHistories({ showLoading: false });
        }, pollMs);
        return () => window.clearInterval(intervalId);
    }, [classId, classStudents, loadAllHistories, studentHistoryMap]);

    const updateRowLevel = async (student, field, value) => {
        const nextLevel = { ...(rowLevels[student._id] || {}), [field]: value };
        setRowLevels((current) => ({ ...current, [student._id]: nextLevel }));
        if (!nextLevel.grade) return;
        setSavingRowId(student._id);
        const gradeChanged = field === 'grade' && value !== student.spelling?.currentGrade;
        const savedGradeProgress = student.spelling?.progressByGrade?.find((progress) => progress.grade === value);
        const result = await dispatch(updateStudent({
            id: student._id,
            data: {
                spelling: {
                    ...(student.spelling || {}),
                    currentGrade: nextLevel.grade,
                    ...(gradeChanged ? {
                        currentWeek: savedGradeProgress?.week ?? null,
                        lastWordIndex: savedGradeProgress?.lastWordIndex ?? 0
                    } : {})
                }
            }
        }));
        notify(
            updateStudent.fulfilled.match(result) ? t('studentLevelSaved') : (result.payload || t('studentLevelSaveError')),
            updateStudent.fulfilled.match(result) ? 'success' : 'error'
        );
        setSavingRowId(null);
    };

    useEffect(() => {
        if (!currentItem?.word) {
            setDictionaryEntry(null);
            return;
        }
        let cancelled = false;
        dispatch(fetchSpellingDictionaryEntry(currentItem.word)).then((result) => {
            if (!cancelled && fetchSpellingDictionaryEntry.fulfilled.match(result)) {
                setDictionaryEntry(result.payload);
            }
        });
        return () => { cancelled = true; };
    }, [currentItem?.word, dispatch]);

    const loadCurrentItem = useCallback(async (sessionId) => {
        const result = await dispatch(fetchSpellingCurrentItem(sessionId));
        // Only update active session and modal state if the modal for this session is still open
        if (activeSessionIdRef.current === sessionId && fetchSpellingCurrentItem.fulfilled.match(result)) {
            setActiveSession(result.payload.session);
            setCurrentItem(result.payload.item);
        }
    }, [dispatch]);

    const loadIntegrityEvents = useCallback(async (sessionId) => {
        try {
            const response = await api.get(`/spelling/sessions/${sessionId}/integrity-events`);
            if (activeSessionIdRef.current === sessionId) {
                setIntegrityEvents(response.data.data);
            }
        } catch (error) {
            if (activeSessionIdRef.current === sessionId) {
                setIntegrityEvents((current) => ({
                    ...current,
                    error: error.response?.data?.message || 'Unable to load page visibility events.'
                }));
            }
        }
    }, []);

    const startStudentSession = async (student) => {
        const level = rowLevels[student._id] || {};
        if (!student._id || !level.grade) return;
        setRowActionLoadingId(student._id);
        setMessage('');
        try {
            const result = await dispatch(startTeacherSpellingSession({
                studentId: student._id,
                curriculumGrade: level.grade,
                mode: assessmentMode,
                emailNotification,
                passageEmailAudience,
                passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: true },
                maxMistakesAllowed
            }));
            if (startTeacherSpellingSession.fulfilled.match(result)) {
                if (result.payload.curriculumGrade && result.payload.curriculumGrade !== level.grade) {
                    setRowLevels((current) => ({
                        ...current,
                        [student._id]: { ...(current[student._id] || {}), grade: result.payload.curriculumGrade }
                    }));
                }
                // In teacher-led mode, open the live grading modal immediately.
                // In self-serve mode, the student works independently on their device; keep the teacher on the roster.
                if (assessmentMode === 'teacher-led') {
                    setStudentId(student._id);
                    activeSessionIdRef.current = result.payload._id;
                    await loadCurrentItem(result.payload._id);
                } else {
                    notify(t('sessionStarted', { name: `${student.firstName} ${student.lastName}` }) || 'Session started for student', 'success');
                }
            } else {
                notify(result.payload || t('sessionError'), 'error');
            }
            await refreshStudentHistory(student._id);
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to start the session.', 'error');
        } finally {
            setRowActionLoadingId(null);
        }
    };

    const performEndRowActiveSession = async (student, rowActiveSession) => {
        setRowActionLoadingId(student._id);
        try {
            const result = await dispatch(endSpellingSession({ sessionId: rowActiveSession._id, reason: 'teacher-ended' }));
            const succeeded = endSpellingSession.fulfilled.match(result);
            notify(succeeded ? t('activeSessionEnded') : (result.payload || t('sessionError')), succeeded ? 'success' : 'error');
            if (succeeded) await refreshStudentHistory(student._id);
            return succeeded;
        } finally {
            setRowActionLoadingId(null);
        }
    };

    const endRowActiveSession = async (student) => {
        const studentSessions = studentHistoryMap[student._id] || [];
        const rowActiveSession = studentSessions.find((session) => session.status === 'in-progress');
        if (!rowActiveSession) return;

        const currentSessionSentPassage = studentSessions.find(
            (session) => String(session._id) === String(rowActiveSession._id) && session.practicePassage?.status === 'sent'
        );
        if (currentSessionSentPassage) {
            setRowActionLoadingId(student._id);
            try {
                const response = await api.get(`/spelling/sessions/${rowActiveSession._id}/passage`);
                const sentPassage = response.data?.data;
                if (sentPassage?.status !== 'sent' || !String(sentPassage.content || '').trim()) {
                    throw new Error('Sent passage text is unavailable. The active session was not ended.');
                }
                setEndSessionPassageReview({ student, session: rowActiveSession, passage: sentPassage });
            } catch (error) {
                notify(error.response?.data?.message || error.message || 'Unable to load the sent passage. The active session was not ended.', 'error');
            } finally {
                setRowActionLoadingId(null);
            }
            return;
        }

        requestConfirm(
            'End active session?',
            `This will end ${student.firstName || 'this student'}'s in-progress spelling session. This cannot be undone.`,
            () => performEndRowActiveSession(student, rowActiveSession)
        );
    };

    const exportStudentReport = async (student) => {
        setExportingRowId(student._id);
        try {
            await downloadStudentSpellingDetailsDocx({
                studentId: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                locale: i18n.resolvedLanguage || i18n.language
            });
        } catch (error) {
            notify(error.response?.data?.message || t('exportError'), 'error');
        } finally {
            setExportingRowId(null);
        }
    };

    const startClassSession = async () => {
        if (!classStudents.length) return;
        setClassStarting(true);
        setMessage('');
        try {
            const response = await api.post('/spelling/sessions/class', {
                classId,
                mode: assessmentMode,
                maxMistakesAllowed,
                curriculumGrade: classGrade,
                emailNotification,
                passageEmailAudience,
                passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: true }
            });
            notify(t('classCreated', {
                count: response.data.data.sessions.length,
                className: selectedClass?.name || t('class')
            }), 'success');
            await loadAllHistories();
        } catch (error) {
            notify(error.response?.data?.message || t('sessionError'), 'error');
        } finally {
            setClassStarting(false);
        }
    };

    const gradeAttempt = useCallback(async (correct) => {
        if (!activeSession || !currentItem || loading || gradingFeedback) return;
        setLoading(true);
        try {
            const result = await dispatch(submitTeacherSpellingAttempt({ sessionId: activeSession._id, sequence: currentItem.sequence, correct }));
            if (submitTeacherSpellingAttempt.fulfilled.match(result)) {
                setGradingFeedback({ correct, session: result.payload.session });
                await new Promise((resolve) => setTimeout(resolve, 450));
                setGradingFeedback(null);
                if (result.payload.session.status === 'in-progress') {
                    await loadCurrentItem(activeSession._id);
                } else {
                    setActiveSession(result.payload.session);
                    setCurrentItem(null);
                    await refreshStudentHistory(studentId);
                }
            }
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to record the attempt.', 'error');
        } finally {
            setLoading(false);
        }
    }, [activeSession, currentItem, dispatch, gradingFeedback, loadCurrentItem, loading, notify, refreshStudentHistory, studentId]);

    const correctSpellingAttempt = async (attempt) => {
        if (!activeSession?._id || !attempt?._id || correctingAttemptId) return false;
        setCorrectingAttemptId(String(attempt._id));
        try {
            const response = await api.patch(`/spelling/sessions/${activeSession._id}/attempts/${attempt._id}/correct`);
            const result = response.data.data;
            if (activeSessionIdRef.current === activeSession._id) setActiveSession(result.session);
            await refreshStudentHistory(studentId);
            notify('Spelling answer marked correct; score and retest list updated.', 'success');
            return true;
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to correct the spelling attempt.', 'error');
            return false;
        } finally {
            setCorrectingAttemptId(null);
        }
    };

    const advanceClassWord = useCallback(async () => {
        if (!activeSession || !currentItem || loading) return;
        setLoading(true);
        try {
            const response = await api.post(`/spelling/sessions/${activeSession._id}/advance-class-word`, { wordId: currentItem.wordId });
            const { session, item } = response.data.data;
            if (activeSessionIdRef.current === activeSession._id) {
                setActiveSession(session);
                setCurrentItem(item);
                if (session.status !== 'in-progress') await refreshStudentHistory(studentId);
            }
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to move to the next word.', 'error');
        } finally {
            setLoading(false);
        }
    }, [activeSession, currentItem, loading, notify, refreshStudentHistory, studentId]);

    const closeTeacherSessionModal = () => {
        activeSessionIdRef.current = null;
        setActiveSession(null);
        setCurrentItem(null);
        setGradingFeedback(null);
        setPassage(null);
        setPassageContent('');
    };

    const handleEndSessionExplicitly = () => {
        if (!activeSession) return;
        requestConfirm(
            'End this session?',
            'The student has not finished. Ending this session will complete it now and it cannot be resumed.',
            async () => {
                if (activeSession.status === 'in-progress') {
                    await dispatch(endSpellingSession({ sessionId: activeSession._id, reason: 'teacher-ended' }));
                    if (studentId) await refreshStudentHistory(studentId);
                }
                closeTeacherSessionModal();
            }
        );
    };

    const openSessionReview = async (student, session) => {
        activeSessionIdRef.current = session._id;
        setSessionsStudent(null);
        setStudentId(student._id);
        setActiveSession(session);
        setCurrentItem(null);
        setGradingFeedback(null);
        setIntegrityEvents({ count: 0, events: [], error: '' });
        if (session.status === 'in-progress') {
            await loadCurrentItem(session._id);
        }
        if (session.practicePassage) {
            setPassage(session.practicePassage);
            setPassageContent(session.practicePassage.content || '');
        } else {
            setPassage(null);
            setPassageContent('');
        }
    };

    const generatePassage = async () => {
        if (!activeSession) return;
        setPassageLoading(true);
        try {
            const style = passage?.style || activeSession.passageGeneration?.style || 'sentence-list';
            const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/generate`, { style });
            setPassage(response.data.data);
            setPassageContent(response.data.data.content || '');
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to generate the practice passage.', 'error');
        } finally {
            setPassageLoading(false);
        }
    };

    const updatePassage = async () => {
        if (!activeSession || !passageContent.trim()) return;
        setPassageLoading(true);
        try {
            const response = await api.patch(`/spelling/sessions/${activeSession._id}/passage`, { content: passageContent });
            setPassage(response.data.data);
            notify('Practice passage saved.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to save the practice passage.', 'error');
        } finally {
            setPassageLoading(false);
        }
    };

    const approvePassage = async () => {
        if (!activeSession) return;
        setPassageLoading(true);
        try {
            const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/approve`);
            setPassage(response.data.data);
            notify('Practice passage approved.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to approve the practice passage.', 'error');
        } finally {
            setPassageLoading(false);
        }
    };

    const discardPassage = async () => {
        if (!activeSession) return;
        setPassageLoading(true);
        try {
            const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/discard`);
            setPassage(response.data.data);
            notify('Practice passage discarded.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to discard the practice passage.', 'error');
        } finally {
            setPassageLoading(false);
        }
    };

    const sendPassage = async () => {
        if (!activeSession) return;
        setPassageLoading(true);
        try {
            const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/send`);
            setPassage((current) => ({ ...current, status: 'queued', emailDeliveryId: response.data.data._id }));
            notify('Practice passage queued for delivery.', 'success');
            setPassageDeliveryDialogOpen(true);
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to send the practice passage.', 'error');
        } finally {
            setPassageLoading(false);
        }
    };

    const cancelPassageSend = async () => {
        if (!activeSession) return;
        setPassageLoading(true);
        try {
            const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/cancel-send`);
            setPassage(response.data.data);
            setPassageContent(response.data.data.content || '');
            notify('Queued passage email cancelled. You can edit or discard the passage.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to cancel the passage email.', 'error');
        } finally {
            setPassageLoading(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!activeSession || !currentItem || gradingFeedback || loading) return;
            if (event.key.toLowerCase() === 'y' || event.key === 'ArrowRight') gradeAttempt(true);
            if (event.key.toLowerCase() === 'n' || event.key === 'ArrowLeft') gradeAttempt(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeSession, currentItem, gradeAttempt, gradingFeedback, loading]);

    useEffect(() => {
        if (!activeSession?._id) {
            activeSessionIdRef.current = null;
            return undefined;
        }
        const sessionId = activeSession._id;
        activeSessionIdRef.current = sessionId;
        setIntegrityEvents({ count: 0, events: [], error: '' });
        loadIntegrityEvents(sessionId);
        if (activeSession.status !== 'in-progress') return undefined;
        const refreshLiveSession = () => {
            if (activeSessionIdRef.current !== sessionId) return;
            loadIntegrityEvents(sessionId);
            if (activeSession.mode === 'self-serve') loadCurrentItem(sessionId);
        };
        const intervalId = window.setInterval(refreshLiveSession, 3000);
        return () => window.clearInterval(intervalId);
    }, [activeSession?._id, activeSession?.mode, activeSession?.status, loadCurrentItem, loadIntegrityEvents]);

    const missedWords = activeSession?.attempts?.filter((attempt) => !attempt.correct) || [];
    const skippedWords = activeSession?.mode === 'self-serve'
        ? activeSession.attempts?.filter(isSkippedSpellingAttempt) || []
        : [];
    const mistakesAllowed = activeSession?.maxMistakesAllowed || 3;
    const mistakePips = Array.from({ length: mistakesAllowed }, (_, index) => index < (activeSession?.mistakeCount || 0));

    const previewWordList = async () => {
        if (!importFile) return;
        setImporting(true);
        setMessage('');
        try {
            const formData = new FormData();
            formData.append('file', importFile);
            const response = await api.post('/spelling/word-lists/import/preview', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setImportPreview(response.data.data);
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to preview the word list.', 'error');
        } finally {
            setImporting(false);
        }
    };

    const commitWordList = async (replace = false) => {
        if (!importPreview?.importId) return;
        setImporting(true);
        try {
            const response = await api.post('/spelling/word-lists/import/commit', { importId: importPreview.importId, replace: replace === true });
            const result = response.data.data;
            if (result.idempotent) {
                notify(t('importAlreadyApplied'), 'success');
            } else if (result.replaced) {
                notify(t('replacedWords', { inserted: result.insertedRows || 0, kept: result.updatedRows || 0, removed: result.removedRows || 0 }), 'success');
            } else {
                notify(t('importedWords', { inserted: result.insertedRows || 0, updated: result.updatedRows || 0 }), 'success');
            }
            dispatch(fetchSpellingWords(wordFilters.grade ? { grade: wordFilters.grade } : {}));
            setImportPreview(null);
            setImportFile(null);
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to import the word list.', 'error');
        } finally {
            setImporting(false);
        }
    };

    const deleteCurriculumWord = async (word) => {
        if (!word?._id || deletingWordId) return false;
        setDeletingWordId(String(word._id));
        try {
            await api.delete(`/spelling/word-lists/${word._id}`);
            await dispatch(fetchSpellingWords(wordFilters.grade ? { grade: wordFilters.grade } : {}));
            notify('Word removed from the shared curriculum.', 'success');
            return true;
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to remove the curriculum word.', 'error');
            return false;
        } finally {
            setDeletingWordId(null);
        }
    };

    const saveClassSettings = async () => {
        if (!classId) return;
        try {
            const payload = {
                defaultMaxMistakes: maxMistakesAllowed,
                defaultEmailAudience: emailNotification,
                passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: true, passageEmailAudience }
                ,dictationMode: { enabled: dictationEnabled, autoPlayOnShow: dictationAutoPlay }
            };
            await api.patch(`/spelling/classes/${classId}/settings`, payload);
            setClassDefaults(payload);
            notify('Spelling settings saved.', 'success');
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to save spelling settings.', 'error');
        }
    };

    const toggleSessionOverride = () => {
        if (sessionOverrideOpen) applyDefaultsToFields(classDefaults);
        setSessionOverrideOpen((open) => !open);
    };

    return (
        <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={{ xs: 2, md: 4 }} sx={{ mb: 3 }}>
                <Box>
                    <Typography variant="h4" gutterBottom>{t('teacherTitle')}</Typography>
                    <Typography color="text.secondary">{t('teacherDescription')}</Typography>
                </Box>
                <FormControl sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
                    <InputLabel>{t('class')}</InputLabel>
                    <Select value={classId} label={t('class')} onChange={(event) => selectClass(event.target.value)} disabled={classesLoading}>
                        {classes.map((schoolClass) => <MenuItem key={schoolClass._id} value={schoolClass._id}>{schoolClass.name}{schoolClass.section ? ` - ${schoolClass.section}` : ''}</MenuItem>)}
                    </Select>
                </FormControl>
            </Stack>
            {message && (
                <Alert severity={messageSeverity} sx={{ mb: 2 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}

            <EndSessionPassageReviewDialog
                review={endSessionPassageReview}
                rowActionLoadingId={rowActionLoadingId}
                onClose={() => setEndSessionPassageReview(null)}
                onEnd={async () => {
                    const review = endSessionPassageReview;
                    if (!review) return;
                    const ended = await performEndRowActiveSession(review.student, review.session);
                    if (ended) setEndSessionPassageReview(null);
                }}
            />

            <ConfirmDialog dialog={confirmDialog} onClose={closeConfirm} />

            <StudentSessionsDialog
                student={sessionsStudent}
                sessions={sessionsStudent ? (studentHistoryMap[sessionsStudent._id] || []) : []}
                onClose={() => setSessionsStudent(null)}
                onOpenSession={openSessionReview}
            />

            <TeacherSessionDialog
                activeSession={activeSession}
                onClose={closeTeacherSessionModal}
                onEndSession={handleEndSessionExplicitly}
                selectedStudent={selectedStudent}
                t={t}
                integrityEvents={integrityEvents}
                missedWords={missedWords}
                skippedWords={skippedWords}
                passage={passage}
                passageContent={passageContent}
                setPassageContent={setPassageContent}
                passageLoading={passageLoading}
                onGeneratePassage={generatePassage}
                onUpdatePassage={updatePassage}
                onApprovePassage={approvePassage}
                onSendPassage={sendPassage}
                onDiscardPassage={discardPassage}
                onCancelPassageSend={cancelPassageSend}
                passageStatusColor={PASSAGE_STATUS_COLOR}
                currentItem={currentItem}
                mistakesAllowed={mistakesAllowed}
                mistakePips={mistakePips}
                gradingFeedback={gradingFeedback}
                dictionaryEntry={dictionaryEntry}
                loading={loading}
                onGradeAttempt={gradeAttempt}
                onNextClassWord={advanceClassWord}
                onMarkAttemptCorrect={correctSpellingAttempt}
                correctingAttemptId={correctingAttemptId}
            />

            <PassageDeliveryDialog open={passageDeliveryDialogOpen} onClose={() => setPassageDeliveryDialogOpen(false)} />

            {classId && <>
            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
                <Tab label="Assessments" />
                <Tab label="Curriculum & import" />
                <Tab label="Settings" />
            </Tabs>

            {activeTab === 1 && <SpellingCurriculumTab
                wordFilters={wordFilters}
                setWordFilters={(updater) => setWordFilters((current) => {
                    const next = typeof updater === 'function' ? updater(current) : updater;
                    if (next.grade && next.grade !== 'KG' && Number(next.week) > 36) return { ...next, week: '' };
                    return next;
                })}
                wordCategories={wordCategories}
                wordList={wordList}
                wordsLoading={wordsLoading}
                importFile={importFile}
                setImportFile={setImportFile}
                setImportPreview={setImportPreview}
                importPreview={importPreview}
                importing={importing}
                onPreviewWordList={previewWordList}
                onCommitWordList={commitWordList}
                onDeleteWord={deleteCurriculumWord}
                deletingWordId={deletingWordId}
            />}

            {activeTab === 0 && <>
                <SpellingClassSessionControls
                    t={t}
                    assessmentMode={assessmentMode}
                    setAssessmentMode={setAssessmentMode}
                    classGrade={classGrade}
                    setClassGrade={setClassGrade}
                    classGradeProgress={classGradeProgress}
                    startClassSession={startClassSession}
                    classId={classId}
                    classStudents={classStudents}
                    classStarting={classStarting}
                    maxMistakesAllowed={maxMistakesAllowed}
                    setMaxMistakesAllowed={setMaxMistakesAllowed}
                    emailNotification={emailNotification}
                    setEmailNotification={setEmailNotification}
                    passageEmailAudience={passageEmailAudience}
                    setPassageEmailAudience={setPassageEmailAudience}
                    passageEnabled={passageEnabled}
                    setPassageEnabled={setPassageEnabled}
                    passageTrigger={passageTrigger}
                    setPassageTrigger={setPassageTrigger}
                    passageStyle={passageStyle}
                    setPassageStyle={setPassageStyle}
                    sessionOverrideOpen={sessionOverrideOpen}
                    toggleSessionOverride={toggleSessionOverride}
                />
                {classId && <SpellingStudentRosterTable
                    selectedClass={selectedClass}
                    classStudents={classStudents}
                    overviewLoading={overviewLoading}
                    rowLevels={rowLevels}
                    studentHistoryMap={studentHistoryMap}
                    rowActionLoadingId={rowActionLoadingId}
                    savingRowId={savingRowId}
                    exportingRowId={exportingRowId}
                    onUpdateRowLevel={updateRowLevel}
                    onOpenSessionReview={openSessionReview}
                    onViewStudentSessions={setSessionsStudent}
                    onEndActiveSession={endRowActiveSession}
                    onStartStudentSession={startStudentSession}
                    onExportStudentReport={exportStudentReport}
                />}
            </>}

            {activeTab === 2 && <SpellingSettingsTab
                maxMistakesAllowed={maxMistakesAllowed}
                setMaxMistakesAllowed={setMaxMistakesAllowed}
                emailNotification={emailNotification}
                setEmailNotification={setEmailNotification}
                passageEmailAudience={passageEmailAudience}
                setPassageEmailAudience={setPassageEmailAudience}
                passageEnabled={passageEnabled}
                setPassageEnabled={setPassageEnabled}
                passageTrigger={passageTrigger}
                setPassageTrigger={setPassageTrigger}
                passageStyle={passageStyle}
                setPassageStyle={setPassageStyle}
                dictationEnabled={dictationEnabled}
                setDictationEnabled={setDictationEnabled}
                dictationAutoPlay={dictationAutoPlay}
                setDictationAutoPlay={setDictationAutoPlay}
                onSave={saveClassSettings}
            />}
            </>}
        </Box>
    );
};

export default SpellingTeacherPage;
