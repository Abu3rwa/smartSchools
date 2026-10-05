import { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, FormControl, IconButton, Menu, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineEllipsisVertical } from 'react-icons/hi2';
import { isSkippedSpellingAttempt } from './spellingTeacherConstants';

const SpellingStudentRosterTable = ({
    selectedClass,
    classStudents,
    overviewLoading,
    rowLevels,
    studentHistoryMap,
    rowActionLoadingId,
    savingRowId,
    exportingRowId,
    onUpdateRowLevel,
    onOpenSessionReview,
    onViewStudentSessions,
    onEndActiveSession,
    onStartStudentSession,
    onExportStudentReport
}) => {
    const navigate = useNavigate();
    const { t } = useTranslation('spelling');
    const [actionsAnchor, setActionsAnchor] = useState(null);
    const [actionsStudent, setActionsStudent] = useState(null);

    return (
        <Card sx={{ mb: 3 }}>
            <CardContent>
                <Typography variant="h6" gutterBottom>{selectedClass?.name || t('allStudentsOverview')}</Typography>
                {overviewLoading && <Typography color="text.secondary">{t('loadingWords')}</Typography>}
                {!classStudents.length ? <Typography color="text.secondary">{t('noWords')}</Typography> : <TableContainer><Table size="small">
                    <TableHead><TableRow>
                        <TableCell>{t('student')}</TableCell>
                        <TableCell>{t('spellingGrade')}</TableCell>
                        <TableCell>{t('spellingWeek')}</TableCell>
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
                            const currentWordNumber = rowActiveSession?.nextSequence
                                || (rowActiveSession?.attempts?.length || 0) + 1;
                            const rowBusy = rowActionLoadingId === student._id;

                            return (
                                <TableRow key={student._id}>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                            <Typography variant="body2" sx={{ fontWeight: rowActiveSession ? 600 : 400 }}>
                                                {student.firstName} {student.lastName}
                                            </Typography>
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
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.25 }}>
                                            <Typography variant="caption" color="text.secondary">{t('studentId', { id: student.studentId })}</Typography>
                                            {rowActiveSession && (
                                                <>
                                                    <Chip
                                                        size="small"
                                                        label={`${t('wordNumber', { count: currentWordNumber })} · ${rowActiveSession.mode === 'self-serve' ? 'Self-serve' : 'Teacher-led'}`}
                                                        color="primary"
                                                        variant="outlined"
                                                        sx={{ height: 20, fontSize: '0.72rem', fontWeight: 600 }}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        label={`${rowActiveSession.mistakeCount || 0} mistakes`}
                                                        color={rowActiveSession.mistakeCount > 0 ? 'error' : 'default'}
                                                        variant="outlined"
                                                        sx={{ height: 20, fontSize: '0.72rem' }}
                                                    />
                                                </>
                                            )}
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <FormControl size="small" sx={{ minWidth: 110 }}>
                                            <Select displayEmpty value={level.grade} onChange={(event) => onUpdateRowLevel(student, 'grade', event.target.value)} disabled={savingRowId === student._id}>
                                                <MenuItem value="">{t('selectGrade')}</MenuItem>
                                                {['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                    <TableCell>
                                        <FormControl size="small" sx={{ minWidth: 110 }}>
                                            <Select displayEmpty value={level.week} onChange={(event) => onUpdateRowLevel(student, 'week', event.target.value)} disabled={savingRowId === student._id}>
                                                <MenuItem value="">{t('selectWeek')}</MenuItem>
                                                {Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <MenuItem key={week} value={week}>{week}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                                            {rowActiveSession
                                                ? <>
                                                    <Button size="small" variant="contained" onClick={() => onOpenSessionReview(student, rowActiveSession)} disabled={rowBusy}>Open session</Button>
                                                    <Button size="small" color="error" variant="outlined" onClick={() => onEndActiveSession(student)} disabled={rowBusy}>{t('endActiveSession')}</Button>
                                                </>
                                                : <Button size="small" variant="contained" onClick={() => onStartStudentSession(student)} disabled={rowBusy || !level.grade || !level.week}>{t('startStudentSession')}</Button>}
                                            {studentSessions.length > 0 && (
                                                <Button size="small" variant="contained" onClick={() => onViewStudentSessions(student)} disabled={rowBusy}>
                                                    View details
                                                </Button>
                                            )}
                                            <Tooltip title="More student actions">
                                                <IconButton
                                                    size="small"
                                                    aria-label={`More actions for ${student.firstName} ${student.lastName}`}
                                                    onClick={(event) => { setActionsAnchor(event.currentTarget); setActionsStudent(student); }}
                                                    disabled={rowBusy}
                                                >
                                                    <HiOutlineEllipsisVertical />
                                                </IconButton>
                                            </Tooltip>
                                            <Menu
                                                anchorEl={actionsAnchor}
                                                open={Boolean(actionsAnchor) && actionsStudent?._id === student._id}
                                                onClose={() => { setActionsAnchor(null); setActionsStudent(null); }}
                                            >
                                                {skippedSession && skippedCount > 0 && (
                                                    <MenuItem onClick={() => { onOpenSessionReview(student, skippedSession); setActionsAnchor(null); setActionsStudent(null); }}>
                                                        {t('reviewSkippedWords', { count: skippedCount })}
                                                    </MenuItem>
                                                )}
                                                <MenuItem onClick={() => { onExportStudentReport(student); setActionsAnchor(null); setActionsStudent(null); }} disabled={exportingRowId === student._id}>
                                                    {exportingRowId === student._id ? t('exporting') : t('exportReport')}
                                                </MenuItem>
                                                <MenuItem onClick={() => navigate(`/portal/students/${student._id}`)}>{t('viewDetailsCharts')}</MenuItem>
                                            </Menu>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table></TableContainer>}
            </CardContent>
        </Card>
    );
};

export default SpellingStudentRosterTable;
