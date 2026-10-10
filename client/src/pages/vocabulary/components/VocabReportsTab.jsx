import { useEffect, useState } from 'react';
import { Alert, Button, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
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

const VocabReportsTab = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const students = useSelector(selectClassStudents);
    const [report, setReport] = useState('overview');
    const [filters, setFilters] = useState({ classId: '', studentId: '', listId: '', semester: '', from: '', to: '' });
    const [result, setResult] = useState(null);
    const [message, setMessage] = useState(null);

    useEffect(() => { if (filters.classId) dispatch(fetchClass(filters.classId)); }, [dispatch, filters.classId]);

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
        } catch (e) {
            setResult(null);
            setMessage({ severity: 'error', text: e.response?.data?.message || 'Unable to build the report.' });
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
        } catch (e) {
            setMessage({ severity: 'error', text: 'Unable to download the CSV.' });
        }
    };

    const definition = REPORTS.find((r) => r.id === report);
    return (
        <Stack spacing={2}>
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
                <TextField size="small" label="List ID" value={filters.listId} onChange={set('listId')} placeholder="S1-L3" />
                <TextField size="small" label="Semester" type="number" value={filters.semester} onChange={set('semester')} sx={{ width: 110 }} />
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
    );
};

export default VocabReportsTab;
