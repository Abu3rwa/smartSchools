import { Alert, Box, Button, Card, CardContent, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

const SpellingCurriculumTab = ({
    wordFilters,
    setWordFilters,
    wordCategories,
    wordList,
    wordsLoading,
    importFile,
    setImportFile,
    setImportPreview,
    importPreview,
    importing,
    onPreviewWordList,
    onCommitWordList
}) => {
    const { t } = useTranslation('spelling');

    return (
        <>
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">{t('wordListTitle')}</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <FormControl sx={{ minWidth: 150 }}>
                                <InputLabel>{t('grade')}</InputLabel>
                                <Select value={wordFilters.grade} label={t('grade')} onChange={(event) => setWordFilters((current) => ({ ...current, grade: event.target.value }))}>
                                    <MenuItem value="">{t('allGrades')}</MenuItem>
                                    {['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].map((grade) => <MenuItem key={grade} value={grade}>{grade}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 150 }}>
                                <InputLabel>{t('week')}</InputLabel>
                                <Select value={wordFilters.week} label={t('week')} onChange={(event) => setWordFilters((current) => ({ ...current, week: event.target.value }))}>
                                    <MenuItem value="">{t('allWeeks')}</MenuItem>
                                    {Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <MenuItem key={week} value={week}>{week}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <FormControl sx={{ minWidth: 220 }}>
                                <InputLabel>{t('category')}</InputLabel>
                                <Select value={wordFilters.category} label={t('category')} onChange={(event) => setWordFilters((current) => ({ ...current, category: event.target.value }))}>
                                    <MenuItem value="">{t('allCategories')}</MenuItem>
                                    {wordCategories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">{wordsLoading ? t('loadingWords') : t('wordCount', { count: wordList.length })}</Typography>
                        {!wordsLoading && wordList.length > 0 && <Box sx={{ maxHeight: 400, overflowY: 'auto', overflowX: 'hidden', p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                            {Object.entries(wordList.reduce((groups, word) => {
                                groups[word.category] = [...(groups[word.category] || []), word];
                                return groups;
                            }, {})).map(([category, categoryWords]) => <Box key={category} sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>{category}</Typography>
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                    {categoryWords.map((word) => <Chip key={`${word.grade}-${word.week}-${word.order}-${word.word}`} label={word.word} variant="outlined" />)}
                                </Stack>
                            </Box>)}
                        </Box>}
                        {!wordsLoading && wordList.length === 0 && <Typography color="text.secondary">{t('noWords')}</Typography>}
                    </Stack>
                </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">{t('importTitle')}</Typography>
                        <Typography variant="body2" color="text.secondary">{t('csvColumns')}</Typography>
                        <Typography component="a" href="/spelling_words_sample.csv" download sx={{ alignSelf: 'flex-start' }}>
                            {t('downloadTemplate')}
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                            <input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} />
                            <Button variant="outlined" onClick={onPreviewWordList} disabled={!importFile || importing}>{t('preview')}</Button>
                        </Stack>
                        {importPreview && <Box>
                            <Typography variant="body2">{t('rows')}: {importPreview.summary.totalRows} | {t('valid')}: {importPreview.summary.validRows}</Typography>
                            {importPreview.errors?.length > 0
                                ? <Alert severity="error" sx={{ mt: 1 }}>{importPreview.errors.length} validation errors must be fixed before import.</Alert>
                                : <Button sx={{ mt: 1 }} variant="contained" onClick={onCommitWordList} disabled={importing}>{t('commitImport')}</Button>}
                        </Box>}
                    </Stack>
                </CardContent>
            </Card>
        </>
    );
};

export default SpellingCurriculumTab;
