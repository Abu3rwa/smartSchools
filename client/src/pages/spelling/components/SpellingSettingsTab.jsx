import { Alert, Box, Button, Card, CardContent, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';

const SpellingSettingsTab = ({
    maxMistakesAllowed,
    setMaxMistakesAllowed,
    retestIntervalDays,
    setRetestIntervalDays,
    emailNotification,
    setEmailNotification,
    passageEmailAudience,
    setPassageEmailAudience,
    passageEnabled,
    setPassageEnabled,
    gradebookSubjectId,
    setGradebookSubjectId,
    gradebookSubjects = [],
    passageTrigger,
    setPassageTrigger,
    passageStyle,
    setPassageStyle,
    dictationEnabled,
    setDictationEnabled,
    dictationAutoPlay,
    setDictationAutoPlay,
    onSave
}) => (
    <Card>
        <CardContent>
            <Stack spacing={2}>
                <Box>
                    <Typography variant="h6">Spelling settings</Typography>
                    <Typography variant="body2" color="text.secondary">
                        These are the saved defaults for this class, used whenever a new session is started (unless overridden for a single session from the Assessments tab).
                    </Typography>
                </Box>
                <TextField label="Max mistakes before session ends" type="number" value={maxMistakesAllowed} inputProps={{ min: 1, max: 50 }} onChange={(event) => setMaxMistakesAllowed(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
                <Box>
                    <Typography variant="subtitle1">Formal spelling assessment Gradebook link</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Completed formal spelling assessments are added to this class subject under Quiz. Retest quizzes and ordinary spelling sessions are not added.
                    </Typography>
                </Box>
                {gradebookSubjects.length > 0 ? (
                    <FormControl fullWidth>
                        <InputLabel>Gradebook subject</InputLabel>
                        <Select
                            value={gradebookSubjectId}
                            label="Gradebook subject"
                            onChange={(event) => setGradebookSubjectId(event.target.value)}
                        >
                            <MenuItem value="">Do not add formal spelling assessments to Gradebook</MenuItem>
                            {gradebookSubjects.map((subject) => (
                                <MenuItem key={subject._id} value={subject._id}>{subject.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                ) : (
                    <Alert severity="warning">Add subjects to this class before linking formal spelling assessments to the Gradebook.</Alert>
                )}
                <Box>
                    <Typography variant="subtitle1">Graded spelling retest quiz</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Missed words become available in a self-serve graded quiz after this interval. Students receive the selected practice words by email when it is available. Words rotate through the queue, oldest review first.
                    </Typography>
                </Box>
                <FormControl fullWidth>
                    <InputLabel>Retest interval</InputLabel>
                    <Select value={retestIntervalDays} label="Retest interval" onChange={(event) => setRetestIntervalDays(Number(event.target.value))}>
                        <MenuItem value={7}>1 week</MenuItem>
                        <MenuItem value={30}>1 month</MenuItem>
                        <MenuItem value={60}>2 months</MenuItem>
                    </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                    Each quiz includes all due words the student previously misspelled. Words stay in the retest pool until the student spells each correctly on three consecutive quizzes, with less-confident words first.
                </Typography>
                <FormControl fullWidth>
                    <InputLabel>Send spelling results and retest quiz emails to</InputLabel>
                    <Select value={emailNotification} label="Send spelling results and retest quiz emails to" onChange={(event) => setEmailNotification(event.target.value)}>
                        <MenuItem value="none">Do not send</MenuItem>
                        <MenuItem value="student-only">Student only</MenuItem>
                        <MenuItem value="parents-only">Parents/guardians only</MenuItem>
                        <MenuItem value="student-and-parents">Student and parents/guardians</MenuItem>
                    </Select>
                </FormControl>
                <FormControl fullWidth>
                    <InputLabel>Send practice passage to</InputLabel>
                    <Select value={passageEmailAudience} label="Send practice passage to" onChange={(event) => setPassageEmailAudience(event.target.value)}>
                        <MenuItem value="none">Do not send</MenuItem>
                        <MenuItem value="student-only">Student only</MenuItem>
                        <MenuItem value="parents-only">Parents/guardians only</MenuItem>
                        <MenuItem value="student-and-parents">Student and parents/guardians</MenuItem>
                    </Select>
                </FormControl>
                <FormControl fullWidth>
                    <InputLabel>Passage generation</InputLabel>
                    <Select value={passageEnabled ? 'on' : 'off'} label="Passage generation" onChange={(event) => setPassageEnabled(event.target.value === 'on')}>
                        <MenuItem value="off">Off</MenuItem>
                        <MenuItem value="on">On</MenuItem>
                    </Select>
                </FormControl>
                {passageEnabled && <FormControl fullWidth>
                    <InputLabel>Passage trigger</InputLabel>
                    <Select value={passageTrigger} label="Passage trigger" onChange={(event) => setPassageTrigger(event.target.value)}>
                        <MenuItem value="manual">Manual</MenuItem>
                        <MenuItem value="automatic">Automatic</MenuItem>
                    </Select>
                </FormControl>}
                {passageEnabled && <FormControl fullWidth>
                    <InputLabel>Passage style</InputLabel>
                    <Select value={passageStyle} label="Passage style" onChange={(event) => setPassageStyle(event.target.value)}>
                        <MenuItem value="sentence-list">Sentence list</MenuItem>
                        <MenuItem value="passage">Paragraph</MenuItem>
                    </Select>
                </FormControl>}
                <FormControl fullWidth>
                    <InputLabel>Dictation mode</InputLabel>
                    <Select value={dictationEnabled ? 'on' : 'off'} label="Dictation mode" onChange={(event) => setDictationEnabled(event.target.value === 'on')}>
                        <MenuItem value="off">Off - show the word</MenuItem>
                        <MenuItem value="on">On - hear the word</MenuItem>
                    </Select>
                </FormControl>
                {dictationEnabled && <FormControl fullWidth>
                    <InputLabel>Auto-play pronunciation</InputLabel>
                    <Select value={dictationAutoPlay ? 'on' : 'off'} label="Auto-play pronunciation" onChange={(event) => setDictationAutoPlay(event.target.value === 'on')}>
                        <MenuItem value="on">On</MenuItem>
                        <MenuItem value="off">Off - use Play sound</MenuItem>
                    </Select>
                </FormControl>}
                <Button variant="contained" onClick={onSave}>Save class settings</Button>
            </Stack>
        </CardContent>
    </Card>
);

export default SpellingSettingsTab;
