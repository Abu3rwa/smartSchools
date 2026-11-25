import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { GRADE_ORDER, WORD_LIMITS, draftIssues, patchFromDraft } from './libraryDeltas.js';

const weeksForGrade = (grade) => (grade === 'KG' ? 40 : 36);

const issueKey = (issue) => ({
    WORD_REQUIRED: 'wordRequired',
    WORD_TOO_LONG: 'library.wordTooLong',
    CATEGORY_REQUIRED: 'library.categoryRequired',
    CATEGORY_TOO_LONG: 'library.categoryTooLong',
    DEFINITION_TOO_LONG: 'library.definitionTooLong'
}[issue]);

const SpellingWordEditor = ({
    open,
    resetKey,
    mode = 'edit',
    row = null,
    defaults = {},
    grades = GRADE_ORDER,
    categories = [],
    busy = false,
    error = null,
    onClose,
    onPreview
}) => {
    const { t } = useTranslation('spelling');
    const [draft, setDraft] = useState({ word: '', category: '', definition: '' });
    const [grade, setGrade] = useState(defaults.grade || GRADE_ORDER[0]);
    const [week, setWeek] = useState(defaults.week ? String(defaults.week) : '1');
    const [position, setPosition] = useState('');
    const [toWeek, setToWeek] = useState(row?.week ? String(row.week) : '1');
    const [toPosition, setToPosition] = useState('');
    const [typoConfirmed, setTypoConfirmed] = useState(false);
    const [reason, setReason] = useState('');
    const [attempted, setAttempted] = useState(false);

    useEffect(() => {
        setAttempted(false);
        setReason('');
        setPosition('');
        setTypoConfirmed(false);
        if (mode === 'add') {
            setDraft({ word: '', category: '', definition: '' });
            setGrade(grades[0] || defaults.grade || GRADE_ORDER[0]);
            setWeek(defaults.week ? String(defaults.week) : '1');
        } else {
            setDraft({
                word: row?.word || '',
                category: row?.category || '',
                definition: row?.definition || ''
            });
            setGrade(row?.grade || grades[0] || GRADE_ORDER[0]);
            setToWeek(row?.week ? String(row.week) : '1');
            setToPosition(row ? String(row.order + 1) : '');
        }
        // Reset per dialog session; drafts survive reopening after a preview.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const patch = useMemo(() => (mode === 'edit' ? patchFromDraft(row, draft) : null), [draft, mode, row]);
    const issues = mode === 'archive' ? [] : draftIssues(draft);
    const rename = Boolean(patch && patch.word !== undefined);
    const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 5;
    const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 500;
    const weekLimit = weeksForGrade(grade);
    const moveWeekLimit = weeksForGrade(row?.grade || GRADE_ORDER[0]);

    const positionValue = position.trim() === '' ? null : Number(position);
    const positionInvalid = positionValue !== null && (!Number.isInteger(positionValue) || positionValue < 1);
    const toWeekInvalid = !Number.isInteger(Number(toWeek)) || Number(toWeek) < 1 || Number(toWeek) > moveWeekLimit;
    const toPositionValue = toPosition.trim() === '' ? null : Number(toPosition);
    const toPositionInvalid = toPositionValue === null || !Number.isInteger(toPositionValue) || toPositionValue < 1;

    const submitDisabled = busy
        || !reasonOk
        || issues.length > 0
        || (mode === 'edit' && (!patch || (rename && !typoConfirmed)))
        || (mode === 'add' && (positionInvalid || !Number.isInteger(Number(week))))
        || (mode === 'move' && (toWeekInvalid || toPositionInvalid));

    const submit = () => {
        setAttempted(true);
        if (submitDisabled) return;
        const trimmedReason = reason.trim();
        if (mode === 'add') {
            onPreview({
                kind: 'add',
                grade,
                week: Number(week),
                category: draft.category.trim(),
                word: draft.word.trim(),
                ...(draft.definition.trim() ? { definition: draft.definition.trim() } : {}),
                ...(positionValue !== null ? { position: positionValue } : {})
            }, trimmedReason);
            return;
        }
        if (mode === 'edit') {
            onPreview({
                kind: 'patch',
                wordId: row._id,
                patch,
                ...(rename ? { changeType: 'typo' } : {})
            }, trimmedReason);
            return;
        }
        if (mode === 'move') {
            onPreview({
                kind: 'move',
                wordId: row._id,
                toWeek: Number(toWeek),
                toPosition: toPositionValue
            }, trimmedReason);
            return;
        }
        onPreview({ kind: 'remove', wordId: row._id }, trimmedReason);
    };

    const title = mode === 'add'
        ? t('library.newWordTitle')
        : mode === 'archive'
            ? t('library.archiveTitle')
            : mode === 'move'
                ? t('library.moveTitle')
                : t('library.editWordTitle');

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : onClose}
            fullWidth
            maxWidth="sm"
            sx={{ '& .MuiAutocomplete-clearIndicator': { minWidth: { xs: 44 }, minHeight: { xs: 44 } } }}
        >
            <DialogTitle>
                {title}
                {mode !== 'add' && row && (
                    <Typography variant="body2" color="text.secondary" component="div">
                        {t('library.editContext', { grade: row.grade, week: row.week, category: row.category })}
                    </Typography>
                )}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {error && (
                        <Alert severity="error" role="alert">
                            {error.message}
                            {error.code && ['STALE_REVISION', 'STALE_LIBRARY', 'CHANGE_TYPE_REQUIRED'].includes(error.code)
                                && <Typography variant="body2" sx={{ mt: 0.5 }}>{t('library.conflictKeptDraft')}</Typography>}
                        </Alert>
                    )}

                    {mode === 'archive' && (
                        <Alert severity="warning">{t('library.archiveNote')}</Alert>
                    )}

                    {mode === 'move' && (
                        <>
                            <Typography variant="body2" color="text.secondary">
                                {t('library.moveHelp', { grade: row?.grade || '' })}
                            </Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>{t('library.toWeek')}</InputLabel>
                                    <Select
                                        value={toWeek}
                                        label={t('library.toWeek')}
                                        onChange={(event) => setToWeek(event.target.value)}
                                    >
                                        {Array.from({ length: moveWeekLimit }, (_, index) => index + 1).map((value) => (
                                            <MenuItem key={value} value={String(value)}>{t('weekWithNumber', { week: value })}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label={t('library.toPosition')}
                                    inputMode="numeric"
                                    value={toPosition}
                                    onChange={(event) => setToPosition(event.target.value.replace(/[^0-9]/g, ''))}
                                    error={attempted && toPositionInvalid}
                                    helperText={attempted && toPositionInvalid ? t('invalidImportOrder') : ' '}
                                />
                            </Stack>
                        </>
                    )}

                    {(mode === 'edit' || mode === 'add') && (
                        <>
                            {mode === 'add' && (
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>{t('grade')}</InputLabel>
                                        <Select value={grade} label={t('grade')} onChange={(event) => {
                                            const next = event.target.value;
                                            setGrade(next);
                                            if (Number(week) > weeksForGrade(next)) setWeek('1');
                                        }}>
                                            {grades.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>{t('week')}</InputLabel>
                                        <Select value={week} label={t('week')} onChange={(event) => setWeek(event.target.value)}>
                                            {Array.from({ length: weekLimit }, (_, index) => index + 1).map((value) => (
                                                <MenuItem key={value} value={String(value)}>{t('weekWithNumber', { week: value })}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <TextField
                                        size="small"
                                        label={t('library.positionLabel')}
                                        inputMode="numeric"
                                        value={position}
                                        onChange={(event) => setPosition(event.target.value.replace(/[^0-9]/g, ''))}
                                        error={attempted && positionInvalid}
                                        helperText={positionInvalid ? t('invalidImportOrder') : t('library.positionHelp')}
                                        sx={{ minWidth: 140 }}
                                    />
                                </Stack>
                            )}
                            <TextField
                                autoFocus
                                fullWidth
                                label={t('word')}
                                value={draft.word}
                                onChange={(event) => setDraft((current) => ({ ...current, word: event.target.value }))}
                                slotProps={{ htmlInput: { maxLength: WORD_LIMITS.word } }}
                                error={attempted && issues.some((issue) => issue.startsWith('WORD'))}
                                helperText={attempted && issues.find((issue) => issue.startsWith('WORD'))
                                    ? t(issueKey(issues.find((issue) => issue.startsWith('WORD'))))
                                    : t('library.wordHelp')}
                            />
                            <Autocomplete
                                freeSolo
                                options={categories}
                                value={draft.category}
                                inputValue={draft.category}
                                onInputChange={(_, value) => setDraft((current) => ({ ...current, category: value }))}
                                onChange={(_, value) => setDraft((current) => ({ ...current, category: value || '' }))}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label={t('category')}
                                        error={attempted && issues.some((issue) => issue.startsWith('CATEGORY'))}
                                        helperText={attempted && issues.find((issue) => issue.startsWith('CATEGORY'))
                                            ? t(issueKey(issues.find((issue) => issue.startsWith('CATEGORY'))))
                                            : t('library.categoryHelp')}
                                    />
                                )}
                            />
                            <TextField
                                fullWidth
                                multiline
                                minRows={2}
                                label={t('library.definition')}
                                value={draft.definition}
                                onChange={(event) => setDraft((current) => ({ ...current, definition: event.target.value }))}
                                slotProps={{ htmlInput: { maxLength: WORD_LIMITS.definition } }}
                                error={attempted && issues.includes('DEFINITION_TOO_LONG')}
                                helperText={attempted && issues.includes('DEFINITION_TOO_LONG')
                                    ? t(issueKey('DEFINITION_TOO_LONG'))
                                    : t('library.definitionHelp')}
                            />
                            {mode === 'edit' && rename && (
                                <FormControlLabel
                                    control={<Checkbox checked={typoConfirmed} onChange={(event) => setTypoConfirmed(event.target.checked)} />}
                                    label={
                                        <Box>
                                            <Typography variant="body2">{t('library.typoConfirm')}</Typography>
                                            <Typography variant="caption" color="text.secondary">{t('library.typoHelp')}</Typography>
                                        </Box>
                                    }
                                />
                            )}
                        </>
                    )}

                    <TextField
                        fullWidth
                        label={t('library.reasonLabel')}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        helperText={reasonTooShort ? t('library.reasonRequired') : t('library.reasonHelp')}
                        error={attempted && !reasonOk}
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, '& .MuiButton-root': { minHeight: { xs: 44 } } }}>
                <Button onClick={onClose} disabled={busy}>{t('cancel')}</Button>
                <Button variant="contained" onClick={submit} disabled={submitDisabled}>
                    {mode === 'archive' ? t('library.archiveConfirm') : mode === 'move' ? t('library.previewMove') : t('library.previewChange')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SpellingWordEditor;
