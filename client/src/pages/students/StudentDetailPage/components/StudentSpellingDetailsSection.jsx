import { useEffect, useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, FormControl, Grid, InputLabel, MenuItem, Select, Skeleton, Stack, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { fetchStudentSpellingDetails, selectSpelling } from '../../../../store/slices/spellingSlice';

const METRIC_COLORS = { neutral: 'primary.main', success: 'success.main', error: 'error.main', info: 'info.main', warning: 'warning.main' };

const getMonthKey = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const Metric = ({ label, value, tone = 'neutral' }) => (
    <Card variant="outlined" sx={{ height: '100%', borderRadius: 2, borderLeft: 4, borderLeftColor: METRIC_COLORS[tone], transition: 'box-shadow 150ms ease', '&:hover': { boxShadow: 3 } }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: METRIC_COLORS[tone] }}>{value}</Typography>
        </CardContent>
    </Card>
);

const StudentSpellingDetailsSection = ({ studentId }) => {
    const dispatch = useDispatch();
    const { t, i18n } = useTranslation('spelling');
    const { studentDetails, loading, error } = useSelector(selectSpelling);
    const [filters, setFilters] = useState({ studentId, month: 'all', session: 'all' });
    const selectedMonth = filters.studentId === studentId ? filters.month : 'all';
    const selectedSession = filters.studentId === studentId ? filters.session : 'all';

    useEffect(() => {
        if (studentId) dispatch(fetchStudentSpellingDetails({ studentId }));
    }, [dispatch, studentId]);

    const isStale = studentDetails && String(studentDetails.student?.id) !== String(studentId);
    if ((loading && !studentDetails) || isStale) return <Card sx={{ mt: 3 }}><CardContent><Skeleton height={40} /><Skeleton height={180} /><Skeleton height={40} /></CardContent></Card>;
    if (error && !studentDetails) return <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>;
    if (!studentDetails) return null;


    const { student, summary, byGrade: rawByGrade = [], missedWords = [] } = studentDetails;
    const gradeOrder = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];
    const gradeRank = (grade) => {
        const index = gradeOrder.indexOf(String(grade).toUpperCase());
        return index === -1 ? gradeOrder.length : index;
    };
    const byGrade = [...rawByGrade].sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade));
    const gradePerformancePercentages = byGrade.map((item) => {
        const attempts = item.originalAttempts || item.originalCorrect + item.originalIncorrect;
        return {
            ...item,
            originalCorrectPercent: attempts ? Math.round((item.originalCorrect / attempts) * 10000) / 100 : 0,
            originalIncorrectPercent: attempts ? Math.round((item.originalIncorrect / attempts) * 10000) / 100 : 0
        };
    });
    const accuracyTone = summary.originalAccuracy >= 80 ? 'success' : summary.originalAccuracy >= 60 ? 'warning' : 'error';
    const sessionMap = new Map();
    missedWords.forEach((item) => {
        (item.sourceSessions || []).forEach((session) => {
            if (!sessionMap.has(session.id)) sessionMap.set(session.id, session);
        });
    });
    const sessions = [...sessionMap.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    const months = [...new Set(sessions.map((session) => getMonthKey(session.startedAt)).filter(Boolean))].sort().reverse();
    const availableSessions = selectedMonth === 'all'
        ? sessions
        : sessions.filter((session) => getMonthKey(session.startedAt) === selectedMonth);
    const formatMonth = (month) => {
        const [year, number] = month.split('-').map(Number);
        return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, { month: 'long', year: 'numeric' })
            .format(new Date(year, number - 1, 1));
    };
    const filteredMissedWords = missedWords.map((item) => {
        const sourceSessions = item.sourceSessions || [];
        const matchingSessions = sourceSessions.filter((session) => (
            (selectedMonth === 'all' || getMonthKey(session.startedAt) === selectedMonth)
            && (selectedSession === 'all' || session.id === selectedSession)
        ));
        return {
            ...item,
            originalIncorrectCount: selectedMonth === 'all' && selectedSession === 'all'
                ? item.originalIncorrectCount
                : matchingSessions.reduce((count, session) => count + session.originalIncorrectCount, 0)
        };
    }).filter((item) => (
        selectedMonth === 'all' && selectedSession === 'all'
            ? true
            : (item.sourceSessions || []).some((session) => (
                (selectedMonth === 'all' || getMonthKey(session.startedAt) === selectedMonth)
                && (selectedSession === 'all' || session.id === selectedSession)
            ))
    ));
    const sortedMissedWords = [...filteredMissedWords].sort(
        (a, b) => Number(b.pending) - Number(a.pending) || b.originalIncorrectCount - a.originalIncorrectCount
    );
    return <Box sx={{ mt: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Box><Typography variant="h5">{student.firstName} {student.lastName}</Typography><Typography variant="subtitle2" color="text.secondary">{t('studentSpellingDetails')}{student.studentId ? ` · ${student.studentId}` : ''}</Typography><Typography color="text.secondary">{student.currentGrade || t('notSet')} · {student.currentWeek ? `${t('week')} ${student.currentWeek}` : t('notSet')}</Typography></Box>
            <Chip label={`${t('pendingRetests')}: ${summary.pendingRetests}`} color={summary.overdueRetests ? 'error' : 'warning'} />
        </Stack>
        <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, md: 3 }}><Metric label={t('originalAttempts')} value={summary.originalAttempts} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Metric tone="success" label={t('originalCorrect')} value={summary.originalCorrect} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Metric tone="error" label={t('originalIncorrect')} value={summary.originalIncorrect} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Metric tone={accuracyTone} label={t('originalAccuracy')} value={`${summary.originalAccuracy}%`} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Metric label={t('retestAttempts')} value={summary.retestAttempts} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Metric tone="success" label={t('retestCorrect')} value={summary.retestCorrect} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Metric tone="warning" label={t('uniqueWordsEverMissed')} value={summary.uniqueWordsEverMissed} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Metric tone="info" label={t('retestRecoveryRate')} value={summary.retestAttempts ? `${summary.retestRecoveryRate}%` : '—'} /></Grid>
        </Grid>
        <Grid container spacing={2}>
            <Grid size={12}><Card><CardContent><Typography variant="h6">{t('gradePerformance')}</Typography>{byGrade.length === 0 ? <Typography color="text.secondary" sx={{ mt: 1 }}>{t('noData')}</Typography> : <ResponsiveContainer width="100%" height={320}><BarChart data={gradePerformancePercentages} barCategoryGap="25%"><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="grade" /><YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(value) => `${value}%`} /><Tooltip formatter={(value) => [`${value}%`]} /><Legend /><Bar dataKey="originalCorrectPercent" name={t('originalCorrectPercent')} fill="#2e7d32"><LabelList dataKey="originalCorrectPercent" position="top" formatter={(value) => `${value}%`} /></Bar><Bar dataKey="originalIncorrectPercent" name={t('originalIncorrectPercent')} fill="#c62828"><LabelList dataKey="originalIncorrectPercent" position="top" formatter={(value) => `${value}%`} /></Bar></BarChart></ResponsiveContainer>}</CardContent></Card></Grid>
        </Grid>
        <Card sx={{ mt: 2 }}>
            <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 1 }}>
                    <Typography variant="h6">{t('missedWords')}</Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                            <InputLabel>{t('filterByMonth')}</InputLabel>
                            <Select
                                value={selectedMonth}
                                label={t('filterByMonth')}
                                onChange={(event) => {
                                    setFilters({ studentId, month: event.target.value, session: 'all' });
                                }}
                            >
                                <MenuItem value="all">{t('allMonths')}</MenuItem>
                                {months.map((month) => <MenuItem key={month} value={month}>{formatMonth(month)}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel>{t('filterBySession')}</InputLabel>
                            <Select
                                value={selectedSession}
                                label={t('filterBySession')}
                                onChange={(event) => setFilters({ studentId, month: selectedMonth, session: event.target.value })}
                            >
                                <MenuItem value="all">{t('allSessions')}</MenuItem>
                                {availableSessions.map((session) => {
                                    const startedAt = new Date(session.startedAt);
                                    const dateLabel = Number.isNaN(startedAt.getTime())
                                        ? t('notSet')
                                        : startedAt.toLocaleString(i18n.resolvedLanguage || i18n.language);
                                    const modeLabel = session.mode === 'self-serve' ? t('selfServe') : t('teacherLed');
                                    return (
                                        <MenuItem key={session.id} value={session.id}>
                                            {dateLabel} · {modeLabel}
                                        </MenuItem>
                                    );
                                })}
                            </Select>
                        </FormControl>
                    </Stack>
                </Stack>
                {sortedMissedWords.length ? (
                    <Stack sx={{ maxHeight: 400, overflowY: 'auto' }}>
                        {sortedMissedWords.map((item) => (
                            <Stack key={`${item.grade}-${item.word}`} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography>{item.word} <Typography component="span" color="text.secondary">({item.grade})</Typography></Typography>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="body2" color="text.secondary">
                                        {t('originalIncorrect')}: {item.originalIncorrectCount} · {t('retestCorrect')}: {item.retestCorrect}
                                    </Typography>
                                    <Chip size="small" color={item.pending ? 'warning' : 'success'} label={item.pending ? t('pending') : t('resolved')} />
                                </Stack>
                            </Stack>
                        ))}
                    </Stack>
                ) : (
                    <Typography color="text.secondary">
                        {missedWords.length ? t('noMissedWordsInFilter') : t('noMissedWords')}
                    </Typography>
                )}
            </CardContent>
        </Card>
    </Box>;
};

export default StudentSpellingDetailsSection;
