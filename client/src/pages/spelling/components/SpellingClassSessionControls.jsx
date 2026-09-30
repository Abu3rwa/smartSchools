import { Box, Button, Card, CardContent, Chip, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';

const SpellingClassSessionControls = ({
    t,
    assessmentMode,
    setAssessmentMode,
    startClassSession,
    classId,
    classStudents,
    classStarting,
    maxMistakesAllowed,
    setMaxMistakesAllowed,
    emailNotification,
    setEmailNotification,
    passageEmailAudience,
    setPassageEmailAudience,
    passageEnabled,
    setPassageEnabled,
    passageTrigger,
    setPassageTrigger,
    passageStyle,
    setPassageStyle,
    sessionOverrideOpen,
    toggleSessionOverride
}) => (
    <Card sx={{ mb: 3 }}>
        <CardContent>
            <Stack spacing={2}>
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
                        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                            Passage emails require teacher review before sending. These overrides apply to sessions started from this tab only.
                        </Typography>
                    </Stack>}
                </Box>
            </Stack>
        </CardContent>
    </Card>
);

export default SpellingClassSessionControls;
