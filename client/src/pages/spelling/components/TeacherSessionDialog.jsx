import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogContent, Fade, IconButton, Stack, TextField, Typography } from '@mui/material';
import { HiOutlineCheck, HiOutlineXMark, HiOutlineArrowLeft, HiOutlineClock } from 'react-icons/hi2';

const TeacherSessionDialog = ({
    activeSession,
    onClose,
    selectedStudent,
    t,
    integrityEvents,
    missedWords,
    skippedWords,
    passage,
    passageContent,
    setPassageContent,
    passageLoading,
    onGeneratePassage,
    onUpdatePassage,
    onApprovePassage,
    onSendPassage,
    onDiscardPassage,
    onCancelPassageSend,
    passageStatusColor,
    currentItem,
    mistakesAllowed,
    mistakePips,
    gradingFeedback,
    dictionaryEntry,
    loading,
    onGradeAttempt
}) => (
    <Dialog
        fullScreen={activeSession?.status === 'in-progress'}
        open={Boolean(activeSession)}
        onClose={onClose}
        maxWidth="md"
        fullWidth
    >
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', p: { xs: 2, md: 5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <IconButton aria-label="Exit session" onClick={onClose}><HiOutlineArrowLeft /></IconButton>
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
                                {(!passage || passage.status === 'discarded') && (
                                    <Stack spacing={1} alignItems="center">
                                        <Chip size="small" label="Not sent" color="default" />
                                        <Button variant="outlined" onClick={onGeneratePassage} disabled={passageLoading || missedWords.length === 0}>
                                            {passageLoading ? 'Generating...' : 'Generate practice passage'}
                                        </Button>
                                    </Stack>
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
                                            disabled={passageLoading || ['queued', 'sent'].includes(passage.status)}
                                            helperText={passage.status === 'queued'
                                                ? 'Email queued. Cancel the queued email before editing.'
                                                : passage.status === 'sent'
                                                    ? 'Already sent. Generate a new draft if the student needs more practice.'
                                                    : 'Review and edit the passage before sending.'}
                                        />
                                        {['draft', 'approved', 'failed'].includes(passage.status) && <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap">
                                            <Button size="small" onClick={onUpdatePassage} disabled={passageLoading}>Save</Button>
                                            <Button size="small" onClick={onGeneratePassage} disabled={passageLoading || missedWords.length === 0}>Regenerate</Button>
                                            {passage.status === 'draft' && <Button size="small" variant="contained" onClick={onApprovePassage} disabled={passageLoading}>Approve</Button>}
                                            {['approved', 'failed'].includes(passage.status) && <Button size="small" variant="contained" onClick={onSendPassage} disabled={passageLoading}>{passage.status === 'failed' ? 'Retry send' : 'Save & send'}</Button>}
                                            <Button size="small" color="error" onClick={onDiscardPassage} disabled={passageLoading}>Cancel passage</Button>
                                        </Stack>}
                                        {passage.status === 'queued' && <Stack spacing={1} alignItems="center">
                                            <Typography variant="body2" color="text.secondary">You can still cancel delivery while it is waiting to send.</Typography>
                                            <Button size="small" color="error" variant="outlined" onClick={onCancelPassageSend} disabled={passageLoading}>Cancel queued email</Button>
                                        </Stack>}
                                        {passage.status === 'sent' && <Stack spacing={1} alignItems="center">
                                            <Typography variant="body2" color="text.secondary" textAlign="center">This passage was sent. A new generated passage will be created for additional practice.</Typography>
                                            <Button size="small" variant="outlined" onClick={onGeneratePassage} disabled={passageLoading || missedWords.length === 0}>
                                                {passageLoading ? 'Generating...' : 'Regenerate passage'}
                                            </Button>
                                        </Stack>}
                                        {activeSession?.hasSentPassage && passage.status !== 'sent' && <Typography variant="body2" color="success.main" textAlign="center">Previous passage status: sent</Typography>}
                                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                                            <Chip size="small" label={passage.status} color={passageStatusColor[passage.status] || 'default'} />
                                        </Stack>
                                    </Stack>
                                )}
                                <Button variant="contained" onClick={onClose}>Back to student</Button>
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
                                <Button fullWidth variant="contained" color="success" startIcon={<HiOutlineCheck />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => onGradeAttempt(true)} disabled={loading || Boolean(gradingFeedback)}>{t('correct')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(Y / Right)</Typography></Button>
                                <Button fullWidth variant="contained" color="error" startIcon={<HiOutlineXMark />} sx={{ minHeight: 64, fontSize: '1.1rem' }} onClick={() => onGradeAttempt(false)} disabled={loading || Boolean(gradingFeedback)}>{t('incorrect')}<Typography component="span" variant="caption" sx={{ ml: 1 }}>(N / Left)</Typography></Button>
                            </Stack>
                        )}
                    </Stack>
                )}
            </Box>
        </DialogContent>
    </Dialog>
);

export default TeacherSessionDialog;
