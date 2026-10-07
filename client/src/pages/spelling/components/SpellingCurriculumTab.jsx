import { useMemo, useRef, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material';
import { HiChevronDown, HiOutlineTrash } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';

const GRADES = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];
const VALIDATION_MESSAGE_KEYS = {
    'grade must be KG or G1-G5': 'invalidImportGrade',
    'week must be a positive integer': 'invalidImportWeek',
    'category is required and must be at most 120 characters': 'invalidImportCategory',
    'word is required and must be at most 200 characters': 'invalidImportWord',
    'definition must be at most 2000 characters': 'invalidImportDefinition',
    'order must be a positive integer': 'invalidImportOrder',
    'duplicate grade/week/order in file': 'duplicateImportPosition'
};

const SpellingCurriculumTab = ({
    wordFilters,
    setWordFilters,
    wordList,
    wordsLoading,
    importFile,
    setImportFile,
    setImportPreview,
    importPreview,
    importing,
    onPreviewWordList,
    onCommitWordList,
    onDeleteWord,
    deletingWordId
}) => {
    const { t } = useTranslation('spelling');
    const [replaceExisting, setReplaceExisting] = useState(false);
    const [wordToDelete, setWordToDelete] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const importCardRef = useRef(null);
    const fileInputRef = useRef(null);

    const filteredWords = useMemo(() => {
        const query = searchText.trim().toLocaleLowerCase();
        return wordList.filter((word) => (
            (!wordFilters.grade || word.grade === wordFilters.grade)
            && (!wordFilters.week || String(word.week) === String(wordFilters.week))
            && (!wordFilters.category || word.category === wordFilters.category)
            && (!query || word.word.toLocaleLowerCase().includes(query))
        ));
    }, [searchText, wordFilters.category, wordFilters.grade, wordFilters.week, wordList]);

    const groupedWords = useMemo(() => {
        const groups = {};
        for (const word of filteredWords) {
            const weeks = groups[word.grade] || (groups[word.grade] = {});
            const categories = weeks[word.week] || (weeks[word.week] = {});
            const categoryWords = categories[word.category] || (categories[word.category] = []);
            categoryWords.push(word);
        }
        return groups;
    }, [filteredWords]);

    const categories = useMemo(() => [...new Set(
        wordList
            .filter((word) => !wordFilters.grade || word.grade === wordFilters.grade)
            .map((word) => word.category)
    )].sort((a, b) => a.localeCompare(b)), [wordFilters.grade, wordList]);

    const weekGroups = Object.entries(groupedWords).flatMap(([grade, weeks]) => (
        Object.entries(weeks).map(([week, categoryGroups]) => ({
            grade,
            week,
            categories: categoryGroups,
            count: Object.values(categoryGroups).reduce((total, words) => total + words.length, 0)
        }))
    ));
    const maxWeek = !wordFilters.grade || wordFilters.grade === 'KG' ? 40 : 36;
    const hasActiveFilters = Boolean(wordFilters.grade || wordFilters.week || wordFilters.category || searchText);

    const updateImportFile = (file) => {
        setImportFile(file);
        setImportPreview(null);
    };

    const clearFilters = () => {
        setWordFilters({ grade: '', week: '', category: '' });
        setSearchText('');
    };

    const focusImportCard = () => {
        importCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        importCardRef.current?.focus({ preventScroll: true });
    };

    const closeDeleteDialog = () => setDeleteDialogOpen(false);

    return (
        <>
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 2fr) minmax(300px, 1fr)' },
                gridTemplateAreas: {
                    xs: '"import" "words"',
                    lg: '"words import"'
                },
                gap: 3,
                alignItems: 'start'
            }}>
                <Card sx={{ gridArea: 'words', minWidth: 0 }}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                        <Stack spacing={2}>
                            <Typography variant="h6">{t('wordListTitle')}</Typography>
                            <Box sx={{
                                position: 'sticky',
                                top: 8,
                                zIndex: 2,
                                bgcolor: 'background.paper',
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: 1,
                                p: 2
                            }}>
                                <Stack spacing={1.5}>
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>{t('grade')}</InputLabel>
                                            <Select
                                                value={wordFilters.grade}
                                                label={t('grade')}
                                                onChange={(event) => setWordFilters((current) => ({
                                                    ...current,
                                                    grade: event.target.value,
                                                    week: event.target.value && event.target.value !== 'KG' && Number(current.week) > 36
                                                        ? ''
                                                        : current.week
                                                }))}
                                            >
                                                <MenuItem value="">{t('allGrades')}</MenuItem>
                                                {GRADES.map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>{t('week')}</InputLabel>
                                            <Select
                                                value={wordFilters.week}
                                                label={t('week')}
                                                onChange={(event) => setWordFilters((current) => ({ ...current, week: event.target.value }))}
                                            >
                                                <MenuItem value="">{t('allWeeks')}</MenuItem>
                                                {Array.from({ length: maxWeek }, (_, index) => index + 1).map((week) => (
                                                    <MenuItem key={week} value={String(week)}>{t('weekWithNumber', { week })}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>{t('category')}</InputLabel>
                                            <Select
                                                value={wordFilters.category}
                                                label={t('category')}
                                                onChange={(event) => setWordFilters((current) => ({ ...current, category: event.target.value }))}
                                            >
                                                <MenuItem value="">{t('allCategories')}</MenuItem>
                                                {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                                        <TextField
                                            size="small"
                                            fullWidth
                                            label={t('searchWords')}
                                            value={searchText}
                                            onChange={(event) => setSearchText(event.target.value)}
                                        />
                                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                            <Typography variant="body2" color="text.secondary" aria-live="polite">
                                                {wordsLoading ? t('loadingWords') : t('wordCount', { count: filteredWords.length })}
                                            </Typography>
                                            <Button size="small" onClick={clearFilters} disabled={!hasActiveFilters}>
                                                {t('clearFilters')}
                                            </Button>
                                        </Stack>
                                    </Stack>
                                    {hasActiveFilters && <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                        {wordFilters.grade && <Chip size="small" label={wordFilters.grade} onDelete={() => setWordFilters((current) => ({ ...current, grade: '' }))} />}
                                        {wordFilters.week && <Chip size="small" label={t('weekWithNumber', { week: wordFilters.week })} onDelete={() => setWordFilters((current) => ({ ...current, week: '' }))} />}
                                        {wordFilters.category && <Chip size="small" label={wordFilters.category} onDelete={() => setWordFilters((current) => ({ ...current, category: '' }))} />}
                                        {searchText && <Chip size="small" label={`${t('searchWords')}: ${searchText}`} onDelete={() => setSearchText('')} />}
                                    </Stack>}
                                </Stack>
                            </Box>

                            {wordsLoading ? <Stack spacing={1}>
                                {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="rounded" height={54} />)}
                            </Stack> : weekGroups.length > 0 ? weekGroups.map(({ grade, week, categories: categoryGroups, count }) => (
                                <Accordion key={`${grade}-${week}`} disableGutters>
                                    <AccordionSummary expandIcon={<HiChevronDown />}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography fontWeight={600}>
                                                {wordFilters.grade ? '' : `${grade} · `}{t('weekWithNumber', { week })}
                                            </Typography>
                                            <Chip size="small" label={count} />
                                        </Stack>
                                    </AccordionSummary>
                                    <AccordionDetails>
                                        <Stack spacing={2}>
                                            {Object.entries(categoryGroups).map(([category, words]) => (
                                                <Box key={`${grade}-${week}-${category}`}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>{category}</Typography>
                                                    <Box sx={{
                                                        display: 'grid',
                                                        gridTemplateColumns: {
                                                            xs: 'minmax(0, 1fr)',
                                                            sm: 'repeat(2, minmax(0, 1fr))',
                                                            md: 'repeat(3, minmax(0, 1fr))'
                                                        },
                                                        gap: 0.75
                                                    }}>
                                                        {words.map((word) => <Chip
                                                            key={word._id}
                                                            label={word.word}
                                                            variant="outlined"
                                                            deleteIcon={<HiOutlineTrash />}
                                                            aria-label={t('removeWordAria', { word: word.word })}
                                                            disabled={String(deletingWordId) === String(word._id)}
                                                            onDelete={() => {
                                                                setWordToDelete(word);
                                                                setDeleteDialogOpen(true);
                                                            }}
                                                            sx={{ justifyContent: 'space-between', minWidth: 0, '& .MuiChip-label': { overflowWrap: 'anywhere' } }}
                                                        />)}
                                                    </Box>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </AccordionDetails>
                                </Accordion>
                            )) : <Stack spacing={1} alignItems="flex-start" sx={{ py: 3 }}>
                                <Typography color="text.secondary">{t('noWords')}</Typography>
                                <Button variant="outlined" onClick={focusImportCard}>{t('importWordList')}</Button>
                            </Stack>}
                        </Stack>
                    </CardContent>
                </Card>

                <Box sx={{ gridArea: 'import', minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
                    <Card ref={importCardRef} id="spelling-import-card" tabIndex={-1}>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">{t('importTitle')}</Typography>
                                <Typography variant="body2" color="text.secondary">{t('csvColumns')}</Typography>
                                <Button component="a" href="/spelling_words_sample.csv" download variant="outlined" sx={{ alignSelf: 'flex-start' }}>
                                    {t('downloadTemplate')}
                                </Button>
                                <Box
                                    component="label"
                                    onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDragLeave={(event) => {
                                        event.preventDefault();
                                        if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false);
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        setDragActive(false);
                                        updateImportFile(event.dataTransfer.files?.[0] || null);
                                    }}
                                    sx={{
                                        position: 'relative',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 1,
                                        p: 3,
                                        textAlign: 'center',
                                        border: '2px dashed',
                                        borderColor: dragActive ? 'primary.main' : 'divider',
                                        borderRadius: 1,
                                        bgcolor: dragActive ? 'action.hover' : 'transparent',
                                        cursor: 'pointer',
                                        '&:focus-within': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 }
                                    }}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv,text/csv"
                                        aria-label={t('chooseCsvFile')}
                                        onChange={(event) => {
                                            updateImportFile(event.target.files?.[0] || null);
                                            event.target.value = '';
                                        }}
                                        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
                                    />
                                    <Typography>{importFile ? importFile.name : t('dropCsvHere')}</Typography>
                                    {!importFile && <Typography variant="body2" color="text.secondary">{t('chooseCsvFile')}</Typography>}
                                </Box>
                                {importFile && <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                    <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{importFile.name}</Typography>
                                    <IconButton
                                        size="small"
                                        aria-label={t('removeSelectedFile')}
                                        title={t('removeSelectedFile')}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            updateImportFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                    >
                                        <HiOutlineTrash />
                                    </IconButton>
                                </Stack>}
                                <Button variant="contained" onClick={onPreviewWordList} disabled={!importFile || importing}>
                                    {t('preview')}
                                </Button>
                                {importing && <LinearProgress aria-label={t('importing')} />}
                                {importPreview && <>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                        <Chip size="small" label={t('rowCount', { count: importPreview.summary.totalRows })} />
                                        <Chip size="small" color="success" label={t('validRowCount', { count: importPreview.summary.validRows })} />
                                        {(importPreview.errors?.length || 0) > 0 && (
                                            <Chip size="small" color="error" label={t('errorRowCount', { count: importPreview.errors.length })} />
                                        )}
                                    </Stack>
                                    {importPreview.errors?.length > 0 ? (
                                        <Alert severity="error">
                                            <Typography variant="subtitle2">{t('validationErrors')}</Typography>
                                            <Box component="ul" sx={{ m: 0, ps: 2 }}>
                                                {importPreview.errors.map((error, index) => (
                                                    <li key={`${error.row}-${index}`}>
                                                        {t('validationErrorRow', {
                                                            row: error.row,
                                                            message: VALIDATION_MESSAGE_KEYS[error.message]
                                                                ? t(VALIDATION_MESSAGE_KEYS[error.message])
                                                                : error.message
                                                        })}
                                                    </li>
                                                ))}
                                            </Box>
                                        </Alert>
                                    ) : <>
                                        {importPreview.previewRows?.length > 0 && <Box>
                                            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('firstValidRows')}</Typography>
                                            <Box sx={{ overflowX: 'auto' }}>
                                                <Table size="small" aria-label={t('firstValidRows')}>
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell>{t('grade')}</TableCell>
                                                            <TableCell>{t('week')}</TableCell>
                                                            <TableCell>{t('category')}</TableCell>
                                                            <TableCell>{t('word')}</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {importPreview.previewRows.map((row, index) => (
                                                            <TableRow key={`${row.grade}-${row.week}-${row.order}-${index}`}>
                                                                <TableCell>{row.grade}</TableCell>
                                                                <TableCell>{row.week}</TableCell>
                                                                <TableCell>{row.category}</TableCell>
                                                                <TableCell>{row.word}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </Box>
                                        </Box>}
                                        <FormControlLabel
                                            control={<Checkbox checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} />}
                                            label={t('replaceExistingList')}
                                        />
                                        {replaceExisting && <>
                                            {importPreview.replaceEstimate && <Alert severity="info">
                                                {t('replaceEstimate', importPreview.replaceEstimate)}
                                            </Alert>}
                                            <Alert severity="warning">{t('replaceExistingWarning')}</Alert>
                                        </>}
                                        <Button
                                            variant="contained"
                                            color={replaceExisting ? 'warning' : 'primary'}
                                            onClick={() => replaceExisting ? setReplaceDialogOpen(true) : onCommitWordList(false)}
                                            disabled={importing || importPreview.summary.validRows === 0}
                                        >
                                            {replaceExisting ? t('replaceList') : t('commitImport')}
                                        </Button>
                                    </>}
                                </>}
                            </Stack>
                        </CardContent>
                    </Card>
                </Box>
            </Box>

            <Dialog
                open={deleteDialogOpen}
                onClose={closeDeleteDialog}
                slotProps={{ transition: { onExited: () => setWordToDelete(null) } }}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>{t('removeCurriculumWordTitle')}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {wordToDelete && t('removeCurriculumWordMessage', {
                            word: wordToDelete.word,
                            grade: wordToDelete.grade,
                            week: wordToDelete.week,
                            category: wordToDelete.category
                        })}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDeleteDialog} disabled={Boolean(deletingWordId)}>{t('cancel')}</Button>
                    <Button
                        color="error"
                        variant="contained"
                        disabled={!wordToDelete || Boolean(deletingWordId)}
                        onClick={async () => {
                            const succeeded = await onDeleteWord(wordToDelete);
                            if (succeeded) closeDeleteDialog();
                        }}
                    >
                        {deletingWordId ? t('removingWord') : t('removeWord')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={replaceDialogOpen} onClose={() => setReplaceDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('confirmReplaceTitle')}</DialogTitle>
                <DialogContent>
                    <Typography>{t('replaceExistingWarning')}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReplaceDialogOpen(false)} disabled={importing}>{t('cancel')}</Button>
                    <Button
                        color="warning"
                        variant="contained"
                        disabled={importing}
                        onClick={() => {
                            setReplaceDialogOpen(false);
                            onCommitWordList(true);
                        }}
                    >
                        {t('confirmReplace')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default SpellingCurriculumTab;
