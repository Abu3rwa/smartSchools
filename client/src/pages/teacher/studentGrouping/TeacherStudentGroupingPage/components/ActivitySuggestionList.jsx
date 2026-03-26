import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Button,
    Chip,
    CircularProgress,
    List,
    ListItem,
    ListItemText,
    Typography
} from '@mui/material';
import { HiOutlineChevronDown, HiOutlineArrowPath } from 'react-icons/hi2';

const ActivitySuggestionList = ({ activities, level, onRefresh, refreshing }) => {
    if (!activities || activities.length === 0) {
        return (
            <Box sx={{ p: 1 }}>
                <Button
                    size="small"
                    startIcon={refreshing ? <CircularProgress size={14} /> : <HiOutlineArrowPath />}
                    onClick={() => onRefresh(level)}
                    disabled={refreshing}
                >
                    Generate Activities
                </Button>
            </Box>
        );
    }

    return (
        <Accordion
            disableGutters
            elevation={0}
            sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}
        >
            <AccordionSummary expandIcon={<HiOutlineChevronDown />} sx={{ px: 1, minHeight: 36 }}>
                <Typography variant="caption" fontWeight={600}>
                    Suggested Activities ({activities.length})
                </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1, pt: 0 }}>
                <List dense disablePadding>
                    {activities.map((activity, idx) => (
                        <ListItem key={idx} disableGutters sx={{ alignItems: 'flex-start' }}>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Typography variant="body2" fontWeight={500}>
                                            {activity.title}
                                        </Typography>
                                        <Chip label={activity.type} size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
                                    </Box>
                                }
                                secondary={
                                    <>
                                        <Typography variant="caption" component="span" display="block">
                                            {activity.description}
                                        </Typography>
                                        {activity.materials && activity.materials !== 'none' && (
                                            <Typography variant="caption" color="text.secondary" component="span" display="block">
                                                Materials: {activity.materials}
                                            </Typography>
                                        )}
                                    </>
                                }
                            />
                        </ListItem>
                    ))}
                </List>
                <Button
                    size="small"
                    startIcon={refreshing ? <CircularProgress size={14} /> : <HiOutlineArrowPath />}
                    onClick={() => onRefresh(level)}
                    disabled={refreshing}
                    sx={{ mt: 0.5 }}
                >
                    Refresh
                </Button>
            </AccordionDetails>
        </Accordion>
    );
};

export default ActivitySuggestionList;
