import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogContent, Divider, Fade, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Tab, Tabs, Typography } from '@mui/material';
import { HiOutlineCheck, HiOutlineXMark, HiOutlineArrowLeft, HiOutlineClock } from 'react-icons/hi2';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import { fetchClass, fetchClasses, selectClassStudents, selectClasses, selectClassesLoading, selectCurrentClass } from '../../store/slices/classSlice';
import { updateStudent } from '../../store/slices/studentSlice';
import {
    fetchSpellingCurrentItem,
    fetchSpellingHistory,
    fetchSpellingRetests,
    fetchSpellingWords,
    selectSpelling,
    endSpellingSession,
    startTeacherSpellingSession,
    submitTeacherSpellingAttempt
} from '../../store/slices/spellingSlice';

const SpellingTeacherPage = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation('spelling');
    const classes = useSelector(selectClasses);
    const classStudents = useSelector(selectClassStudents);
    const selectedClass = useSelector(selectCurrentClass);
    const classesLoading = useSelector(selectClassesLoading);
    const spelling = useSelector(selectSpelling);
    const [classId, setClassId] = useState('');
    const [studentId, setStudentId] = useState('');
    const [detailTab, setDetailTab] = useState(0);
    const [sessions, setSessions] = useState([]);
    const [retests, setRetests] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [currentItem, setCurrentItem] = useState(null);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [classStarting, setClassStarting] = useState(false);
    const [assessmentMode, setAssessmentMode] = useState('self-serve');
    const [importFile, setImportFile] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [importing, setImporting] = useState(false);
    const [gradingFeedback, setGradingFeedback] = useState(null);
    const [wordFilters, setWordFilters] = useState({ grade: 'KG', week: '1', category: '' });
    const [studentSpellingGrade, setStudentSpellingGrade] = useState('');
    const [studentSpellingWeek, setStudentSpellingWeek] = useState('');
    const [savingStudentLevel, setSavingStudentLevel] = useState(false);
    const wordList = spelling.words;
    const wordCategories = spelling.categories;
    const wordsLoading = spelling.loading;

    const selectedStudent = useMemo(
        () => classStudents.find((student) => String(student._id) === String(studentId)),
        [classStudents, studentId]
    );
    const activeStudentSession = sessions.find((session) => session.status === 'in-progress');

    useEffect(() => {
        dispatch(fetchClasses({ limit: 100 }));
    }, [dispatch]);

    useEffect(() => {
        dispatch(fetchSpellingWords(wordFilters));
    }, [dispatch, wordFilters]);

    useEffect(() => {
        if (!classId) return;
        dispatch(fetchClass(classId));
        setStudentId('');
        setSessions([]);
        setRetests([]);
    }, [classId, dispatch]);

    useEffect(() => {
        if (!studentId) return;
        const student = classStudents.find((item) => String(item._id) === String(studentId));
        setStudentSpellingGrade(student?.spelling?.currentGrade || '');
        setStudentSpellingWeek(student?.spelling?.currentWeek ? String(student.spelling.currentWeek) : '');
        const loadStudentDetail = async () => {
            try {
                const [sessionResult, retestResult] = await Promise.all([
                    dispatch(fetchSpellingHistory({ studentId })),
                    dispatch(fetchSpellingRetests({ studentId, includeResolved: true }))
                ]);
                if (fetchSpellingHistory.fulfilled.match(sessionResult)) setSessions(sessionResult.payload);
                if (fetchSpellingRetests.fulfilled.match(retestResult)) setRetests(retestResult.payload);
            } catch (error) {
                setMessage(error.response?.data?.message || 'Unable to load spelling details.');
            }
        };
        loadStudentDetail();
    }, [classStudents, dispatch, studentId]);

    const saveStudentSpellingLevel = async () => {
        if (!studentId || !studentSpellingGrade || !studentSpellingWeek) return;
        setSavingStudentLevel(true);
        setMessage('');
        const result = await dispatch(updateStudent({
            id: studentId,
            data: {
                spelling: {
                    ...(selectedStudent?.spelling || {}),
                    currentGrade: studentSpellingGrade,
                    currentWeek: Number(studentSpellingWeek)
                }
            }
        }));
        setMessage(updateStudent.fulfilled.match(result) ? t('studentLevelSaved') : (result.payload || t('studentLevelSaveError')));
        setSavingStudentLevel(false);
    };

    const loadCurrentItem = useCallback(async (sessionId) => {
        const result = await dispatch(fetchSpellingCurrentItem(sessionId));
        if (fetchSpellingCurrentItem.fulfilled.match(result)) {
            setActiveSession(result.payload.session);
            setCurrentItem(result.payload.item);
        }
    }, [dispatch]);

    const startStudentSession = async (targetStudentId = studentId) => {
        if (!targetStudentId) return;
        setLoading(true);
        setMessage('');
        try {
            const result = await dispatch(startTeacherSpellingSession({
                studentId: targetStudentId,
                curriculumGrade: studentSpellingGrade,
                curriculumWeek: studentSpellingWeek,
                mode: assessmentMode
            }));
            if (startTeacherSpellingSession.fulfilled.match(result)) {
                await loadCurrentItem(result.payload._id);
            } else {
                setMessage(result.payload || t('sessionError'));
                const sessionResult = await dispatch(fetchSpellingHistory({ studentId: targetStudentId }));
                if (fetchSpellingHistory.fulfilled.match(sessionResult)) setSessions(sessionResult.payload);
            }
        } catch (error) {
            setMessage(error.response?.data?.message || 'Unable to start the session.');
        } finally {
            setLoading(false);
        }
    };

    const endActiveStudentSession = async () => {
        if (!activeStudentSession) return;
        setLoading(true);
        const result = await dispatch(endSpellingSession({ sessionId: activeStudentSession._id, reason: 'teacher-ended' }));
        if (endSpellingSession.fulfilled.match(result)) {
            setMessage(t('activeSessionEnded'));
            const sessionResult = await dispatch(fetchSpellingHistory({ studentId }));
            if (fetchSpellingHistory.fulfilled.match(sessionResult)) setSessions(sessionResult.payload);
        } else {
            setMessage(result.payload || t('sessionError'));
        }
        setLoading(false);
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
                    maxMistakesAllowed: 3,
                    curriculumGrade: wordFilters.grade,
                    curriculumWeek: wordFilters.week
                });
                started += 1;
            }
            setMessage(t('classCreated', { count: started, className: selectedClass?.name || t('class') }));
            if (studentId) {
                const response = await api.get('/spelling/sessions', { params: { studentId } });
                setSessions(response.data.data || []);
            }
        } catch (error) {
            setMessage(error.response?.data?.message || t('classStopped', { count: started }));
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
                await new Promise((resolve) => setTimeout(resolve, 700));
                setGradingFeedback(null);
                if (result.payload.session.status === 'in-progress') {
                    await loadCurrentItem(activeSession._id);
                } else {
                    setActiveSession(result.payload.session);
                    setCurrentItem(null);
                    const sessionResult = await dispatch(fetchSpellingHistory({ studentId }));
                    if (fetchSpellingHistory.fulfilled.match(sessionResult)) setSessions(sessionResult.payload);
                }
            }
        } catch (error) {
            setMessage(error.response?.data?.message || 'Unable to record the attempt.');
        } finally {
            setLoading(false);
        }
    }, [activeSession, currentItem, dispatch, gradingFeedback, loadCurrentItem, loading, studentId]);

    const exitTeacherSession = async () => {
        if (!activeSession) return;
        await dispatch(endSpellingSession({ sessionId: activeSession._id, reason: 'teacher-ended' }));
        setActiveSession(null);
        setCurrentItem(null);
        setGradingFeedback(null);
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
        if (activeSession?.mode !== 'self-serve' || activeSession.status !== 'in-progress') return undefined;
        const refreshMonitor = () => loadCurrentItem(activeSession._id);
        const intervalId = window.setInterval(refreshMonitor, 1500);
        return () => window.clearInterval(intervalId);
    }, [activeSession?.mode, activeSession?.status, activeSession?._id, loadCurrentItem]);

    const missedWords = activeSession?.attempts?.filter((attempt) => !attempt.correct) || [];
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
            setMessage(error.response?.data?.message || 'Unable to preview the word list.');
        } finally {
            setImporting(false);
        }
    };

    const commitWordList = async () => {
        if (!importPreview?.importId) return;
        setImporting(true);
        try {
            const response = await api.post('/spelling/word-lists/import/commit', { importId: importPreview.importId });
            setMessage(`Imported ${response.data.data.importedRows} spelling words.`);
            setImportPreview(null);
            setImportFile(null);
        } catch (error) {
            setMessage(error.response?.data?.message || 'Unable to import the word list.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
            <Typography variant="h4" gutterBottom>{t('teacherTitle')}</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>{t('teacherDescription')}</Typography>
            {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}
            <Dialog fullScreen open={Boolean(activeSession)} onClose={exitTeacherSession}>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', p: { xs: 2, md: 5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <IconButton aria-label="Exit session" onClick={exitTeacherSession}><HiOutlineArrowLeft /></IconButton>
                            <Box><Typography variant="overline">{t('activeAssessment', { name: `${selectedStudent?.firstName || ''} ${selectedStudent?.lastName || ''}` })}</Typography><Typography variant="h5">{activeSession?.mode === 'self-serve' ? t('selfServe') : t('teacherLed')}</Typography><Typography variant="body2" color="text.secondary">{t('currentWeek', { grade: activeSession?.curriculumGrade, week: activeSession?.curriculumWeek })}</Typography></Box>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center"><HiOutlineClock /><Typography>{t('wordCount', { count: activeSession?.attempts?.length || 0 })}</Typography></Stack>
                    </Stack>
                    <Box sx={{ maxWidth: 900, width: '100%', mx: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {activeSession?.status !== 'in-progress' ? <Card sx={{ width: '100%', maxWidth: 700, p: { xs: 2, md: 5 } }}><CardContent><Stack spacing={3} alignItems="center"><HiOutlineCheck size={54} color="currentColor" /><Typography variant="h3" textAlign="center">{t('sessionCompleted')}</Typography><Typography variant="h5">{t('correctCount', { count: activeSession?.correctCount || 0 })} | {t('mistakeCount', { count: activeSession?.mistakeCount || 0 })}</Typography><Typography color="text.secondary">{t('retests', { count: missedWords.length })}</Typography>{missedWords.length > 0 && <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>{missedWords.map((attempt) => <Chip key={attempt._id || attempt.sequence} icon={<HiOutlineXMark />} label={attempt.wordSnapshot} color="error" variant="outlined" />)}</Stack>}<Button variant="contained" onClick={() => { setActiveSession(null); setCurrentItem(null); }}>Back to student</Button></Stack></CardContent></Card> : <Stack spacing={3} alignItems="center" sx={{ width: '100%' }}>
                            <Stack direction="row" spacing={1} alignItems="center"><Typography variant="body1">{t('wordCount', { count: (activeSession?.attempts?.length || 0) + 1 })}</Typography><Typography color="text.secondary">/ 10</Typography></Stack>
                            <Stack direction="row" spacing={1} aria-label={`${activeSession?.mistakeCount || 0} of ${mistakesAllowed} mistakes used`}>{mistakePips.map((filled, index) => <Box key={index} sx={{ width: 28, height: 10, borderRadius: 5, bgcolor: filled ? 'error.main' : 'action.disabledBackground', border: 1, borderColor: filled ? 'error.main' : 'divider' }} />)}</Stack>
                            <Typography variant="body2" color="text.secondary">{t('mistakeCount', { count: activeSession?.mistakeCount || 0 })} / {mistakesAllowed}</Typography>
                            {currentItem?.isRetest && <Chip icon={<HiOutlineArrowLeft />} label={t('retests', { count: 1 })} color="warning" />}
                            <Fade in key={`${currentItem?.sequence || 'feedback'}-${gradingFeedback?.correct}`} timeout={350}>
                                <Card sx={{ width: '100%', minHeight: { xs: 260, md: 360 }, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: gradingFeedback ? (gradingFeedback.correct ? 'success.light' : 'error.light') : 'background.paper', transition: 'background-color 180ms ease', boxShadow: 4 }}>
                                    <CardContent sx={{ textAlign: 'center' }}>{gradingFeedback ? <Stack spacing={2} alignItems="center">{gradingFeedback.correct ? <HiOutlineCheck size={72} /> : <HiOutlineXMark size={72} />}<Typography variant="h4">{gradingFeedback.correct ? t('correct') : t('incorrect')}</Typography></Stack> : <Typography variant="h1" sx={{ fontSize: { xs: '4rem', md: '7rem' }, fontWeight: 700 }}>{currentItem?.word || t('loadingNextWord')}</Typography>}</CardContent>
                                </Card>
                            </Fade>
                            {activeSession?.mode === 'self-serve' ? <Alert severity="info" sx={{ width: '100%', maxWidth: 700 }}>Student answers are graded automatically. This view refreshes as answers are submitted.</Alert> : <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%', maxWidth: 700 }}>
                                <Button fullWidth variant="contained" color="success" startIcon={<HiOutlineCheck />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => gradeAttempt(true)} disabled={loading || Boolean(gradingFeedback)}>{t('correct')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(Y / Right)</Typography></Button>
                                <Button fullWidth variant="contained" color="error" startIcon={<HiOutlineXMark />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => gradeAttempt(false)} disabled={loading || Boolean(gradingFeedback)}>{t('incorrect')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(N / Left)</Typography></Button>
                            </Stack>}
                        </Stack>}
                    </Box>
                </DialogContent>
            </Dialog>
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
            <Card sx={{ mb: 3 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth>
                    <InputLabel>{t('class')}</InputLabel>
                    <Select value={classId} label={t('class')} onChange={(event) => setClassId(event.target.value)} disabled={classesLoading}>
                        {classes.map((schoolClass) => <MenuItem key={schoolClass._id} value={schoolClass._id}>{schoolClass.name}{schoolClass.section ? ` - ${schoolClass.section}` : ''}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl sx={{ minWidth: 180 }}><InputLabel>{t('assessmentMode')}</InputLabel><Select value={assessmentMode} label={t('assessmentMode')} onChange={(event) => setAssessmentMode(event.target.value)}><MenuItem value="teacher-led">{t('teacherLed')}</MenuItem><MenuItem value="self-serve">{t('selfServe')}</MenuItem></Select></FormControl>
                <Button variant="outlined" onClick={startClassSession} disabled={!classId || !classStudents.length || classStarting}>{classStarting ? t('creating') : t('createClassSession')}</Button>
            </Stack></CardContent></Card>
            {classId && <Card sx={{ mb: 3 }}><CardContent><Typography variant="h6" gutterBottom>{selectedClass?.name || 'Class students'}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {classStudents.map((student) => <Button key={student._id} variant={String(student._id) === String(studentId) ? 'contained' : 'outlined'} onClick={() => setStudentId(student._id)}>{student.firstName} {student.lastName}</Button>)}
            </Stack></CardContent></Card>}
            {selectedStudent && <Card sx={{ mb: 3 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}><Box><Typography variant="h5">{selectedStudent.firstName} {selectedStudent.lastName}</Typography><Typography color="text.secondary">Student ID: {selectedStudent.studentId}</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button variant="contained" onClick={() => startStudentSession()} disabled={loading || !studentSpellingGrade || !studentSpellingWeek}>{t('startStudentSession')}</Button>{activeStudentSession && <Button color="error" variant="outlined" onClick={endActiveStudentSession} disabled={loading}>{t('endActiveSession')}</Button>}</Stack></Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }} alignItems={{ sm: 'center' }}>
                    <FormControl sx={{ minWidth: 150 }}><InputLabel>{t('spellingGrade')}</InputLabel><Select value={studentSpellingGrade} label={t('spellingGrade')} onChange={(event) => setStudentSpellingGrade(event.target.value)}><MenuItem value="">{t('selectGrade')}</MenuItem>{['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}</Select></FormControl>
                    <FormControl sx={{ minWidth: 150 }}><InputLabel>{t('spellingWeek')}</InputLabel><Select value={studentSpellingWeek} label={t('spellingWeek')} onChange={(event) => setStudentSpellingWeek(event.target.value)}><MenuItem value="">{t('selectWeek')}</MenuItem>{Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <MenuItem key={week} value={week}>{week}</MenuItem>)}</Select></FormControl>
                    <Button variant="outlined" onClick={saveStudentSpellingLevel} disabled={savingStudentLevel || !studentSpellingGrade || !studentSpellingWeek}>{savingStudentLevel ? t('saving') : t('saveStudentLevel')}</Button>
                </Stack>
                <Tabs value={detailTab} onChange={(_, value) => setDetailTab(value)} sx={{ mt: 2 }}><Tab label={t('previousTests', { count: sessions.length })} /><Tab label={t('retests', { count: retests.filter((item) => item.status === 'pending').length })} /></Tabs>
                {detailTab === 0 && <Stack spacing={1} sx={{ mt: 2 }}>{sessions.length ? sessions.map((session) => <Typography key={session._id}>{new Date(session.startedAt).toLocaleDateString()} - {session.correctCount} {t('correct').toLowerCase()}, {session.mistakeCount} {t('incorrect').toLowerCase()} - {session.status}</Typography>) : <Typography color="text.secondary">{t('noTests')}</Typography>}</Stack>}
                {detailTab === 1 && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>{retests.length ? retests.map((item) => <Chip key={item._id} label={`${item.wordSnapshot} - ${item.status}`} color={item.status === 'pending' ? 'warning' : 'default'} />) : <Typography color="text.secondary">{t('noRetests')}</Typography>}</Stack>}
            </CardContent></Card>}
        </Box>
    );
};

export default SpellingTeacherPage;
