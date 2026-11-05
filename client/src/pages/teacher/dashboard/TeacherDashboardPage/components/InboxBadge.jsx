import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { HiOutlineMail } from 'react-icons/hi';
import { selectHasFeature } from '../../../../../store/slices/schoolFeaturesSlice';
import inboxAssistantService from '../../../../../services/inboxAssistantService';

/** A quiet entry point to the inbox; loaded after paint and never blocks the dashboard. */
const InboxBadge = () => {
    const hasFeature = useSelector((state) => selectHasFeature(state, 'inboxAssistant'));
    const navigate = useNavigate();
    const { t } = useTranslation(['dashboard']);
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!hasFeature) return undefined;
        let cancelled = false;

        const load = async () => {
            try {
                const status = await inboxAssistantService.getStatus();
                if (cancelled || !status?.optedIn || !status?.platform?.enabled) return;
                const summary = await inboxAssistantService.getSummary();
                if (!cancelled) {
                    // Both counts are things waiting on the teacher: a reply, or a date decision.
                    setCount((Number(summary?.needsReply) || 0)
                        + (Number(summary?.calendarAttention) || 0));
                }
            } catch {
                // The badge is optional; a failed call leaves it hidden.
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [hasFeature]);

    if (!hasFeature || count <= 0) return null;

    return (
        <Button
            variant="outlined"
            size="small"
            startIcon={<HiOutlineMail />}
            onClick={() => navigate('/portal/inbox')}
            sx={{ mb: 2, textTransform: 'none' }}
        >
            {t('dashboard:teacherDashboard.inbox.badge', { n: count })}
        </Button>
    );
};

export default InboxBadge;
