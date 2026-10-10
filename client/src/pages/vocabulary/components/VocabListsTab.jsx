import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../../config/api';
import { fetchClass, selectClassStudents, selectClasses } from '../../../store/slices/classSlice';

const errorText = (error, fallback) => error.response?.data?.message || fallback;

const AssignDialog = ({ list, onClose, onSaved }) => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const classStudents = useSelector(selectClassStudents);
    const [classIds, setClassIds] = useState([]);
    const [studentIds, setStudentIds] = useState([]);
    const [studentClassId, setStudentClassId] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!list) return;
        setError('');
        setStudentClassId('');
        api.get(`/vocabulary/lists/${list.listId}/assignments`)
            .then(({ data }) => { setClassIds(data.data.classIds); setStudentIds(data.data.studentIds); })
            .catch((requestError) => setError(errorText(requestError, 'Unable to load assignments.')));
    }, [list]);

    useEffect(() => {
        if (studentClassId) dispatch(fetchClass(studentClassId));
    }, [dispatch, studentClassId]);

    const toggle = (setter) => (id) => setter((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

    const save = async () => {
        setSaving(true);
        try {
            await api.put(`/vocabulary/lists/${list.listId}/assignments`, { classIds, studentIds });
            onSaved();
            onClose();
        } catch (requestError) {
            setError(errorText(requestError, 'Unable to save assignments.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={Boolean(list)} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Assign {list?.title}</DialogTitle>
            <DialogContent>
                <Stack spacing={1}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Typography variant="subtitle2">Classes</Typography>
                    {classes.map((schoolClass) => (
                        <FormControlLabel
                            key={schoolClass._id}
                            control={<Checkbox checked={classIds.includes(schoolClass._id)} onChange={() => toggle(setClassIds)(schoolClass._id)} />}
                            label={`${schoolClass.name}${schoolClass.section ? ` - ${schoolClass.section}` : ''}`}
                        />
                    ))}
                    <Typography variant="subtitle2" sx={{ pt: 1 }}>Specific students (in addition to classes)</Typography>
                    <FormControl size="small">
                        <InputLabel id="vocab-student-class">Pick students from class</InputLabel>
                        <Select labelId="vocab-student-class" label="Pick students from class" value={studentClassId} onChange={(event) => setStudentClassId(event.target.value)}>
                            {classes.map((schoolClass) => <MenuItem key={schoolClass._id} value={schoolClass._id}>{schoolClass.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                    {studentClassId && classStudents.map((student) => (
                        <FormControlLabel
                            key={student._id}
                            control={<Checkbox checked={studentIds.includes(student._id)} onChange={() => toggle(setStudentIds)(student._id)} />}
                            label={`${student.firstName || ''} ${student.lastName || ''}`.trim() || student._id}
                        />
                    ))}
                    {studentIds.length > 0 && <Typography variant="caption" color="text.secondary">{studentIds.length} student(s) selected</Typography>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
            </DialogActions>
        </Dialog>
    );
};

const VocabListsTab = () => {
    const [lists, setLists] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [message, setMessage] = useState(null);
    const [assigning, setAssigning] = useState(null);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get('/vocabulary/lists');
            setLists(data.data);
        } catch (error) {
            setMessage({ severity: 'error', text: errorText(error, 'Unable to load lists.') });
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const draftOf = (list) => ({ title: list.title, lessonTitle: list.lessonTitle, order: list.order, ...(drafts[list.listId] || {}) });
    const setDraft = (list, field, value) => setDrafts((current) => ({ ...current, [list.listId]: { ...(current[list.listId] || {}), [field]: value } }));

    const patch = async (list, body) => {
        try {
            await api.patch(`/vocabulary/lists/${list.listId}`, body);
            setDrafts((current) => { const next = { ...current }; delete next[list.listId]; return next; });
            setMessage({ severity: 'success', text: `${list.listId} saved.` });
            await load();
        } catch (error) {
            setMessage({ severity: 'error', text: errorText(error, 'Unable to save the list.') });
        }
    };

    const seed = async () => {
        try {
            const { data } = await api.post('/vocabulary/seed');
            setMessage({ severity: 'success', text: `Loaded ${data.data.lists} lists and ${data.data.words} words (existing ones were left unchanged).` });
            await load();
        } catch (error) {
            setMessage({ severity: 'error', text: errorText(error, 'Unable to load the starter data.') });
        }
    };

    return (
        <Stack spacing={2}>
            {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
            <Stack direction="row" spacing={2} alignItems="center">
                <Button variant="outlined" onClick={seed}>Load starter lists (13 lists, 96 words)</Button>
                <Typography variant="body2" color="text.secondary">Safe to run again; it never overwrites your edits.</Typography>
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label="Vocabulary lists">
                    <TableHead>
                        <TableRow>
                            <TableCell>ID</TableCell><TableCell>Title</TableCell><TableCell>Reading lesson</TableCell>
                            <TableCell>Order</TableCell><TableCell>Words</TableCell><TableCell>Visible</TableCell><TableCell>Accept base word</TableCell><TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {lists.map((list) => {
                            const draft = draftOf(list);
                            const dirty = Boolean(drafts[list.listId]);
                            return (
                                <TableRow key={list.listId}>
                                    <TableCell>{list.listId}</TableCell>
                                    <TableCell><TextField size="small" value={draft.title} onChange={(event) => setDraft(list, 'title', event.target.value)} inputProps={{ 'aria-label': `Title for ${list.listId}` }} /></TableCell>
                                    <TableCell><TextField size="small" value={draft.lessonTitle} onChange={(event) => setDraft(list, 'lessonTitle', event.target.value)} inputProps={{ 'aria-label': `Reading lesson for ${list.listId}` }} /></TableCell>
                                    <TableCell><TextField size="small" type="number" sx={{ width: 80 }} value={draft.order} onChange={(event) => setDraft(list, 'order', event.target.value)} inputProps={{ 'aria-label': `Order for ${list.listId}` }} /></TableCell>
                                    <TableCell>{list.wordCount}</TableCell>
                                    <TableCell><Switch checked={list.visible} onChange={(event) => patch(list, { visible: event.target.checked })} inputProps={{ 'aria-label': `Show ${list.listId} to students` }} /></TableCell>
<TableCell><Switch checked={Boolean(list.acceptBaseForm)} onChange={(event) => patch(list, { acceptBaseForm: event.target.checked })} inputProps={{ 'aria-label': `Accept the base word as correct for ${list.listId}` }} /></TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={1}>
                                            <Button size="small" variant="contained" disabled={!dirty} onClick={() => patch(list, draft)}>Save</Button>
                                            <Button size="small" onClick={() => setAssigning(list)}>Assign</Button>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {lists.length === 0 && <TableRow><TableCell colSpan={8}>No lists yet. Load the starter lists or import a lists CSV.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </Box>
            <AssignDialog list={assigning} onClose={() => setAssigning(null)} onSaved={() => setMessage({ severity: 'success', text: 'Assignments saved.' })} />
        </Stack>
    );
};

export default VocabListsTab;
