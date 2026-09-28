import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Fade, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Tab, TextField, Typography } from '@mui/material';
import { HiOutlineCheck, HiOutlineXMark, HiOutlineArrowLeft, HiOutlineClock } from 'react-icons/hi2';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import './SpellingTeacherPage.css';
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

const PASSAGE_STATUS_COLOR = { draft: 'warning', approved: 'info', sent: 'success', failed: 'error' };

const isSkippedSpellingAttempt = (attempt) => attempt?.skipped === true || (
    attempt?.skipped === undefined && !String(attempt?.studentInput ?? '').trim()
);

const SpellingTeacherPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation('spelling');
    const classes = useSelector(selectClasses);
    const classStudents = useSelector(selectClassStudents);
    const selectedClass = useSelector(selectCurrentClass);
    const classesLoading = useSelector(selectClassesLoading);
    const spelling = useSelector(selectSpelling);
    const [classId, setClassId] = useState('');
    const [activeTab, setActiveTab] = useState(0);
    const [studentId, setStudentId] = useState('');
    const [activeSession, setActiveSession] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
    const [integrityEvents, setIntegrityEvents] = useState({ count: 0, events: [], error: '' });
    const [message, setMessage] = useState('');
    const [messageSeverity, setMessageSeverity] = useState('info');
    const [loading, setLoading] = useState(false);
    const [classStarting, setClassStarting] = useState(false);
    const [assessmentMode, setAssessmentMode] = useState('self-serve');
    const [maxMistakesAllowed, setMaxMistakesAllowed] = useState(3);
    const [emailNotification, setEmailNotification] = useState('student-and-parents');
    const [passageEmailAudience, setPassageEmailAudience] = useState('none');
    const [passageEnabled, setPassageEnabled] = useState(false);
    const [passageTrigger, setPassageTrigger] = useState('manual');
    const [passageStyle, setPassageStyle] = useState('sentence-list');
    const [passageApproval, setPassageApproval] = useState(true);
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
    const [wordFilters, setWordFilters] = useState({ grade: 'KG', week: '1', category: '' });
    const [rowLevels, setRowLevels] = useState({});
    const [savingRowId, setSavingRowId] = useState(null);
    const [exportingRowId, setExportingRowId] = useState(null);
    const [rowActionLoadingId, setRowActionLoadingId] = useState(null);
    const [studentHistoryMap, setStudentHistoryMap] = useState({});
    const studentHistoryMapRef = useRef(studentHistoryMap);
    studentHistoryMapRef.current = studentHistoryMap;
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
        setPassageApproval(settings?.passageGeneration?.requireTeacherApproval !== false);
        setPassageEmailAudience(settings?.passageGeneration?.passageEmailAudience || 'none');
        setDictationEnabled(settings?.dictationMode?.enabled === true);
        setDictationAutoPlay(settings?.dictationMode?.autoPlayOnShow !== false);
    }, []);

    useEffect(() => {
        dispatch(fetchClasses({ limit: 100 }));
    }, [dispatch]);

    useEffect(() => {
        if (!classId) return;
        dispatch(fetchSpellingWords(wordFilters));
    }, [classId, dispatch, wordFilters]);

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
        if (!classStudents.length) return;
        setRowLevels((current) => {
            const next = { ...current };
            classStudents.forEach((student) => {
                if (!next[student._id]) {
                    next[student._id] = {
                        grade: student.spelling?.currentGrade || '',
                        week: student.spelling?.currentWeek ? String(student.spelling.currentWeek) : ''
                    };
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
            const entries = await Promise.all(classStudents.map(async (student) => {
                const result = await dispatch(fetchSpellingHistory({ studentId: student._id }));
                return [student._id, fetchSpellingHistory.fulfilled.match(result) ? result.payload : []];
            }));
            setStudentHistoryMap(Object.fromEntries(entries));
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
        const intervalId = window.setInterval(() => {
            classStudents.forEach((student) => {
                const sessions = studentHistoryMapRef.current[student._id] || [];
                if (sessions.some((session) => session.status === 'in-progress')) {
                    refreshStudentHistory(student._id);
                }
            });
        }, 2500);
        return () => window.clearInterval(intervalId);
    }, [classId, classStudents, refreshStudentHistory]);

    useEffect(() => {
        if (!classId || !classStudents.length) return undefined;
        const intervalId = window.setInterval(() => loadAllHistories({ showLoading: false }), 10000);
        return () => window.clearInterval(intervalId);
    }, [classId, classStudents.length, loadAllHistories]);

    const updateRowLevel = async (student, field, value) => {
        const nextLevel = { ...(rowLevels[student._id] || {}), [field]: value };
        setRowLevels((current) => ({ ...current, [student._id]: nextLevel }));
        if (!nextLevel.grade || !nextLevel.week) return;
        setSavingRowId(student._id);
        const result = await dispatch(updateStudent({
            id: student._id,
            data: {
                spelling: {
                    ...(student.spelling || {}),
                    currentGrade: nextLevel.grade,
                    currentWeek: Number(nextLevel.week)
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
        if (fetchSpellingCurrentItem.fulfilled.match(result)) {
            setActiveSession(result.payload.session);
            setCurrentItem(result.payload.item);
        }
    }, [dispatch]);

    const loadIntegrityEvents = useCallback(async (sessionId) => {
        try {
            const response = await api.get(`/spelling/sessions/${sessionId}/integrity-events`);
            setIntegrityEvents(response.data.data);
        } catch (error) {
            setIntegrityEvents((current) => ({
                ...current,
                error: error.response?.data?.message || 'Unable to load page visibility events.'
            }));
        }
    }, []);

    const startStudentSession = async (student) => {
        const level = rowLevels[student._id] || {};
        if (!student._id || !level.grade || !level.week) return;
        setRowActionLoadingId(student._id);
        setMessage('');
        try {
            const result = await dispatch(startTeacherSpellingSession({
                studentId: student._id,
                curriculumGrade: level.grade,
                curriculumWeek: level.week,
                mode: assessmentMode,
                emailNotification,
                passageEmailAudience,
                passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: passageApproval },
                maxMistakesAllowed
            }));
            if (startTeacherSpellingSession.fulfilled.match(result)) {
                setStudentId(student._id);
                await loadCurrentItem(result.payload._id);
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
        const result = await dispatch(endSpellingSession({ sessionId: rowActiveSession._id, reason: 'teacher-ended' }));
        notify(
            endSpellingSession.fulfilled.match(result) ? t('activeSessionEnded') : (result.payload || t('sessionError')),
            endSpellingSession.fulfilled.match(result) ? 'success' : 'error'
        );
        await refreshStudentHistory(student._id);
        setRowActionLoadingId(null);
    };

    const endRowActiveSession = (student) => {
        const rowActiveSession = (studentHistoryMap[student._id] || []).find((session) => session.status === 'in-progress');
        if (!rowActiveSession) return;
        requestConfirm(
            'End active session?',
            `This will end ${student.firstName || 'this student'}'s in-progress spelling session. This cannot be undone.`,
            () => performEndRowActiveSession(student, rowActiveSession)
        );
    };

    const exportStudentReport = async (student) => {
        setExportingRowId(student._id);
        try {
            const response = await api.get(`/spelling/reports/student/${student._id}/docx`, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `spelling-${student.firstName || 'student'}-${student.lastName || 'report'}.docx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
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
        let started = 0;
        try {
            for (const student of classStudents) {
                await api.post('/spelling/sessions', {
                    studentId: student._id,
                    mode: assessmentMode,
                    maxMistakesAllowed,
                    curriculumGrade: wordFilters.grade,
                    curriculumWeek: wordFilters.week,
                    emailNotification,
                    passageEmailAudience,
                    passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: passageApproval }
                });
                started += 1;
            }
            notify(t('classCreated', { count: started, className: selectedClass?.name || t('class') }), 'success');
            await loadAllHistories();
        } catch (error) {
            notify(error.response?.data?.message || t('classStopped', { count: started }), 'error');
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

    const performExitTeacherSession = async () => {
        if (!activeSession) return;
        if (activeSession.status === 'in-progress') {
            await dispatch(endSpellingSession({ sessionId: activeSession._id, reason: 'teacher-ended' }));
        }
        setActiveSession(null);
        setCurrentItem(null);
        setGradingFeedback(null);
        setPassage(null);
        setPassageContent('');
    };

    const exitTeacherSession = () => {
        if (!activeSession) return;
        if (activeSession.status === 'in-progress') {
            requestConfirm(
                'End this session?',
                'The student has not finished. Leaving now will end the active session and it cannot be resumed.',
                performExitTeacherSession
            );
        } else {
            performExitTeacherSession();
        }
    };

    const openSessionReview = async (student, session) => {
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
            const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/generate`, { style: 'sentence-list' });
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
            setPassage((current) => ({ ...current, status: 'approved', emailDeliveryId: response.data.data._id }));
            notify('Practice passage queued for delivery.', 'success');
            setPassageDeliveryDialogOpen(true);
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to send the practice passage.', 'error');
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
        if (!activeSession?._id) return undefined;
        const sessionId = activeSession._id;
        setIntegrityEvents({ count: 0, events: [], error: '' });
        loadIntegrityEvents(sessionId);
        if (activeSession.status !== 'in-progress') return undefined;
        const refreshLiveSession = () => {
            loadIntegrityEvents(sessionId);
            if (activeSession.mode === 'self-serve') loadCurrentItem(sessionId);
        };
        const intervalId = window.setInterval(refreshLiveSession, 1500);
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

    const commitWordList = async () => {
        if (!importPreview?.importId) return;
        setImporting(true);
        try {
            const response = await api.post('/spelling/word-lists/import/commit', { importId: importPreview.importId });
            const result = response.data.data;
            if (result.idempotent) {
                notify(t('importAlreadyApplied'), 'success');
            } else {
                notify(t('importedWords', { inserted: result.insertedRows || 0, updated: result.updatedRows || 0 }), 'success');
            }
            setImportPreview(null);
            setImportFile(null);
        } catch (error) {
            notify(error.response?.data?.message || 'Unable to import the word list.', 'error');
        } finally {
            setImporting(false);
        }
    };

    const saveClassSettings = async () => {
        if (!classId) return;
        try {
            const payload = {
                defaultMaxMistakes: maxMistakesAllowed,
                defaultEmailAudience: emailNotification,
                passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: passageApproval, passageEmailAudience }
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
                    <Select value={classId} label={t('class')} onChange={(event) => { setClassId(event.target.value); setActiveTab(0); }} disabled={classesLoading}>
                        {classes.map((schoolClass) => <MenuItem key={schoolClass._id} value={schoolClass._id}>{schoolClass.name}{schoolClass.section ? ` - ${schoolClass.section}` : ''}</MenuItem>)}
                    </Select>
                </FormControl>
            </Stack>
            {message && (
                <Alert severity={messageSeverity} sx={{ mb: 2 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}

            <Dialog open={confirmDialog.open} onClose={closeConfirm} maxWidth="xs" fullWidth>
                <DialogTitle>{confirmDialog.title}</DialogTitle>
                <DialogContent><Typography>{confirmDialog.description}</Typography></DialogContent>
                <DialogActions>
                    <Button onClick={closeConfirm}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={() => { confirmDialog.onConfirm?.(); closeConfirm(); }}
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog fullScreen open={Boolean(activeSession)} onClose={exitTeacherSession}>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', p: { xs: 2, md: 5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <IconButton aria-label="Exit session" onClick={exitTeacherSession}><HiOutlineArrowLeft /></IconButton>
                            <Box>
                                <Typography variant="overline">
                                    {activeSession?.status === 'in-progress'
                                        ? t('activeAssessment', { name: `${selectedStudent?.firstName || ''} ${selectedStudent?.lastName || ''}` })
                                        : `Reviewing session - ${selectedStudent?.firstName || ''} ${selectedStudent?.lastName || ''}`}
                                </Typography>
                                <Typography variant="h5">{activeSession?.mode === 'self-serve' ? t('selfServe') : t('teacherLed')}</Typography>
                                <Typography variant="body2" color="text.secondary">{t('currentWeek', { grade: activeSession?.curriculumGrade, week: activeSession?.curriculumWeek })}</Typography>
                            </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center"><HiOutlineClock /><Typography>{t('wordCount', { count: activeSession?.attempts?.length || 0 })}</Typography></Stack>
                    </Stack>
                    <Box sx={{ width: '100%', maxWidth: 900, mx: 'auto', mb: 2 }}>
                        <Alert severity="info">
                            Page left view: {integrityEvents.count} {integrityEvents.count === 1 ? 'time' : 'times'}
                        </Alert>
                        {integrityEvents.error && <Alert severity="warning" sx={{ mt: 1 }}>{integrityEvents.error}</Alert>}
                        {integrityEvents.events.length > 0 && (
                            <Stack spacing={0.5} sx={{ mt: 1, maxHeight: 120, overflowY: 'auto' }} aria-label="Page visibility event details">
                                {integrityEvents.events.map((event) => (
                                    <Typography key={event.eventId} variant="body2" color="text.secondary">
                                        {new Date(event.receivedAt).toLocaleString()}
                                        {event.sequence ? ` - During word ${event.sequence}` : ''}
                                    </Typography>
                                ))}
                            </Stack>
                        )}
                    </Box>
                    <Box sx={{ maxWidth: 900, width: '100%', mx: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {activeSession?.status !== 'in-progress' ? (
                            <Card sx={{ width: '100%', maxWidth: 700, p: { xs: 2, md: 5 } }}>
                                <CardContent>
                                    <Stack spacing={3} alignItems="center">
                                        <HiOutlineCheck size={54} color="currentColor" />
                                        <Typography variant="h3" textAlign="center">{t('sessionCompleted')}</Typography>
                                        <Typography variant="h5">{t('correctCount', { count: activeSession?.correctCount || 0 })} | {t('mistakeCount', { count: activeSession?.mistakeCount || 0 })}</Typography>
                                        <Typography color="text.secondary">{t('retests', { count: missedWords.length })}</Typography>
                                        {missedWords.length > 0 && (
                                            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                                                {missedWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} icon={<HiOutlineXMark />} label={attempt.wordSnapshot} color="error" variant="outlined" />)}
                                            </Stack>
                                        )}
                                        {skippedWords.length > 0 && (
                                            <Box sx={{ width: '100%' }}>
                                                <Typography variant="subtitle1">{t('skippedWordsToSay')}</Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('skippedWordsFollowUp')}</Typography>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                                                    {skippedWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} label={attempt.wordSnapshot} color="warning" variant="outlined" />)}
                                                </Stack>
                                            </Box>
                                        )}
                                        {!passage && (
                                            <Button variant="outlined" onClick={generatePassage} disabled={passageLoading || missedWords.length === 0}>
                                                {passageLoading ? 'Generating...' : 'Generate practice passage'}
                                            </Button>
                                        )}
                                        {passage && passage.status !== 'discarded' && (
                                            <Stack spacing={1} sx={{ width: '100%' }}>
                                                <Typography variant="subtitle1">Practice passage (not graded)</Typography>
                                                <Typography variant="body2" color="text.secondary">Target words to practice</Typography>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                    {(passage.missedWords || []).map((word) => <Chip key={word} label={word} color="warning" variant="outlined" />)}
                                                </Stack>
                                                <TextField
                                                    multiline
                                                    minRows={5}
                                                    value={passageContent}
                                                    onChange={(event) => setPassageContent(event.target.value)}
                                                    disabled={passageLoading || passage.status === 'sent'}
                                                    helperText={passage.status === 'sent' ? 'Sent — no further edits possible.' : ' '}
                                                />
                                                <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap">
                                                    <Button size="small" onClick={updatePassage} disabled={passageLoading || passage.status === 'sent'}>Save</Button>
                                                    {passage.status === 'draft' && <Button size="small" variant="contained" onClick={approvePassage} disabled={passageLoading}>Approve</Button>}
                                                    {passage.status === 'approved' && <Button size="small" variant="contained" onClick={sendPassage} disabled={passageLoading}>Save &amp; send</Button>}
                                                    <Button size="small" color="error" onClick={discardPassage} disabled={passageLoading || passage.status === 'sent'}>Discard</Button>
                                                </Stack>
                                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                                                    <Chip size="small" label={passage.status} color={PASSAGE_STATUS_COLOR[passage.status] || 'default'} />
                                                </Stack>
                                            </Stack>
                                        )}
                                        <Button variant="contained" onClick={() => { setActiveSession(null); setCurrentItem(null); setPassage(null); setPassageContent(''); }}>Back to student</Button>
                                    </Stack>
                                </CardContent>
                            </Card>
                        ) : (
                            <Stack spacing={3} alignItems="center" sx={{ width: '100%' }}>
                                <Stack direction="row" spacing={{ xs: 1, sm: 2 }} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap>
                                    <Stack direction="row" spacing={0.5} alignItems="center"><Typography variant="body1">{t('wordCount', { count: (activeSession?.attempts?.length || 0) + 1 })}</Typography><Typography color="text.secondary">/ 10</Typography></Stack>
                                    <Typography variant="body2" color="text.secondary">{t('mistakeCount', { count: activeSession?.mistakeCount || 0 })} / {mistakesAllowed}</Typography>
                                    {currentItem?.isRetest && <Chip size="small" icon={<HiOutlineArrowLeft />} label={t('retests', { count: 1 })} color="warning" />}
                                </Stack>
                                <Stack direction="row" spacing={1} aria-label={`${activeSession?.mistakeCount || 0} of ${mistakesAllowed} mistakes used`}>
                                    {mistakePips.map((filled, index) => (
                                        <Box
                                            key={index}
                                            title={`Mistake ${index + 1}: ${filled ? 'used' : 'available'}`}
                                            sx={{ width: 28, height: 10, borderRadius: 5, bgcolor: filled ? 'error.main' : 'action.disabledBackground', border: 1, borderColor: filled ? 'error.main' : 'divider' }}
                                        />
                                    ))}
                                </Stack>
                                <Fade in key={`${currentItem?.sequence || 'feedback'}-${gradingFeedback?.correct}`} timeout={350}>
                                    <Card sx={{ width: '100%', minHeight: { xs: 260, md: 360 }, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: gradingFeedback ? (gradingFeedback.correct ? 'success.light' : 'error.light') : 'background.paper', transition: 'background-color 180ms ease', boxShadow: 4 }}>
                                        <CardContent sx={{ textAlign: 'center' }}>
                                            {gradingFeedback ? (
                                                <Stack spacing={2} alignItems="center">
                                                    {gradingFeedback.correct ? <HiOutlineCheck size={72} /> : <HiOutlineXMark size={72} />}
                                                    <Typography variant="h4">{gradingFeedback.correct ? t('correct') : t('incorrect')}</Typography>
                                                </Stack>
                                            ) : (
                                                <Stack spacing={1} alignItems="center">
                                                    <Typography variant="h1" className="spelling-active-word">{currentItem?.word || t('loadingNextWord')}</Typography>
                                                    {dictionaryEntry?.definitions?.length > 0 && (
                                                        <Box sx={{ maxWidth: 520, textAlign: 'center' }}>
                                                            {dictionaryEntry.definitions.slice(0, 2).map((definition, index) => (
                                                                <Typography key={`${definition.partOfSpeech || 'def'}-${index}`} variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
                                                                    {definition.partOfSpeech ? `${definition.partOfSpeech}: ` : ''}{definition.definition}
                                                                </Typography>
                                                            ))}
                                                        </Box>
                                                    )}
                                                </Stack>
                                            )}
                                        </CardContent>
                                    </Card>
                                </Fade>
                                {activeSession?.mode === 'self-serve' ? (
                                    <Alert severity="info" sx={{ width: '100%', maxWidth: 700 }}>Student answers are graded automatically. This view refreshes as answers are submitted.</Alert>
                                ) : (
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%', maxWidth: 700 }}>
                                        <Button fullWidth variant="contained" color="success" startIcon={<HiOutlineCheck />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => gradeAttempt(true)} disabled={loading || Boolean(gradingFeedback)}>{t('correct')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(Y / Right)</Typography></Button>
                                        <Button fullWidth variant="contained" color="error" startIcon={<HiOutlineXMark />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => gradeAttempt(false)} disabled={loading || Boolean(gradingFeedback)}>{t('incorrect')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(N / Left)</Typography></Button>
                                    </Stack>
                                )}
                            </Stack>
                        )}
                    </Box>
                </DialogContent>
            </Dialog>

            <Dialog open={passageDeliveryDialogOpen} onClose={() => setPassageDeliveryDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Practice passage email queued</DialogTitle>
                <DialogContent>
                    <Typography>The practice passage has been queued for delivery to the selected recipients.</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Delivery is handled by the spelling email service. The final status will be recorded after Gmail accepts the message.</Typography>
                </DialogContent>
                <DialogActions><Button onClick={() => setPassageDeliveryDialogOpen(false)}>Close</Button></DialogActions>
            </Dialog>

            {classId && <>
            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
                <Tab label="Assessments" />
                <Tab label="Curriculum & import" />
                <Tab label="Settings" />
            </Tabs>

            {activeTab === 1 && <>
            <Card sx={{ mb: 3 }}><CardContent><Stack spacing={2}>
                <Typography variant="h6">{t('wordListTitle')}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <FormControl sx={{ minWidth: 150 }}><InputLabel>{t('grade')}</InputLabel><Select value={wordFilters.grade} label={t('grade')} onChange={(event) => setWordFilters((current) => ({ ...current, grade: event.target.value }))}><MenuItem value="">{t('allGrades')}</MenuItem>{['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}</Select></FormControl>
                    <FormControl sx={{ minWidth: 150 }}><InputLabel>{t('week')}</InputLabel><Select value={wordFilters.week} label={t('week')} onChange={(event) => setWordFilters((current) => ({ ...current, week: event.target.value }))}><MenuItem value="">{t('allWeeks')}</MenuItem>{Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <MenuItem key={week} value={week}>{week}</MenuItem>)}</Select></FormControl>
                    <FormControl sx={{ minWidth: 220 }}><InputLabel>{t('category')}</InputLabel><Select value={wordFilters.category} label={t('category')} onChange={(event) => setWordFilters((current) => ({ ...current, category: event.target.value }))}><MenuItem value="">{t('allCategories')}</MenuItem>{wordCategories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</Select></FormControl>
                </Stack>
                <Typography variant="body2" color="text.secondary">{wordsLoading ? t('loadingWords') : t('wordCount', { count: wordList.length })}</Typography>
                {!wordsLoading && wordList.length > 0 && <Box sx={{ maxHeight: 400, overflowY: 'auto', overflowX: 'hidden', p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    {Object.entries(wordList.reduce((groups, word) => {
                        groups[word.category] = [...(groups[word.category] || []), word];
                        return groups;
                    }, {})).map(([category, categoryWords]) => <Box key={category} sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{category}</Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            {categoryWords.map((word) => <Chip key={`${word.grade}-${word.week}-${word.order}-${word.word}`} label={word.word} variant="outlined" />)}
                        </Stack>
                    </Box>)}
                </Box>}
                {!wordsLoading && wordList.length === 0 && <Typography color="text.secondary">{t('noWords')}</Typography>}
            </Stack></CardContent></Card>
            <Card sx={{ mb: 3 }}><CardContent><Stack spacing={2}>
                <Typography variant="h6">{t('importTitle')}</Typography>
                <Typography variant="body2" color="text.secondary">{t('csvColumns')}</Typography>
                <Typography component="a" href="/spelling_words_sample.csv" download sx={{ alignSelf: 'flex-start' }}>
                    {t('downloadTemplate')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} />
                    <Button variant="outlined" onClick={previewWordList} disabled={!importFile || importing}>{t('preview')}</Button>
                </Stack>
                {importPreview && <Box><Typography variant="body2">{t('rows')}: {importPreview.summary.totalRows} | {t('valid')}: {importPreview.summary.validRows}</Typography>{importPreview.errors?.length > 0 ? <Alert severity="error" sx={{ mt: 1 }}>{importPreview.errors.length} validation errors must be fixed before import.</Alert> : <Button sx={{ mt: 1 }} variant="contained" onClick={commitWordList} disabled={importing}>{t('commitImport')}</Button>}</Box>}
            </Stack></CardContent></Card>
            </>}

            {activeTab === 0 && <>
            <Card sx={{ mb: 3 }}><CardContent><Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
                    <FormControl sx={{ minWidth: 180 }}>
                        <InputLabel>{t('assessmentMode')}</InputLabel>
                        <Select value={assessmentMode} label={t('assessmentMode')} onChange={(event) => setAssessmentMode(event.target.value)}>
                            <MenuItem value="teacher-led">{t('teacherLed')}</MenuItem>
                            <MenuItem value="self-serve">{t('selfServe')}</MenuItem>
                        </Select>
                    </FormControl>
                    <Button variant="outlined" onClick={startClassSession} disabled={!classId || !classStudents.length || classStarting}>
                        {classStarting ? t('creating') : t('createClassSession')}
                    </Button>
                </Stack>

                <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" flexWrap="wrap" useFlexGap>
                        <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary">Using class defaults for new sessions:</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip size="small" label={`Max mistakes: ${maxMistakesAllowed}`} />
                                <Chip size="small" label={`Results: ${emailNotification.replace(/-/g, ' ')}`} />
                                <Chip size="small" label={`Passage: ${passageEnabled ? `on (${passageTrigger})` : 'off'}`} />
                            </Stack>
                        </Stack>
                        <Button size="small" onClick={toggleSessionOverride}>
                            {sessionOverrideOpen ? 'Cancel override' : 'Customize for this session'}
                        </Button>
                    </Stack>

                    {sessionOverrideOpen && <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                        <TextField
                            label="Max mistakes"
                            type="number"
                            value={maxMistakesAllowed}
                            inputProps={{ min: 1, max: 50 }}
                            onChange={(event) => setMaxMistakesAllowed(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
                            sx={{ width: 150 }}
                        />
                        <FormControl sx={{ minWidth: 220 }}>
                            <InputLabel>Email results</InputLabel>
                            <Select value={emailNotification} label="Email results" onChange={(event) => setEmailNotification(event.target.value)}>
                                <MenuItem value="none">Do not send</MenuItem>
                                <MenuItem value="student-only">Student only</MenuItem>
                                <MenuItem value="parents-only">Parents/guardians only</MenuItem>
                                <MenuItem value="student-and-parents">Student and parents/guardians</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl sx={{ minWidth: 220 }}>
                            <InputLabel>Practice passage</InputLabel>
                            <Select value={passageEmailAudience} label="Practice passage" onChange={(event) => setPassageEmailAudience(event.target.value)}>
                                <MenuItem value="none">Do not send</MenuItem>
                                <MenuItem value="student-only">Student only</MenuItem>
                                <MenuItem value="parents-only">Parents/guardians only</MenuItem>
                                <MenuItem value="student-and-parents">Student and parents/guardians</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl sx={{ minWidth: 170 }}>
                            <InputLabel>Passage generation</InputLabel>
                            <Select value={passageEnabled ? 'on' : 'off'} label="Passage generation" onChange={(event) => setPassageEnabled(event.target.value === 'on')}>
                                <MenuItem value="off">Off</MenuItem>
                                <MenuItem value="on">On</MenuItem>
                            </Select>
                        </FormControl>
                        {passageEnabled && <FormControl sx={{ minWidth: 150 }}>
                            <InputLabel>Passage trigger</InputLabel>
                            <Select value={passageTrigger} label="Passage trigger" onChange={(event) => setPassageTrigger(event.target.value)}>
                                <MenuItem value="manual">Manual</MenuItem>
                                <MenuItem value="automatic">Automatic</MenuItem>
                            </Select>
                        </FormControl>}
                        {passageEnabled && <FormControl sx={{ minWidth: 160 }}>
                            <InputLabel>Passage style</InputLabel>
                            <Select value={passageStyle} label="Passage style" onChange={(event) => setPassageStyle(event.target.value)}>
                                <MenuItem value="sentence-list">Sentence list</MenuItem>
                                <MenuItem value="passage">Paragraph</MenuItem>
                            </Select>
                        </FormControl>}
                        {passageEnabled && <FormControl sx={{ minWidth: 170 }}>
                            <InputLabel>Approval</InputLabel>
                            <Select value={passageApproval ? 'required' : 'automatic'} label="Approval" onChange={(event) => setPassageApproval(event.target.value === 'required')}>
                                <MenuItem value="required">Teacher approval</MenuItem>
                                <MenuItem value="automatic">Auto approve</MenuItem>
                            </Select>
                        </FormControl>}
                        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                            Applies to sessions started from this tab only — not saved as the class default.
                        </Typography>
                    </Stack>}
                </Box>
            </Stack></CardContent></Card>

            {classId && <Card sx={{ mb: 3 }}><CardContent>
                <Typography variant="h6" gutterBottom>{selectedClass?.name || t('allStudentsOverview')}</Typography>
                {overviewLoading && <Typography color="text.secondary">{t('loadingWords')}</Typography>}
                {!classStudents.length ? <Typography color="text.secondary">{t('noWords')}</Typography> : <TableContainer><Table size="small">
                    <TableHead><TableRow>
                        <TableCell>{t('student')}</TableCell>
                        <TableCell>{t('spellingGrade')}</TableCell>
                        <TableCell>{t('spellingWeek')}</TableCell>
                        <TableCell>Practice passage</TableCell>
                        <TableCell align="right">{t('viewDetails')}</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                        {classStudents.map((student) => {
                            const level = rowLevels[student._id] || { grade: '', week: '' };
                            const studentSessions = studentHistoryMap[student._id] || [];
                            const rowActiveSession = studentSessions.find((session) => session.status === 'in-progress');
                            const skippedSession = studentSessions.find((session) =>
                                session.mode === 'self-serve' && session.attempts?.some(isSkippedSpellingAttempt)
                            );
                            const skippedCount = skippedSession?.attempts?.filter(isSkippedSpellingAttempt).length || 0;
                            const currentWord = rowActiveSession?.currentWord;
                            const passageSession = studentSessions.find((session) => session.practicePassage);
                            const latestPassage = passageSession?.practicePassage;
                            const rowBusy = rowActionLoadingId === student._id;
                            return (
                                <TableRow key={student._id}>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                            <Typography variant="body2">{student.firstName} {student.lastName}</Typography>
                                            {currentWord && (
                                                <Chip
                                                    size="small"
                                                    label={currentWord}
                                                    color="warning"
                                                    sx={{
                                                        fontWeight: 700,
                                                        backgroundColor: 'warning.light',
                                                        color: 'warning.contrastText',
                                                        border: '1px solid',
                                                        borderColor: 'warning.main'
                                                    }}
                                                />
                                            )}
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary">{t('studentId', { id: student.studentId })}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <FormControl size="small" sx={{ minWidth: 110 }}>
                                            <Select displayEmpty value={level.grade} onChange={(event) => updateRowLevel(student, 'grade', event.target.value)} disabled={savingRowId === student._id}>
                                                <MenuItem value="">{t('selectGrade')}</MenuItem>
                                                {['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                    <TableCell>
                                        <FormControl size="small" sx={{ minWidth: 110 }}>
                                            <Select displayEmpty value={level.week} onChange={(event) => updateRowLevel(student, 'week', event.target.value)} disabled={savingRowId === student._id}>
                                                <MenuItem value="">{t('selectWeek')}</MenuItem>
                                                {Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <MenuItem key={week} value={week}>{week}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                    <TableCell>
                                        {latestPassage ? (
                                            <Stack spacing={0.5} alignItems="flex-start">
                                                <Chip size="small" label={latestPassage.status} color={PASSAGE_STATUS_COLOR[latestPassage.status] || 'default'} />
                                                <Button size="small" onClick={() => openSessionReview(student, passageSession)}>
                                                    {latestPassage.status === 'draft' ? 'Review' : 'View'}
                                                </Button>
                                            </Stack>
                                        ) : <Typography variant="caption" color="text.secondary">None</Typography>}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                                            {rowActiveSession
                                                ? <>
                                                    <Button size="small" variant="contained" onClick={() => openSessionReview(student, rowActiveSession)} disabled={rowBusy}>Open session</Button>
                                                    <Button size="small" color="error" variant="outlined" onClick={() => endRowActiveSession(student)} disabled={rowBusy}>{t('endActiveSession')}</Button>
                                                  </>
                                                : <Button size="small" variant="contained" onClick={() => startStudentSession(student)} disabled={rowBusy || !level.grade || !level.week}>{t('startStudentSession')}</Button>}
                                            {skippedSession && skippedCount > 0 && (
                                                <Button size="small" color="warning" variant="outlined" onClick={() => openSessionReview(student, skippedSession)}>
                                                    {t('reviewSkippedWords', { count: skippedCount })}
                                                </Button>
                                            )}
                                            <Button size="small" variant="outlined" onClick={() => exportStudentReport(student)} disabled={exportingRowId === student._id}>{exportingRowId === student._id ? t('exporting') : t('exportReport')}</Button>
                                            <Button size="small" variant="outlined" onClick={() => navigate(`/portal/students/${student._id}`)}>{t('viewDetailsCharts')}</Button>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table></TableContainer>}
            </CardContent></Card>}
            </>}

            {activeTab === 2 && <Card><CardContent><Stack spacing={2}>
                <Box>
                    <Typography variant="h6">Spelling settings</Typography>
                    <Typography variant="body2" color="text.secondary">These are the saved defaults for this class, used whenever a new session is started (unless overridden for a single session from the Assessments tab).</Typography>
                </Box>
                <TextField label="Max mistakes before session ends" type="number" value={maxMistakesAllowed} inputProps={{ min: 1, max: 50 }} onChange={(event) => setMaxMistakesAllowed(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
                <FormControl fullWidth><InputLabel>Send results email to</InputLabel><Select value={emailNotification} label="Send results email to" onChange={(event) => setEmailNotification(event.target.value)}><MenuItem value="none">Do not send</MenuItem><MenuItem value="student-only">Student only</MenuItem><MenuItem value="parents-only">Parents/guardians only</MenuItem><MenuItem value="student-and-parents">Student and parents/guardians</MenuItem></Select></FormControl>
                <FormControl fullWidth><InputLabel>Send practice passage to</InputLabel><Select value={passageEmailAudience} label="Send practice passage to" onChange={(event) => setPassageEmailAudience(event.target.value)}><MenuItem value="none">Do not send</MenuItem><MenuItem value="student-only">Student only</MenuItem><MenuItem value="parents-only">Parents/guardians only</MenuItem><MenuItem value="student-and-parents">Student and parents/guardians</MenuItem></Select></FormControl>
                <FormControl fullWidth><InputLabel>Passage generation</InputLabel><Select value={passageEnabled ? 'on' : 'off'} label="Passage generation" onChange={(event) => setPassageEnabled(event.target.value === 'on')}><MenuItem value="off">Off</MenuItem><MenuItem value="on">On</MenuItem></Select></FormControl>
                {passageEnabled && <FormControl fullWidth><InputLabel>Passage trigger</InputLabel><Select value={passageTrigger} label="Passage trigger" onChange={(event) => setPassageTrigger(event.target.value)}><MenuItem value="manual">Manual</MenuItem><MenuItem value="automatic">Automatic</MenuItem></Select></FormControl>}
                {passageEnabled && <FormControl fullWidth><InputLabel>Passage style</InputLabel><Select value={passageStyle} label="Passage style" onChange={(event) => setPassageStyle(event.target.value)}><MenuItem value="sentence-list">Sentence list</MenuItem><MenuItem value="passage">Paragraph</MenuItem></Select></FormControl>}
                {passageEnabled && <FormControl fullWidth><InputLabel>Passage approval</InputLabel><Select value={passageApproval ? 'required' : 'automatic'} label="Passage approval" onChange={(event) => setPassageApproval(event.target.value === 'required')}><MenuItem value="required">Teacher approval required</MenuItem><MenuItem value="automatic">Approve automatically</MenuItem></Select></FormControl>}
                <FormControl fullWidth><InputLabel>Dictation mode</InputLabel><Select value={dictationEnabled ? 'on' : 'off'} label="Dictation mode" onChange={(event) => setDictationEnabled(event.target.value === 'on')}><MenuItem value="off">Off - show the word</MenuItem><MenuItem value="on">On - hear the word</MenuItem></Select></FormControl>
                {dictationEnabled && <FormControl fullWidth><InputLabel>Auto-play pronunciation</InputLabel><Select value={dictationAutoPlay ? 'on' : 'off'} label="Auto-play pronunciation" onChange={(event) => setDictationAutoPlay(event.target.value === 'on')}><MenuItem value="on">On</MenuItem><MenuItem value="off">Off - use Play sound</MenuItem></Select></FormControl>}
                <Button variant="contained" onClick={saveClassSettings}>Save class settings</Button>
            </Stack></CardContent></Card>}
            </>}
        </Box>
    );
};

export default SpellingTeacherPage;
// import { useCallback, useEffect, useMemo, useState } from 'react';
// import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Fade, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Tab, TextField, Typography } from '@mui/material';
// import { HiOutlineCheck, HiOutlineXMark, HiOutlineArrowLeft, HiOutlineClock } from 'react-icons/hi2';
// import { useDispatch, useSelector } from 'react-redux';
// import { useTranslation } from 'react-i18next';
// import { useNavigate } from 'react-router-dom';
// import api from '../../config/api';
// import './SpellingTeacherPage.css';
// import { fetchClass, fetchClasses, selectClassStudents, selectClasses, selectClassesLoading, selectCurrentClass } from '../../store/slices/classSlice';
// import { updateStudent } from '../../store/slices/studentSlice';
// import {
//     fetchSpellingCurrentItem,
//     fetchSpellingHistory,
//     fetchSpellingWords,
//     selectSpelling,
//     endSpellingSession,
//     startTeacherSpellingSession,
//     submitTeacherSpellingAttempt
// } from '../../store/slices/spellingSlice';

// const SpellingTeacherPage = () => {
//     const dispatch = useDispatch();
//     const navigate = useNavigate();
//     const { t } = useTranslation('spelling');
//     const classes = useSelector(selectClasses);
//     const classStudents = useSelector(selectClassStudents);
//     const selectedClass = useSelector(selectCurrentClass);
//     const classesLoading = useSelector(selectClassesLoading);
//     const spelling = useSelector(selectSpelling);
//     const [classId, setClassId] = useState('');
//     const [activeTab, setActiveTab] = useState(0);
//     const [studentId, setStudentId] = useState('');
//     const [activeSession, setActiveSession] = useState(null);
//     const [currentItem, setCurrentItem] = useState(null);
//     const [message, setMessage] = useState('');
//     const [loading, setLoading] = useState(false);
//     const [classStarting, setClassStarting] = useState(false);
//     const [assessmentMode, setAssessmentMode] = useState('self-serve');
//     const [maxMistakesAllowed, setMaxMistakesAllowed] = useState(3);
//     const [emailNotification, setEmailNotification] = useState('student-and-parents');
//     const [passageEmailAudience, setPassageEmailAudience] = useState('none');
//     const [passageEnabled, setPassageEnabled] = useState(false);
//     const [passageTrigger, setPassageTrigger] = useState('manual');
//     const [passageStyle, setPassageStyle] = useState('sentence-list');
//     const [passageApproval, setPassageApproval] = useState(true);
//     const [importFile, setImportFile] = useState(null);
//     const [importPreview, setImportPreview] = useState(null);
//     const [importing, setImporting] = useState(false);
//     const [gradingFeedback, setGradingFeedback] = useState(null);
//     const [passage, setPassage] = useState(null);
//     const [passageContent, setPassageContent] = useState('');
//     const [passageLoading, setPassageLoading] = useState(false);
//     const [passageDeliveryDialogOpen, setPassageDeliveryDialogOpen] = useState(false);
//     const [wordFilters, setWordFilters] = useState({ grade: 'KG', week: '1', category: '' });
//     const [rowLevels, setRowLevels] = useState({});
//     const [savingRowId, setSavingRowId] = useState(null);
//     const [exportingRowId, setExportingRowId] = useState(null);
//     const [rowActionLoadingId, setRowActionLoadingId] = useState(null);
//     const [studentHistoryMap, setStudentHistoryMap] = useState({});
//     const [overviewLoading, setOverviewLoading] = useState(false);
//     const wordList = spelling.words;
//     const wordCategories = spelling.categories;
//     const wordsLoading = spelling.loading;

//     const selectedStudent = useMemo(
//         () => classStudents.find((student) => String(student._id) === String(studentId)),
//         [classStudents, studentId]
//     );

//     useEffect(() => {
//         dispatch(fetchClasses({ limit: 100 }));
//     }, [dispatch]);

//     useEffect(() => {
//         if (!classId) return;
//         dispatch(fetchSpellingWords(wordFilters));
//     }, [classId, dispatch, wordFilters]);

//     useEffect(() => {
//         if (!classId) return;
//         dispatch(fetchClass(classId));
//         api.get(`/spelling/classes/${classId}/settings`).then(({ data }) => {
//             const settings = data.data;
//             setMaxMistakesAllowed(settings.defaultMaxMistakes || 3);
//             setEmailNotification(settings.defaultEmailAudience || 'student-and-parents');
//             setPassageEnabled(settings.passageGeneration?.enabled === true);
//             setPassageTrigger(settings.passageGeneration?.trigger || 'manual');
//             setPassageStyle(settings.passageGeneration?.style || 'sentence-list');
//             setPassageApproval(settings.passageGeneration?.requireTeacherApproval !== false);
//             setPassageEmailAudience(settings.passageGeneration?.passageEmailAudience || 'none');
//         }).catch(() => {});
//         setStudentId('');
//         setRowLevels({});
//     }, [classId, dispatch]);

//     useEffect(() => {
//         if (!classStudents.length) return;
//         setRowLevels((current) => {
//             const next = { ...current };
//             classStudents.forEach((student) => {
//                 if (!next[student._id]) {
//                     next[student._id] = {
//                         grade: student.spelling?.currentGrade || '',
//                         week: student.spelling?.currentWeek ? String(student.spelling.currentWeek) : ''
//                     };
//                 }
//             });
//             return next;
//         });
//     }, [classStudents]);

//     const refreshStudentHistory = useCallback(async (targetStudentId) => {
//         const result = await dispatch(fetchSpellingHistory({ studentId: targetStudentId }));
//         if (fetchSpellingHistory.fulfilled.match(result)) {
//             setStudentHistoryMap((current) => ({ ...current, [targetStudentId]: result.payload }));
//         }
//     }, [dispatch]);

//     const loadAllHistories = useCallback(async () => {
//         if (!classStudents.length) return;
//         setOverviewLoading(true);
//         try {
//             const entries = await Promise.all(classStudents.map(async (student) => {
//                 const result = await dispatch(fetchSpellingHistory({ studentId: student._id }));
//                 return [student._id, fetchSpellingHistory.fulfilled.match(result) ? result.payload : []];
//             }));
//             setStudentHistoryMap(Object.fromEntries(entries));
//         } finally {
//             setOverviewLoading(false);
//         }
//     }, [classStudents, dispatch]);

//     useEffect(() => {
//         if (!classId || !classStudents.length) {
//             setStudentHistoryMap({});
//             return;
//         }
//         loadAllHistories();
//     }, [classId, classStudents, loadAllHistories]);

//     const updateRowLevel = async (student, field, value) => {
//         const nextLevel = { ...(rowLevels[student._id] || {}), [field]: value };
//         setRowLevels((current) => ({ ...current, [student._id]: nextLevel }));
//         if (!nextLevel.grade || !nextLevel.week) return;
//         setSavingRowId(student._id);
//         const result = await dispatch(updateStudent({
//             id: student._id,
//             data: {
//                 spelling: {
//                     ...(student.spelling || {}),
//                     currentGrade: nextLevel.grade,
//                     currentWeek: Number(nextLevel.week)
//                 }
//             }
//         }));
//         setMessage(updateStudent.fulfilled.match(result) ? t('studentLevelSaved') : (result.payload || t('studentLevelSaveError')));
//         setSavingRowId(null);
//     };

//     const loadCurrentItem = useCallback(async (sessionId) => {
//         const result = await dispatch(fetchSpellingCurrentItem(sessionId));
//         if (fetchSpellingCurrentItem.fulfilled.match(result)) {
//             setActiveSession(result.payload.session);
//             setCurrentItem(result.payload.item);
//         }
//     }, [dispatch]);

//     const startStudentSession = async (student) => {
//         const level = rowLevels[student._id] || {};
//         if (!student._id || !level.grade || !level.week) return;
//         setRowActionLoadingId(student._id);
//         setMessage('');
//         try {
//             const result = await dispatch(startTeacherSpellingSession({
//                 studentId: student._id,
//                 curriculumGrade: level.grade,
//                 curriculumWeek: level.week,
//                 mode: assessmentMode,
//                 emailNotification,
//                 passageEmailAudience,
//                 passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: passageApproval },
//                 maxMistakesAllowed
//             }));
//             if (startTeacherSpellingSession.fulfilled.match(result)) {
//                 setStudentId(student._id);
//                 await loadCurrentItem(result.payload._id);
//             } else {
//                 setMessage(result.payload || t('sessionError'));
//             }
//             await refreshStudentHistory(student._id);
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to start the session.');
//         } finally {
//             setRowActionLoadingId(null);
//         }
//     };

//     const endRowActiveSession = async (student) => {
//         const rowActiveSession = (studentHistoryMap[student._id] || []).find((session) => session.status === 'in-progress');
//         if (!rowActiveSession) return;
//         setRowActionLoadingId(student._id);
//         const result = await dispatch(endSpellingSession({ sessionId: rowActiveSession._id, reason: 'teacher-ended' }));
//         setMessage(endSpellingSession.fulfilled.match(result) ? t('activeSessionEnded') : (result.payload || t('sessionError')));
//         await refreshStudentHistory(student._id);
//         setRowActionLoadingId(null);
//     };

//     const exportStudentReport = async (student) => {
//         setExportingRowId(student._id);
//         try {
//             const response = await api.get(`/spelling/reports/student/${student._id}/docx`, { responseType: 'blob' });
//             const blobUrl = window.URL.createObjectURL(response.data);
//             const link = document.createElement('a');
//             link.href = blobUrl;
//             link.download = `spelling-${student.firstName || 'student'}-${student.lastName || 'report'}.docx`;
//             document.body.appendChild(link);
//             link.click();
//             link.remove();
//             window.URL.revokeObjectURL(blobUrl);
//         } catch (error) {
//             setMessage(error.response?.data?.message || t('exportError'));
//         } finally {
//             setExportingRowId(null);
//         }
//     };

//     const startClassSession = async () => {
//         if (!classStudents.length) return;
//         setClassStarting(true);
//         setMessage('');
//         let started = 0;
//         try {
//             for (const student of classStudents) {
//                 await api.post('/spelling/sessions', {
//                     studentId: student._id,
//                     mode: assessmentMode,
//                     maxMistakesAllowed,
//                     curriculumGrade: wordFilters.grade,
//                     curriculumWeek: wordFilters.week,
//                     emailNotification
//                     ,passageEmailAudience
//                     ,passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: passageApproval }
//                 });
//                 started += 1;
//             }
//             setMessage(t('classCreated', { count: started, className: selectedClass?.name || t('class') }));
//             await loadAllHistories();
//         } catch (error) {
//             setMessage(error.response?.data?.message || t('classStopped', { count: started }));
//         } finally {
//             setClassStarting(false);
//         }
//     };

//     const gradeAttempt = useCallback(async (correct) => {
//         if (!activeSession || !currentItem || loading || gradingFeedback) return;
//         setLoading(true);
//         try {
//             const result = await dispatch(submitTeacherSpellingAttempt({ sessionId: activeSession._id, sequence: currentItem.sequence, correct }));
//             if (submitTeacherSpellingAttempt.fulfilled.match(result)) {
//                 setGradingFeedback({ correct, session: result.payload.session });
//                 await new Promise((resolve) => setTimeout(resolve, 700));
//                 setGradingFeedback(null);
//                 if (result.payload.session.status === 'in-progress') {
//                     await loadCurrentItem(activeSession._id);
//                 } else {
//                     setActiveSession(result.payload.session);
//                     setCurrentItem(null);
//                     await refreshStudentHistory(studentId);
//                 }
//             }
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to record the attempt.');
//         } finally {
//             setLoading(false);
//         }
//     }, [activeSession, currentItem, dispatch, gradingFeedback, loadCurrentItem, loading, refreshStudentHistory, studentId]);

//     const exitTeacherSession = async () => {
//         if (!activeSession) return;
//         await dispatch(endSpellingSession({ sessionId: activeSession._id, reason: 'teacher-ended' }));
//         setActiveSession(null);
//         setCurrentItem(null);
//         setGradingFeedback(null);
//         setPassage(null);
//         setPassageContent('');
//     };

//     const generatePassage = async () => {
//         if (!activeSession) return;
//         setPassageLoading(true);
//         try {
//             const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/generate`, { style: 'sentence-list' });
//             setPassage(response.data.data);
//             setPassageContent(response.data.data.content || '');
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to generate the practice passage.');
//         } finally {
//             setPassageLoading(false);
//         }
//     };

//     const updatePassage = async () => {
//         if (!activeSession || !passageContent.trim()) return;
//         setPassageLoading(true);
//         try {
//             const response = await api.patch(`/spelling/sessions/${activeSession._id}/passage`, { content: passageContent });
//             setPassage(response.data.data);
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to save the practice passage.');
//         } finally {
//             setPassageLoading(false);
//         }
//     };

//     const approvePassage = async () => {
//         if (!activeSession) return;
//         setPassageLoading(true);
//         try {
//             const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/approve`);
//             setPassage(response.data.data);
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to approve the practice passage.');
//         } finally {
//             setPassageLoading(false);
//         }
//     };

//     const discardPassage = async () => {
//         if (!activeSession) return;
//         setPassageLoading(true);
//         try {
//             const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/discard`);
//             setPassage(response.data.data);
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to discard the practice passage.');
//         } finally {
//             setPassageLoading(false);
//         }
//     };

//     const sendPassage = async () => {
//         if (!activeSession) return;
//         setPassageLoading(true);
//         try {
//             const response = await api.post(`/spelling/sessions/${activeSession._id}/passage/send`);
//             setPassage((current) => ({ ...current, status: 'approved', emailDeliveryId: response.data.data._id }));
//             setMessage('Practice passage queued for delivery.');
//             setPassageDeliveryDialogOpen(true);
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to send the practice passage.');
//         } finally {
//             setPassageLoading(false);
//         }
//     };

//     useEffect(() => {
//         const handleKeyDown = (event) => {
//             if (!activeSession || !currentItem || gradingFeedback || loading) return;
//             if (event.key.toLowerCase() === 'y' || event.key === 'ArrowRight') gradeAttempt(true);
//             if (event.key.toLowerCase() === 'n' || event.key === 'ArrowLeft') gradeAttempt(false);
//         };
//         window.addEventListener('keydown', handleKeyDown);
//         return () => window.removeEventListener('keydown', handleKeyDown);
//     }, [activeSession, currentItem, gradeAttempt, gradingFeedback, loading]);

//     useEffect(() => {
//         if (activeSession?.mode !== 'self-serve' || activeSession.status !== 'in-progress') return undefined;
//         const refreshMonitor = () => loadCurrentItem(activeSession._id);
//         const intervalId = window.setInterval(refreshMonitor, 1500);
//         return () => window.clearInterval(intervalId);
//     }, [activeSession?.mode, activeSession?.status, activeSession?._id, loadCurrentItem]);

//     const missedWords = activeSession?.attempts?.filter((attempt) => !attempt.correct) || [];
//     const mistakesAllowed = activeSession?.maxMistakesAllowed || 3;
//     const mistakePips = Array.from({ length: mistakesAllowed }, (_, index) => index < (activeSession?.mistakeCount || 0));

//     const previewWordList = async () => {
//         if (!importFile) return;
//         setImporting(true);
//         setMessage('');
//         try {
//             const formData = new FormData();
//             formData.append('file', importFile);
//             const response = await api.post('/spelling/word-lists/import/preview', formData, {
//                 headers: { 'Content-Type': 'multipart/form-data' }
//             });
//             setImportPreview(response.data.data);
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to preview the word list.');
//         } finally {
//             setImporting(false);
//         }
//     };

//     const commitWordList = async () => {
//         if (!importPreview?.importId) return;
//         setImporting(true);
//         try {
//             const response = await api.post('/spelling/word-lists/import/commit', { importId: importPreview.importId });
//             setMessage(`Imported ${response.data.data.importedRows} spelling words.`);
//             setImportPreview(null);
//             setImportFile(null);
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to import the word list.');
//         } finally {
//             setImporting(false);
//         }
//     };

//     const saveClassSettings = async () => {
//         if (!classId) return;
//         try {
//             await api.patch(`/spelling/classes/${classId}/settings`, {
//                 defaultMaxMistakes: maxMistakesAllowed,
//                 defaultEmailAudience: emailNotification,
//                 passageGeneration: { enabled: passageEnabled, trigger: passageTrigger, style: passageStyle, requireTeacherApproval: passageApproval, passageEmailAudience }
//             });
//             setMessage('Spelling settings saved.');
//         } catch (error) {
//             setMessage(error.response?.data?.message || 'Unable to save spelling settings.');
//         }
//     };

//     return (
//         <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
//             <Typography variant="h4" gutterBottom>{t('teacherTitle')}</Typography>
//             <Typography color="text.secondary" sx={{ mb: 3 }}>{t('teacherDescription')}</Typography>
//             {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}
//             <Dialog fullScreen open={Boolean(activeSession)} onClose={exitTeacherSession}>
//                 <DialogContent sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', p: { xs: 2, md: 5 } }}>
//                     <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
//                         <Stack direction="row" spacing={2} alignItems="center">
//                             <IconButton aria-label="Exit session" onClick={exitTeacherSession}><HiOutlineArrowLeft /></IconButton>
//                             <Box><Typography variant="overline">{t('activeAssessment', { name: `${selectedStudent?.firstName || ''} ${selectedStudent?.lastName || ''}` })}</Typography><Typography variant="h5">{activeSession?.mode === 'self-serve' ? t('selfServe') : t('teacherLed')}</Typography><Typography variant="body2" color="text.secondary">{t('currentWeek', { grade: activeSession?.curriculumGrade, week: activeSession?.curriculumWeek })}</Typography></Box>
//                         </Stack>
//                         <Stack direction="row" spacing={1} alignItems="center"><HiOutlineClock /><Typography>{t('wordCount', { count: activeSession?.attempts?.length || 0 })}</Typography></Stack>
//                     </Stack>
//                     <Box sx={{ maxWidth: 900, width: '100%', mx: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                         {activeSession?.status !== 'in-progress' ? <Card sx={{ width: '100%', maxWidth: 700, p: { xs: 2, md: 5 } }}><CardContent><Stack spacing={3} alignItems="center"><HiOutlineCheck size={54} color="currentColor" /><Typography variant="h3" textAlign="center">{t('sessionCompleted')}</Typography><Typography variant="h5">{t('correctCount', { count: activeSession?.correctCount || 0 })} | {t('mistakeCount', { count: activeSession?.mistakeCount || 0 })}</Typography><Typography color="text.secondary">{t('retests', { count: missedWords.length })}</Typography>{missedWords.length > 0 && <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>{missedWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} icon={<HiOutlineXMark />} label={attempt.wordSnapshot} color="error" variant="outlined" />)}</Stack>}
//                             {!passage && <Button variant="outlined" onClick={generatePassage} disabled={passageLoading || missedWords.length === 0}>{passageLoading ? 'Generating...' : 'Generate practice passage'}</Button>}
//                             {passage && passage.status !== 'discarded' && <Stack spacing={1} sx={{ width: '100%' }}><Typography variant="subtitle1">Practice passage (not graded)</Typography><Typography variant="body2" color="text.secondary">Target words to practice</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{(passage.missedWords || []).map((word) => <Chip key={word} label={word} color="warning" variant="outlined" />)}</Stack><TextField multiline minRows={5} value={passageContent} onChange={(event) => setPassageContent(event.target.value)} disabled={passageLoading || passage.status === 'sent'} /><Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap"><Button size="small" onClick={updatePassage} disabled={passageLoading}>Save</Button>{passage.status === 'draft' && <Button size="small" variant="contained" onClick={approvePassage} disabled={passageLoading}>Approve</Button>}{passage.status === 'approved' && <Button size="small" variant="contained" onClick={sendPassage} disabled={passageLoading}>Save &amp; send</Button>}<Button size="small" color="error" onClick={discardPassage} disabled={passageLoading}>Discard</Button></Stack><Typography variant="caption" color="text.secondary">Status: {passage.status}</Typography></Stack>}
//                             <Button variant="contained" onClick={() => { setActiveSession(null); setCurrentItem(null); setPassage(null); setPassageContent(''); }}>Back to student</Button></Stack></CardContent></Card> : <Stack spacing={3} alignItems="center" sx={{ width: '100%' }}>
//                             <Stack direction="row" spacing={{ xs: 1, sm: 2 }} alignItems="center" justifyContent="center" flexWrap="wrap" useFlexGap>
//                                 <Stack direction="row" spacing={0.5} alignItems="center"><Typography variant="body1">{t('wordCount', { count: (activeSession?.attempts?.length || 0) + 1 })}</Typography><Typography color="text.secondary">/ 10</Typography></Stack>
//                                 <Typography variant="body2" color="text.secondary">{t('mistakeCount', { count: activeSession?.mistakeCount || 0 })} / {mistakesAllowed}</Typography>
//                                 {currentItem?.isRetest && <Chip size="small" icon={<HiOutlineArrowLeft />} label={t('retests', { count: 1 })} color="warning" />}
//                             </Stack>
//                             <Stack direction="row" spacing={1} aria-label={`${activeSession?.mistakeCount || 0} of ${mistakesAllowed} mistakes used`}>{mistakePips.map((filled, index) => <Box key={index} sx={{ width: 28, height: 10, borderRadius: 5, bgcolor: filled ? 'error.main' : 'action.disabledBackground', border: 1, borderColor: filled ? 'error.main' : 'divider' }} />)}</Stack>
//                             <Fade in key={`${currentItem?.sequence || 'feedback'}-${gradingFeedback?.correct}`} timeout={350}>
//                                 <Card sx={{ width: '100%', minHeight: { xs: 260, md: 360 }, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: gradingFeedback ? (gradingFeedback.correct ? 'success.light' : 'error.light') : 'background.paper', transition: 'background-color 180ms ease', boxShadow: 4 }}>
//                                     <CardContent sx={{ textAlign: 'center' }}>{gradingFeedback ? <Stack spacing={2} alignItems="center">{gradingFeedback.correct ? <HiOutlineCheck size={72} /> : <HiOutlineXMark size={72} />}<Typography variant="h4">{gradingFeedback.correct ? t('correct') : t('incorrect')}</Typography></Stack> : <Typography variant="h1" className="spelling-active-word">{currentItem?.word || t('loadingNextWord')}</Typography>}</CardContent>
//                                 </Card>
//                             </Fade>
//                             {activeSession?.mode === 'self-serve' ? <Alert severity="info" sx={{ width: '100%', maxWidth: 700 }}>Student answers are graded automatically. This view refreshes as answers are submitted.</Alert> : <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%', maxWidth: 700 }}>
//                                 <Button fullWidth variant="contained" color="success" startIcon={<HiOutlineCheck />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => gradeAttempt(true)} disabled={loading || Boolean(gradingFeedback)}>{t('correct')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(Y / Right)</Typography></Button>
//                                 <Button fullWidth variant="contained" color="error" startIcon={<HiOutlineXMark />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => gradeAttempt(false)} disabled={loading || Boolean(gradingFeedback)}>{t('incorrect')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(N / Left)</Typography></Button>
//                             </Stack>}
//                         </Stack>}
//                     </Box>
//                 </DialogContent>
//             </Dialog>
//             <Dialog open={passageDeliveryDialogOpen} onClose={() => setPassageDeliveryDialogOpen(false)} maxWidth="xs" fullWidth>
//                 <DialogTitle>Practice passage email queued</DialogTitle>
//                 <DialogContent>
//                     <Typography>The practice passage has been queued for delivery to the selected recipients.</Typography>
//                     <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Delivery is handled by the spelling email service. The final status will be recorded after Gmail accepts the message.</Typography>
//                 </DialogContent>
//                 <DialogActions><Button onClick={() => setPassageDeliveryDialogOpen(false)}>Close</Button></DialogActions>
//             </Dialog>
//             <Card sx={{ mb: 3 }}><CardContent>
//                 <FormControl fullWidth>
//                     <InputLabel>{t('class')}</InputLabel>
//                     <Select value={classId} label={t('class')} onChange={(event) => { setClassId(event.target.value); setActiveTab(0); }} disabled={classesLoading}>
//                         {classes.map((schoolClass) => <MenuItem key={schoolClass._id} value={schoolClass._id}>{schoolClass.name}{schoolClass.section ? ` - ${schoolClass.section}` : ''}</MenuItem>)}
//                     </Select>
//                 </FormControl>
//             </CardContent></Card>
//             {classId && <>
//             <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
//                 <Tab label="Assessments" />
//                 <Tab label="Curriculum & import" />
//                 <Tab label="Settings" />
//             </Tabs>
//             {activeTab === 1 && <>
//             <Card sx={{ mb: 3 }}><CardContent><Stack spacing={2}>
//                 <Typography variant="h6">{t('wordListTitle')}</Typography>
//                 <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
//                     <FormControl sx={{ minWidth: 150 }}><InputLabel>{t('grade')}</InputLabel><Select value={wordFilters.grade} label={t('grade')} onChange={(event) => setWordFilters((current) => ({ ...current, grade: event.target.value }))}><MenuItem value="">{t('allGrades')}</MenuItem>{['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}</Select></FormControl>
//                     <FormControl sx={{ minWidth: 150 }}><InputLabel>{t('week')}</InputLabel><Select value={wordFilters.week} label={t('week')} onChange={(event) => setWordFilters((current) => ({ ...current, week: event.target.value }))}><MenuItem value="">{t('allWeeks')}</MenuItem>{Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <MenuItem key={week} value={week}>{week}</MenuItem>)}</Select></FormControl>
//                     <FormControl sx={{ minWidth: 220 }}><InputLabel>{t('category')}</InputLabel><Select value={wordFilters.category} label={t('category')} onChange={(event) => setWordFilters((current) => ({ ...current, category: event.target.value }))}><MenuItem value="">{t('allCategories')}</MenuItem>{wordCategories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}</Select></FormControl>
//                 </Stack>
//                 <Typography variant="body2" color="text.secondary">{wordsLoading ? t('loadingWords') : t('wordCount', { count: wordList.length })}</Typography>
//                 {!wordsLoading && wordList.length > 0 && <Box sx={{ maxHeight: 400, overflowY: 'auto', overflowX: 'hidden', p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
//                     {Object.entries(wordList.reduce((groups, word) => {
//                         groups[word.category] = [...(groups[word.category] || []), word];
//                         return groups;
//                     }, {})).map(([category, categoryWords]) => <Box key={category} sx={{ mb: 2 }}>
//                         <Typography variant="subtitle2" sx={{ mb: 1 }}>{category}</Typography>
//                         <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
//                             {categoryWords.map((word) => <Chip key={`${word.grade}-${word.week}-${word.order}-${word.word}`} label={word.word} variant="outlined" />)}
//                         </Stack>
//                     </Box>)}
//                 </Box>}
//                 {!wordsLoading && wordList.length === 0 && <Typography color="text.secondary">{t('noWords')}</Typography>}
//             </Stack></CardContent></Card>
//             <Card sx={{ mb: 3 }}><CardContent><Stack spacing={2}>
//                 <Typography variant="h6">{t('importTitle')}</Typography>
//                 <Typography variant="body2" color="text.secondary">{t('csvColumns')}</Typography>
//                 <Typography component="a" href="/spelling_words_sample.csv" download sx={{ alignSelf: 'flex-start' }}>
//                     {t('downloadTemplate')}
//                 </Typography>
//                 <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
//                     <input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} />
//                     <Button variant="outlined" onClick={previewWordList} disabled={!importFile || importing}>{t('preview')}</Button>
//                 </Stack>
//                 {importPreview && <Box><Typography variant="body2">{t('rows')}: {importPreview.summary.totalRows} | {t('valid')}: {importPreview.summary.validRows}</Typography>{importPreview.errors?.length > 0 ? <Alert severity="error" sx={{ mt: 1 }}>{importPreview.errors.length} validation errors must be fixed before import.</Alert> : <Button sx={{ mt: 1 }} variant="contained" onClick={commitWordList} disabled={importing}>{t('commitImport')}</Button>}</Box>}
//             </Stack></CardContent></Card>
//             </>}
//             {activeTab === 0 && <>
//             <Card sx={{ mb: 3 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
//                 <FormControl sx={{ minWidth: 180 }}><InputLabel>{t('assessmentMode')}</InputLabel><Select value={assessmentMode} label={t('assessmentMode')} onChange={(event) => setAssessmentMode(event.target.value)}><MenuItem value="teacher-led">{t('teacherLed')}</MenuItem><MenuItem value="self-serve">{t('selfServe')}</MenuItem></Select></FormControl>
//                 <TextField label="Max mistakes" type="number" value={maxMistakesAllowed} inputProps={{ min: 1, max: 50 }} onChange={(event) => setMaxMistakesAllowed(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} sx={{ width: 150 }} />
//                 <FormControl sx={{ minWidth: 240 }}><InputLabel>Email results</InputLabel><Select value={emailNotification} label="Email results" onChange={(event) => setEmailNotification(event.target.value)}><MenuItem value="none">Do not send</MenuItem><MenuItem value="student-only">Student only</MenuItem><MenuItem value="parents-only">Parents/guardians only</MenuItem><MenuItem value="student-and-parents">Student and parents/guardians</MenuItem></Select></FormControl>
//                 <FormControl sx={{ minWidth: 240 }}><InputLabel>Practice passage</InputLabel><Select value={passageEmailAudience} label="Practice passage" onChange={(event) => setPassageEmailAudience(event.target.value)}><MenuItem value="none">Do not send</MenuItem><MenuItem value="student-only">Student only</MenuItem><MenuItem value="parents-only">Parents/guardians only</MenuItem><MenuItem value="student-and-parents">Student and parents/guardians</MenuItem></Select></FormControl>
//                 <FormControl sx={{ minWidth: 180 }}><InputLabel>Passage generation</InputLabel><Select value={passageEnabled ? 'on' : 'off'} label="Passage generation" onChange={(event) => setPassageEnabled(event.target.value === 'on')}><MenuItem value="off">Off</MenuItem><MenuItem value="on">On</MenuItem></Select></FormControl>
//                 {passageEnabled && <FormControl sx={{ minWidth: 160 }}><InputLabel>Passage trigger</InputLabel><Select value={passageTrigger} label="Passage trigger" onChange={(event) => setPassageTrigger(event.target.value)}><MenuItem value="manual">Manual</MenuItem><MenuItem value="automatic">Automatic</MenuItem></Select></FormControl>}
//                 {passageEnabled && <FormControl sx={{ minWidth: 170 }}><InputLabel>Passage style</InputLabel><Select value={passageStyle} label="Passage style" onChange={(event) => setPassageStyle(event.target.value)}><MenuItem value="sentence-list">Sentence list</MenuItem><MenuItem value="passage">Paragraph</MenuItem></Select></FormControl>}
//                 {passageEnabled && <FormControl sx={{ minWidth: 180 }}><InputLabel>Approval</InputLabel><Select value={passageApproval ? 'required' : 'automatic'} label="Approval" onChange={(event) => setPassageApproval(event.target.value === 'required')}><MenuItem value="required">Teacher approval</MenuItem><MenuItem value="automatic">Auto approve</MenuItem></Select></FormControl>}
//                 <Button variant="outlined" onClick={saveClassSettings}>Save spelling settings</Button>
//                 <Button variant="outlined" onClick={startClassSession} disabled={!classId || !classStudents.length || classStarting}>{classStarting ? t('creating') : t('createClassSession')}</Button>
//             </Stack></CardContent></Card>
//             {classId && <Card sx={{ mb: 3 }}><CardContent>
//                 <Typography variant="h6" gutterBottom>{selectedClass?.name || t('allStudentsOverview')}</Typography>
//                 {overviewLoading && <Typography color="text.secondary">{t('loadingWords')}</Typography>}
//                 {!classStudents.length ? <Typography color="text.secondary">{t('noWords')}</Typography> : <TableContainer><Table size="small">
//                     <TableHead><TableRow>
//                         <TableCell>{t('student')}</TableCell>
//                         <TableCell>{t('spellingGrade')}</TableCell>
//                         <TableCell>{t('spellingWeek')}</TableCell>
//                         <TableCell>Practice passage</TableCell>
//                         <TableCell align="right">{t('viewDetails')}</TableCell>
//                     </TableRow></TableHead>
//                     <TableBody>
//                         {classStudents.map((student) => {
//                             const level = rowLevels[student._id] || { grade: '', week: '' };
//                             const studentSessions = studentHistoryMap[student._id] || [];
//                             const rowActiveSession = studentSessions.find((session) => session.status === 'in-progress');
//                             const latestPassage = studentSessions.find((session) => session.practicePassage)?.practicePassage;
//                             const rowBusy = rowActionLoadingId === student._id;
//                             return (
//                                 <TableRow key={student._id}>
//                                     <TableCell>
//                                         <Typography variant="body2">{student.firstName} {student.lastName}</Typography>
//                                         <Typography variant="caption" color="text.secondary">{t('studentId', { id: student.studentId })}</Typography>
//                                     </TableCell>
//                                     <TableCell>
//                                         <FormControl size="small" sx={{ minWidth: 110 }}>
//                                             <Select displayEmpty value={level.grade} onChange={(event) => updateRowLevel(student, 'grade', event.target.value)} disabled={savingRowId === student._id}>
//                                                 <MenuItem value="">{t('selectGrade')}</MenuItem>
//                                                 {['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}
//                                             </Select>
//                                         </FormControl>
//                                     </TableCell>
//                                     <TableCell>
//                                         <FormControl size="small" sx={{ minWidth: 110 }}>
//                                             <Select displayEmpty value={level.week} onChange={(event) => updateRowLevel(student, 'week', event.target.value)} disabled={savingRowId === student._id}>
//                                                 <MenuItem value="">{t('selectWeek')}</MenuItem>
//                                                 {Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <MenuItem key={week} value={week}>{week}</MenuItem>)}
//                                             </Select>
//                                         </FormControl>
//                                     </TableCell>
//                                     <TableCell>
//                                         {latestPassage ? <Typography variant="caption" sx={{ display: 'block', maxWidth: 260, whiteSpace: 'pre-wrap' }}>{latestPassage.content}</Typography> : <Typography variant="caption" color="text.secondary">None</Typography>}
//                                     </TableCell>
//                                     <TableCell align="right">
//                                         <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
//                                             {rowActiveSession ? <Button size="small" color="error" variant="outlined" onClick={() => endRowActiveSession(student)} disabled={rowBusy}>{t('endActiveSession')}</Button> : <Button size="small" variant="contained" onClick={() => startStudentSession(student)} disabled={rowBusy || !level.grade || !level.week}>{t('startStudentSession')}</Button>}
//                                             <Button size="small" variant="outlined" onClick={() => exportStudentReport(student)} disabled={exportingRowId === student._id}>{exportingRowId === student._id ? t('exporting') : t('exportReport')}</Button>
//                                             <Button size="small" variant="outlined" onClick={() => navigate(`/portal/students/${student._id}`)}>{t('viewDetailsCharts')}</Button>
//                                         </Stack>
//                                     </TableCell>
//                                 </TableRow>
//                             );
//                         })}
//                     </TableBody>
//                 </Table></TableContainer>}
//             </CardContent></Card>}
//             </>}
//             {activeTab === 2 && <Card><CardContent><Stack spacing={2}>
//                 <Box>
//                     <Typography variant="h6">Spelling settings</Typography>
//                     <Typography variant="body2" color="text.secondary">These defaults are loaded for the selected class and used when creating new sessions.</Typography>
//                 </Box>
//                 <TextField label="Max mistakes before session ends" type="number" value={maxMistakesAllowed} inputProps={{ min: 1, max: 50 }} onChange={(event) => setMaxMistakesAllowed(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
//                 <FormControl fullWidth><InputLabel>Send results email to</InputLabel><Select value={emailNotification} label="Send results email to" onChange={(event) => setEmailNotification(event.target.value)}><MenuItem value="none">Do not send</MenuItem><MenuItem value="student-only">Student only</MenuItem><MenuItem value="parents-only">Parents/guardians only</MenuItem><MenuItem value="student-and-parents">Student and parents/guardians</MenuItem></Select></FormControl>
//                 <FormControl fullWidth><InputLabel>Send practice passage to</InputLabel><Select value={passageEmailAudience} label="Send practice passage to" onChange={(event) => setPassageEmailAudience(event.target.value)}><MenuItem value="none">Do not send</MenuItem><MenuItem value="student-only">Student only</MenuItem><MenuItem value="parents-only">Parents/guardians only</MenuItem><MenuItem value="student-and-parents">Student and parents/guardians</MenuItem></Select></FormControl>
//                 <FormControl fullWidth><InputLabel>Passage generation</InputLabel><Select value={passageEnabled ? 'on' : 'off'} label="Passage generation" onChange={(event) => setPassageEnabled(event.target.value === 'on')}><MenuItem value="off">Off</MenuItem><MenuItem value="on">On</MenuItem></Select></FormControl>
//                 {passageEnabled && <FormControl fullWidth><InputLabel>Passage trigger</InputLabel><Select value={passageTrigger} label="Passage trigger" onChange={(event) => setPassageTrigger(event.target.value)}><MenuItem value="manual">Manual</MenuItem><MenuItem value="automatic">Automatic</MenuItem></Select></FormControl>}
//                 {passageEnabled && <FormControl fullWidth><InputLabel>Passage style</InputLabel><Select value={passageStyle} label="Passage style" onChange={(event) => setPassageStyle(event.target.value)}><MenuItem value="sentence-list">Sentence list</MenuItem><MenuItem value="passage">Paragraph</MenuItem></Select></FormControl>}
//                 {passageEnabled && <FormControl fullWidth><InputLabel>Passage approval</InputLabel><Select value={passageApproval ? 'required' : 'automatic'} label="Passage approval" onChange={(event) => setPassageApproval(event.target.value === 'required')}><MenuItem value="required">Teacher approval required</MenuItem><MenuItem value="automatic">Approve automatically</MenuItem></Select></FormControl>}
//                 <Button variant="contained" onClick={saveClassSettings}>Save class settings</Button>
//             </Stack></CardContent></Card>}
//             </>}
//         </Box>
//     );
// };

// export default SpellingTeacherPage;
