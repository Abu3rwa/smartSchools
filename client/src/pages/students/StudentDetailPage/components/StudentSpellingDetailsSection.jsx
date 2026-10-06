import { useEffect } from 'react';
import { Alert, Box, Card, CardContent, Chip, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { fetchStudentSpellingDetails, selectSpelling } from '../../../../store/slices/spellingSlice';

const METRIC_COLORS = { neutral: 'primary.main', success: 'success.main', error: 'error.main', info: 'info.main', warning: 'warning.main' };

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
    const { t } = useTranslation('spelling');
    const { studentDetails, loading, error } = useSelector(selectSpelling);

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
    const accuracyTone = summary.originalAccuracy >= 80 ? 'success' : summary.originalAccuracy >= 60 ? 'warning' : 'error';
    const sortedMissedWords = [...missedWords].sort(
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
            <Grid size={12}><Card><CardContent><Typography variant="h6">{t('gradePerformance')}</Typography>{byGrade.length === 0 ? <Typography color="text.secondary" sx={{ mt: 1 }}>{t('noData')}</Typography> : <ResponsiveContainer width="100%" height={320}><BarChart data={byGrade} barCategoryGap="25%"><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="grade" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="originalCorrect" name={t('originalCorrect')} fill="#2e7d32"><LabelList dataKey="originalCorrect" position="top" /></Bar><Bar dataKey="originalIncorrect" name={t('originalIncorrect')} fill="#c62828"><LabelList dataKey="originalIncorrect" position="top" /></Bar></BarChart></ResponsiveContainer>}</CardContent></Card></Grid>
        </Grid>
        <Card sx={{ mt: 2 }}><CardContent><Typography variant="h6" gutterBottom>{t('missedWords')}</Typography>{sortedMissedWords.length ? <Stack sx={{ maxHeight: 400, overflowY: 'auto' }}>{sortedMissedWords.map((item) => <Stack key={`${item.grade}-${item.word}`} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}><Typography>{item.word} <Typography component="span" color="text.secondary">({item.grade})</Typography></Typography><Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">{t('originalIncorrect')}: {item.originalIncorrectCount} · {t('retestCorrect')}: {item.retestCorrect}</Typography><Chip size="small" color={item.pending ? 'warning' : 'success'} label={item.pending ? t('pending') : t('resolved')} /></Stack></Stack>)}</Stack> : <Typography color="text.secondary">{t('noMissedWords')}</Typography>}</CardContent></Card>
    </Box>;
};

export default StudentSpellingDetailsSection;




