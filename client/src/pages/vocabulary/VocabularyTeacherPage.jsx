import { useEffect, useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useDispatch } from 'react-redux';
import { fetchClasses } from '../../store/slices/classSlice';
import VocabListsTab from './components/VocabListsTab';
import VocabWordsTab from './components/VocabWordsTab';
import VocabImportTab from './components/VocabImportTab';
import VocabSettingsTab from './components/VocabSettingsTab';
import VocabReviewTab from './components/VocabReviewTab';
import VocabReportsTab from './components/VocabReportsTab';

const VocabularyTeacherPage = () => {
    const dispatch = useDispatch();
    const [tab, setTab] = useState(0);

    useEffect(() => { dispatch(fetchClasses()); }, [dispatch]);

    return (
        <Box sx={{ p: { xs: 1, md: 3 } }}>
            <Typography variant="h4" component="h1" gutterBottom>Vocabulary Practice</Typography>
            <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" aria-label="Vocabulary sections" sx={{ mb: 3 }}>
                <Tab label="Lists" /><Tab label="Words" /><Tab label="Import" /><Tab label="Review" /><Tab label="Reports" /><Tab label="Settings" />
            </Tabs>
            {tab === 0 && <VocabListsTab />}
            {tab === 1 && <VocabWordsTab />}
            {tab === 2 && <VocabImportTab />}
            {tab === 3 && <VocabReviewTab />}
            {tab === 4 && <VocabReportsTab />}
            {tab === 5 && <VocabSettingsTab />}
        </Box>
    );
};

export default VocabularyTeacherPage;
