import { useState } from 'react';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SpellingLibraryWorkspace from '../library/SpellingLibraryWorkspace.jsx';
import SpellingLibraryImportPanel from '../library/SpellingLibraryImportPanel.jsx';

const SpellingCurriculumTab = ({
    canImport = true,
    exportingWordLibrary,
    libraryRefreshKey = 0,
    onPreviewWordList,
    onCommitWordList,
    onExportWordLibrary,
    onExportWordAudioLibrary,
    onNotify
}) => {
    const { t } = useTranslation('spelling');
    const [importOpen, setImportOpen] = useState(false);

    return (
        <Card sx={{ minWidth: 0 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack spacing={2}>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ md: 'center' }}
                        spacing={1}
                    >
                        <Typography variant="h6">{t('wordListTitle')}</Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            {canImport && (
                                <Button variant="contained" size="small" onClick={() => setImportOpen(true)}>
                                    {t('importWordList')}
                                </Button>
                            )}
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => onExportWordLibrary('roundtrip')}
                                disabled={exportingWordLibrary}
                            >
                                {exportingWordLibrary ? t('exportingWordLibrary') : t('exportReimport')}
                            </Button>
                            <Button
                                variant="text"
                                size="small"
                                onClick={() => onExportWordLibrary('spreadsheet')}
                                disabled={exportingWordLibrary}
                            >
                                {t('exportSpreadsheet')}
                            </Button>
                            <Button
                                variant="text"
                                size="small"
                                onClick={onExportWordAudioLibrary}
                                disabled={exportingWordLibrary}
                            >
                                {t('exportAudioCsv')}
                            </Button>
                            <Button
                                component={Link}
                                to="/portal/spelling/audio/review"
                                variant="text"
                                size="small"
                            >
                                {t('audioAdmin.review.title')}
                            </Button>
                        </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        {t('wordLibraryExportDescription')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('exportSpreadsheetHelp')}
                    </Typography>
                    <Box>
                        <SpellingLibraryWorkspace refreshKey={libraryRefreshKey} />
                    </Box>
                </Stack>
            </CardContent>

            {canImport && (
                <SpellingLibraryImportPanel
                    open={importOpen}
                    onClose={() => setImportOpen(false)}
                    onPreview={onPreviewWordList}
                    onCommit={onCommitWordList}
                    onNotify={onNotify}
                />
            )}
        </Card>
    );
};

export default SpellingCurriculumTab;
