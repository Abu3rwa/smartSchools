import { useEffect } from 'react';
import { Alert, Box, Card, CardContent, Chip, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { fetchStudentSpellingDetails, selectSpelling } from '../../../../store/slices/spellingSlice';

const Metric = ({ label, value }) => <Card variant="outlined"><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5">{value}</Typography></CardContent></Card>;

const StudentSpellingDetailsSection = ({ studentId }) => {
    const dispatch = useDispatch();
    const { t } = useTranslation('spelling');
    const { studentDetails, loading, error } = useSelector(selectSpelling);

    useEffect(() => {
        if (studentId) dispatch(fetchStudentSpellingDetails({ studentId }));
    }, [dispatch, studentId]);

    if (loading && !studentDetails) return <Card sx={{ mt: 3 }}><CardContent><Skeleton height={40} /><Skeleton height={180} /><Skeleton height={40} /></CardContent></Card>;
    if (error && !studentDetails) return <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>;
    if (!studentDetails) return null;

    const { student, summary, byGrade, timeline, missedWords } = studentDetails;
    return <Box sx={{ mt: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Box><Typography variant="h5">{t('studentSpellingDetails')}</Typography><Typography color="text.secondary">{student.currentGrade || t('notSet')} · {student.currentWeek ? `${t('week')} ${student.currentWeek}` : t('notSet')}</Typography></Box>
            <Chip label={`${t('pendingRetests')}: ${summary.pendingRetests}`} color={summary.overdueRetests ? 'error' : 'warning'} />
        </Stack>
        <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} md={3}><Metric label={t('originalAttempts')} value={summary.originalAttempts} /></Grid>
            <Grid item xs={6} md={3}><Metric label={t('originalCorrect')} value={summary.originalCorrect} /></Grid>
            <Grid item xs={6} md={3}><Metric label={t('originalIncorrect')} value={summary.originalIncorrect} /></Grid>
            <Grid item xs={6} md={3}><Metric label={t('originalAccuracy')} value={`${summary.originalAccuracy}%`} /></Grid>
            <Grid item xs={6} md={3}><Metric label={t('retestAttempts')} value={summary.retestAttempts} /></Grid>
            <Grid item xs={6} md={3}><Metric label={t('retestCorrect')} value={summary.retestCorrect} /></Grid>
            <Grid item xs={6} md={3}><Metric label={t('uniqueWordsEverMissed')} value={summary.uniqueWordsEverMissed} /></Grid>
            <Grid item xs={6} md={3}><Metric label={t('retestRecoveryRate')} value={`${summary.retestRecoveryRate}%`} /></Grid>
        </Grid>
        <Grid container spacing={2}>
            <Grid item xs={12} md={6}><Card><CardContent><Typography variant="h6">{t('gradePerformance')}</Typography><ResponsiveContainer width="100%" height={280}><BarChart data={byGrade}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="grade" /><YAxis /><Tooltip /><Legend /><Bar dataKey="originalCorrect" name={t('originalCorrect')} fill="#2e7d32" /><Bar dataKey="originalIncorrect" name={t('originalIncorrect')} fill="#c62828" /></BarChart></ResponsiveContainer></CardContent></Card></Grid>
            <Grid item xs={12} md={6}><Card><CardContent><Typography variant="h6">{t('progressOverTime')}</Typography><ResponsiveContainer width="100%" height={280}><LineChart data={timeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="originalCorrect" name={t('originalCorrect')} stroke="#2e7d32" /><Line type="monotone" dataKey="originalIncorrect" name={t('originalIncorrect')} stroke="#c62828" /><Line type="monotone" dataKey="retestCorrect" name={t('retestCorrect')} stroke="#1565c0" /></LineChart></ResponsiveContainer></CardContent></Card></Grid>
        </Grid>
        <Card sx={{ mt: 2 }}><CardContent><Typography variant="h6" gutterBottom>{t('missedWords')}</Typography>{missedWords.length ? <Stack spacing={1}>{missedWords.map((item) => <Stack key={`${item.grade}-${item.word}`} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Typography>{item.word} <Typography component="span" color="text.secondary">({item.grade})</Typography></Typography><Typography variant="body2">{t('originalIncorrect')}: {item.originalIncorrectCount} · {t('retestCorrect')}: {item.retestCorrect} · {item.pending ? t('pending') : t('resolved')}</Typography></Stack>)}</Stack> : <Typography color="text.secondary">{t('noMissedWords')}</Typography>}</CardContent></Card>
    </Box>;
};

export default StudentSpellingDetailsSection;
