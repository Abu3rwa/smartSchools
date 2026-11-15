import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectHasFeature } from '../../../../../store/slices/schoolFeaturesSlice';
import inboxAssistantService from '../../../../../services/inboxAssistantService';

/** A quiet count of what waits on the teacher in the inbox; a failed call leaves it at zero. */
const useInboxAttention = () => {
    const hasFeature = useSelector((state) => selectHasFeature(state, 'inboxAssistant'));
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
                // The chip is optional; a failed call leaves it hidden.
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [hasFeature]);

    return hasFeature ? count : 0;
};

export default useInboxAttention;