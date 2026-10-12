import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../../config/api';
import { fetchClass, selectClassStudents, selectClasses } from '../../../store/slices/classSlice';

const REPORTS = [
    { id: 'overview', label: 'Class overview', columns: [['listId', 'List'], ['participants', 'Practised'], ['participationPct', 'Participation %'], ['attempts', 'Answers'], ['correct', 'Correct'], ['accuracyPct', 'Accuracy %']] },
    { id: 'words', label: 'Difficult words', columns: [['word', 'Word'], ['listId', 'List'], ['attempts', 'Answers'], ['wrong', 'Wrong'], ['missPct', 'Miss %'], ['topWrongAnswers', 'Common wrong answers']] },
    { id: 'student', label: 'One student', columns: [['word', 'Word'], ['listId', 'List'], ['attempts', 'Answers'], ['correct', 'Correct'], ['accuracyPct', 'Accuracy %'], ['state', 'State']] },
    { id: 'mcq', label: 'Multiple-choice questions', columns: [['questionId', 'Question'], ['question', 'Text'], ['correctKey', 'Right'], ['attempts', 'Answers'], ['correctPct', 'Correct %'], ['lowScore', 'Low score']] },
    { id: 'inactive', label: 'Not practising', columns: [['name', 'Student'], ['lastPracticed', 'Last practised']] }
];

const cell = (row, key) => {
    const value = row[key];
    if (key === 'topWrongAnswers') return (value || []).map((e) => `${e.answer} (${e.count})`).join(', ');
    if (key === 'lowScore') return value ? 'Yes' : '';
    if (key === 'lastPracticed') return value ? new Date(value).toLocaleDateString() : 'Never';
    return value ?? '';
};

const MetricCard = ({ label, value, detail }) => (
    <Card variant="outlined">
        <CardContent>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="h4" component="p" sx={{ my: 0.5 }}>{value}</Typography>
            <Typography variant="caption" color="text.secondary">{detail}</Typography>
        </CardContent>
    </Card>
);

const percent = (value) => value == null ? '—' : `${value}%`;

const weeklyActivity = (rows, from, to) => {
    if (!from || !to) return [];
    const totals = new Map();
    for (const row of rows) {
        const date = new Date(`${row.date}T00:00:00Z`);
        const week = new Date(date);
        week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
        const key = week.toISOString().slice(0, 10);
        totals.set(key, (totals.get(key) || 0) + row.attempts);
    }
    const first = new Date(`${from.slice(0, 10)}T00:00:00Z`);
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
    const last = new Date(`${to.slice(0, 10)}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() + 6) % 7));
    const label = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const result = [];
    for (const date = new Date(first); date <= last; date.setUTCDate(date.getUTCDate() + 7)) {
        const key = date.toISOString().slice(0, 10);
        result.push({ week: label.format(date), attempts: totals.get(key) || 0 });
    }
    return result;
};

const VocabReportsTab = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const students = useSelector(selectClassStudents);
    const [report, setReport] = useState('overview');
    const [filters, setFilters] = useState({ classId: '', studentId: '', listId: '', semester: '', from: '', to: '' });
    const [result, setResult] = useState(null);
    const [message, setMessage] = useState(null);
    const [lists, setLists] = useState([]);
    const [listsError, setListsError] = useState('');
    const [preferenceLoaded, setPreferenceLoaded] = useState(false);
    const [preferenceError, setPreferenceError] = useState('');
    const [selectedClassId, setSelectedClassId] = useState('');
    const [dashboardClassId, setDashboardClassId] = useState('');
    const [dashboard, setDashboard] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [dashboardError, setDashboardError] = useState('');
    const [savingClass, setSavingClass] = useState(false);
    const dashboardRequestId = useRef(0);

    useEffect(() => {
        let active = true;
        api.get('/vocabulary/lists')
            .then(({ data }) => { if (active) setLists(data.data); })
            .catch((error) => { if (active) setListsError(error.response?.data?.message || 'Unable to load vocabulary lists.'); });
        api.get('/vocabulary/dashboard-preference')
            .then(({ data }) => {
                if (!active) return;
                const defaultClassId = data.data.defaultClassId || '';
                setSelectedClassId(defaultClassId);
                setDashboardClassId(defaultClassId);
                if (defaultClassId) setFilters((current) => ({ ...current, classId: defaultClassId }));
                setPreferenceLoaded(true);
            })
            .catch((error) => {
                if (!active) return;
                setPreferenceError(error.response?.data?.message || 'Unable to load your saved class.');
                setPreferenceLoaded(true);
            });
        return () => { active = false; };
    }, []);

    const loadDashboard = useCallback(async (classId) => {
        if (!classId) return;
        const requestId = ++dashboardRequestId.current;
        setDashboardLoading(true);
        setDashboard(null);
        setDashboardError('');
        try {
            const { data } = await api.get('/vocabulary/reports/dashboard', { params: { classId } });
            if (dashboardRequestId.current === requestId) setDashboard(data.data);
        } catch (error) {
            if (dashboardRequestId.current === requestId) {
                setDashboard(null);
                setDashboardError(error.response?.data?.message || 'Unable to load the class dashboard.');
            }
        } finally {
            if (dashboardRequestId.current === requestId) setDashboardLoading(false);
        }
    }, []);

    useEffect(() => {
        if (preferenceLoaded && dashboardClassId) loadDashboard(dashboardClassId);
    }, [preferenceLoaded, dashboardClassId, loadDashboard]);

    useEffect(() => {
        if (filters.classId) dispatch(fetchClass(filters.classId));
    }, [dispatch, filters.classId]);

    const saveClass = async () => {
        if (!selectedClassId) return;
        const isCurrentClass = selectedClassId === dashboardClassId;
        setSavingClass(true);
        setPreferenceError('');
        try {
            await api.patch('/vocabulary/dashboard-preference', { defaultClassId: selectedClassId });
            setFilters((current) => ({ ...current, classId: selectedClassId, studentId: '' }));
            setDashboardClassId(selectedClassId);
            if (isCurrentClass) await loadDashboard(selectedClassId);
        } catch (error) {
            setPreferenceError(error.response?.data?.message || 'Unable to save your default class.');
        } finally {
            setSavingClass(false);
        }
    };

    const query = () => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
        return params;
    };
    const set = (key) => (event) => setFilters({ ...filters, [key]: event.target.value, ...(key === 'classId' ? { studentId: '' } : {}) });

    const run = async () => {
        setMessage(null);
        try {
            const { data } = await api.get(`/vocabulary/reports/${report}?${query()}`);
            setResult(data.data);
        } catch (error) {
            setResult(null);
            setMessage({ severity: 'error', text: error.response?.data?.message || 'Unable to build the report.' });
        }
    };
    const download = async () => {
        try {
            const params = query(); params.set('format', 'csv');
            const { data } = await api.get(`/vocabulary/reports/${report}?${params}`, { responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url; link.download = `vocabulary-${report}.csv`;
            document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        } catch {
            setMessage({ severity: 'error', text: 'Unable to download the CSV.' });
        }
    };

    const definition = REPORTS.find((r) => r.id === report);
    const className = classes.find((item) => item._id === dashboardClassId);
    const overview = dashboard?.rows?.overview || [];
    const activeLists = overview.filter((row) => row.attempts > 0);
    const answers = overview.reduce((sum, row) => sum + row.attempts, 0);
    const correct = overview.reduce((sum, row) => sum + row.correct, 0);
    const accuracy = answers ? Math.round((correct / answers) * 100) : null;
    const difficultWords = dashboard?.rows?.difficultWords || [];
    const notPractising = dashboard?.rows?.notPractising || [];
    const practiceActivity = weeklyActivity(dashboard?.rows?.activity || [], dashboard?.meta?.activityFrom, dashboard?.meta?.to);
    const listLabels = new Map(lists.map((list) => [list.listId, list.title || list.listId]));
    const listChartData = activeLists.map((row) => ({
        name: listLabels.get(row.listId) || row.listId,
        participation: row.participationPct ?? 0,
        accuracy: row.accuracyPct ?? 0
    }));
    const wordChartData = difficultWords.map((row) => ({ name: row.word, missRate: row.missPct ?? 0 }));
    const classLabel = className ? `${className.name}${className.section ? ` - ${className.section}` : ''}` : '';
    const formattedDate = (value) => value ? new Date(value).toLocaleDateString() : '';

    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant="h5" component="h2" gutterBottom>Vocabulary at a glance</Typography>
                <Typography color="text.secondary">
                    See how your class is practising this school year, which lists need attention, and who may need a check-in.
                </Typography>
            </Box>

            {preferenceError && <Alert severity="error" onClose={() => setPreferenceError('')}>{preferenceError}</Alert>}
            {listsError && <Alert severity="error" onClose={() => setListsError('')}>{listsError}</Alert>}
            {!preferenceLoaded ? (
                <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={20} /><Typography>Loading your saved class…</Typography></Stack>
            ) : (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 240 }}>
                        <InputLabel id="vocab-dashboard-class">Class</InputLabel>
                        <Select
                            labelId="vocab-dashboard-class"
                            label="Class"
                            value={selectedClassId}
                            onChange={(event) => setSelectedClassId(event.target.value)}
                        >
                            {selectedClassId && !classes.some((item) => item._id === selectedClassId) && (
                                <MenuItem value={selectedClassId} disabled>Loading saved class…</MenuItem>
                            )}
                            {classes.map((item) => (
                                <MenuItem key={item._id} value={item._id}>
                                    {`${item.name}${item.section ? ` - ${item.section}` : ''}`}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button
                        variant="contained"
                        onClick={saveClass}
                        disabled={!selectedClassId || savingClass}
                    >
                        {savingClass ? 'Saving…' : selectedClassId === dashboardClassId ? 'Refresh dashboard' : dashboardClassId ? 'Save class and refresh' : 'Open class dashboard'}
                    </Button>
                    <Typography variant="caption" color="text.secondary">Your class choice is saved to your account.</Typography>
                </Stack>
            )}

            {preferenceLoaded && !dashboardClassId && classes.length === 0 && (
                <Alert severity="info">No classes are available for your account yet.</Alert>
            )}
            {dashboardError && <Alert severity="error">{dashboardError}</Alert>}

            {dashboardClassId && (
                <>
                    <Typography variant="body2" color="text.secondary">
                        {classLabel ? `${classLabel} · ` : ''}School year {dashboard?.meta?.academicYear}
                        {dashboard?.meta && ` · ${formattedDate(dashboard.meta.from)}–${formattedDate(dashboard.meta.to)}`}
                    </Typography>
                    {dashboardLoading ? (
                        <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={20} /><Typography>Preparing your class overview…</Typography></Stack>
                    ) : dashboard && (
                        <>
                            {dashboard.meta.truncated && (
                                <Alert severity="warning">
                                    This overview reached the report limit of 50,000 answers. Narrow the date range in a detailed report for complete totals.
                                </Alert>
                            )}
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
                                <MetricCard label="Students in this class" value={dashboard.meta.students} detail="Based on the class roster" />
                                <MetricCard label="Answers this school year" value={answers.toLocaleString()} detail="Graded vocabulary answers" />
                                <MetricCard label="Class accuracy" value={percent(accuracy)} detail="Correct answers out of graded answers" />
                                <MetricCard label="May need a check-in" value={notPractising.length} detail={`No practice in the last ${dashboard.meta.inactiveDays} days`} />
                            </Box>

                            {dashboard.meta.students === 0 && (
                                <Alert severity="info">There are no students in this class yet. Add or enroll students to start tracking vocabulary practice.</Alert>
                            )}
                            {dashboard.meta.students > 0 && answers === 0 && (
                                <Alert severity="info">
                                    No vocabulary answers have been recorded for this class this school year. Assign a list and invite students to practise to start seeing progress here.
                                </Alert>
                            )}

                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" component="h3">How students are doing by list</Typography>
                                        <Typography variant="body2" color="text.secondary">Compare the share of students who practised with their accuracy.</Typography>
                                        {listChartData.length ? (
                                            <Box sx={{ width: '100%', height: 320, mt: 2 }}>
                                                <ResponsiveContainer>
                                                    <BarChart data={listChartData} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                        <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={64} />
                                                        <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={48} />
                                                        <Tooltip formatter={(value) => [`${value}%`]} />
                                                        <Legend />
                                                        <Bar dataKey="participation" name="Students who practised" fill="#3f51b5" radius={[4, 4, 0, 0]} />
                                                        <Bar dataKey="accuracy" name="Correct answers" fill="#2e7d32" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </Box>
                                        ) : <Typography sx={{ py: 4 }} color="text.secondary">List results will appear here after students practise.</Typography>}
                                    </CardContent>
                                </Card>

                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" component="h3">Words students often miss</Typography>
                                        <Typography variant="body2" color="text.secondary">These words had the highest share of incorrect answers this school year.</Typography>
                                        {wordChartData.length ? (
                                            <Box sx={{ width: '100%', height: 320, mt: 2 }}>
                                                <ResponsiveContainer>
                                                    <BarChart data={wordChartData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                        <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                                                        <YAxis type="category" dataKey="name" width={100} />
                                                        <Tooltip formatter={(value) => [`${value}%`, 'Incorrect answers']} />
                                                        <Bar dataKey="missRate" name="Incorrect answers" fill="#ed6c02" radius={[0, 4, 4, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </Box>
                                        ) : <Typography sx={{ py: 4 }} color="text.secondary">No difficult words to highlight yet.</Typography>}
                                    </CardContent>
                                </Card>
                            </Box>

                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="h6" component="h3">Practice activity</Typography>
                                    <Typography variant="body2" color="text.secondary">Recorded practice attempts each week over the last 12 weeks of this school year.</Typography>
                                    {practiceActivity.length ? (
                                        <Box sx={{ width: '100%', height: 280, mt: 2 }}>
                                            <ResponsiveContainer>
                                                <BarChart data={practiceActivity} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="week" interval="preserveStartEnd" />
                                                    <YAxis allowDecimals={false} />
                                                    <Tooltip formatter={(value) => [value, 'Practice attempts']} />
                                                    <Bar dataKey="attempts" name="Practice attempts" fill="#0288d1" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </Box>
                                    ) : <Typography sx={{ py: 4 }} color="text.secondary">Practice activity will appear here when students start practising.</Typography>}
                                </CardContent>
                            </Card>

                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="h6" component="h3">Students who may need a check-in</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        Students with no recorded vocabulary practice in the last {dashboard.meta.inactiveDays} days.
                                    </Typography>
                                    {notPractising.length ? (
                                        <Table size="small" aria-label="Students who may need a check-in">
                                            <TableHead><TableRow><TableCell>Student</TableCell><TableCell>Last practised</TableCell></TableRow></TableHead>
                                            <TableBody>
                                                {notPractising.slice(0, 10).map((student) => (
                                                    <TableRow key={student.studentId}>
                                                        <TableCell>{student.name || 'Unnamed student'}</TableCell>
                                                        <TableCell>{student.lastPracticed ? formattedDate(student.lastPracticed) : 'Never practised'}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : <Typography color="text.secondary">
                                        {dashboard.meta.students ? 'Everyone in this class has practised recently.' : 'There are no students to show yet.'}
                                    </Typography>}
                                    {notPractising.length > 10 && (
                                        <Typography variant="caption" color="text.secondary">Showing 10 of {notPractising.length} students. Use the detailed report to download the full list.</Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}
                </>
            )}

            {dashboardClassId && (
                <Stack spacing={2}>
                    <Typography variant="h5" component="h2">Detailed reports</Typography>
                    <Typography color="text.secondary">Filter, review exact results, or download a spreadsheet.</Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel id="vr-report">Report</InputLabel>
                            <Select labelId="vr-report" label="Report" value={report} onChange={(e) => { setReport(e.target.value); setResult(null); }}>
                                {REPORTS.map((r) => <MenuItem key={r.id} value={r.id}>{r.label}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                            <InputLabel id="vr-class">Class</InputLabel>
                            <Select labelId="vr-class" label="Class" value={filters.classId} onChange={set('classId')}>
                                <MenuItem value="">All my classes</MenuItem>
                                {classes.map((c) => <MenuItem key={c._id} value={c._id}>{`${c.name}${c.section ? ` - ${c.section}` : ''}`}</MenuItem>)}
                            </Select>
                        </FormControl>
                        {(report === 'student' || filters.studentId) && (
                            <FormControl size="small" sx={{ minWidth: 200 }}>
                                <InputLabel id="vr-student">Student</InputLabel>
                                <Select labelId="vr-student" label="Student" value={filters.studentId} onChange={set('studentId')} disabled={!filters.classId}>
                                    <MenuItem value="">Choose a class first</MenuItem>
                                    {(filters.classId ? students : []).map((s) => <MenuItem key={s._id} value={s._id}>{`${s.firstName || ''} ${s.lastName || ''}`.trim()}</MenuItem>)}
                                </Select>
                            </FormControl>
                        )}
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel id="vr-list">List</InputLabel>
                            <Select labelId="vr-list" label="List" value={filters.listId} onChange={set('listId')}>
                                <MenuItem value="">All lists</MenuItem>
                                {lists.filter((l) => !filters.semester || String(l.semester) === String(filters.semester)).map((l) => <MenuItem key={l.listId} value={l.listId}>{l.title || l.listId}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                            <InputLabel id="vr-semester">Semester</InputLabel>
                            <Select labelId="vr-semester" label="Semester" value={filters.semester} onChange={(e) => setFilters({ ...filters, semester: e.target.value, listId: '' })}>
                                <MenuItem value="">All semesters</MenuItem>
                                {[...new Set(lists.map((l) => l.semester))].sort().map((s) => <MenuItem key={s} value={String(s)}>Semester {s}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField size="small" label="From" type="date" value={filters.from} onChange={set('from')} InputLabelProps={{ shrink: true }} />
                        <TextField size="small" label="To" type="date" value={filters.to} onChange={set('to')} InputLabelProps={{ shrink: true }} />
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" onClick={run} disabled={report === 'student' && !filters.studentId}>Show report</Button>
                        <Button variant="outlined" onClick={download} disabled={report === 'student' && !filters.studentId}>Download CSV</Button>
                    </Stack>
                    {message && <Alert severity={message.severity}>{message.text}</Alert>}
                    {result && (
                        <>
                            {result.meta?.student && <Typography>{result.meta.student}: {result.meta.minutesPracticed} minutes practised</Typography>}
                            <Table size="small" aria-label={definition.label}>
                                <TableHead><TableRow>{definition.columns.map(([, label]) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
                                <TableBody>
                                    {result.rows.map((row, i) => (
                                        <TableRow key={i}>{definition.columns.map(([key, label]) => <TableCell key={label} dir="auto">{cell(row, key)}</TableCell>)}</TableRow>
                                    ))}
                                    {result.rows.length === 0 && <TableRow><TableCell colSpan={definition.columns.length}>No data for these filters.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </>
                    )}
                </Stack>
            )}
        </Stack>
    );
};

export default VocabReportsTab;
