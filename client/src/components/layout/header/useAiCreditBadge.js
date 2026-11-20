import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import aiCreditService from '../../../services/aiCreditService.js';

// Same roles the API bills AI usage to and the /ai-credit/me page admits.
const CREDIT_ROLES = new Set(['teacher', 'admin']);

export const useAiCreditBadge = (user) => {
    const location = useLocation();
    const eligible = CREDIT_ROLES.has(user?.role);
    const identity = user?.id || user?._id || user?.email || '';
    const [state, setState] = useState({ identity: '', status: 'loading', badge: null });

    // Refresh when the page changes or the tab regains focus, so usage from
    // whichever AI feature was just used shows up without a reload.
    useEffect(() => {
        if (!eligible) return undefined;
        let active = true;

        const load = () => {
            aiCreditService.getBadge()
                .then((data) => { if (active) setState({ identity, status: 'ready', badge: data }); })
                .catch(() => {
                    if (active) {
                        setState((prev) => ({
                            identity,
                            status: 'error',
                            badge: prev.identity === identity ? prev.badge : null
                        }));
                    }
                });
        };

        load();
        window.addEventListener('focus', load);
        return () => {
            active = false;
            window.removeEventListener('focus', load);
        };
    }, [eligible, identity, location.pathname]);

    if (!eligible) return { eligible: false, status: 'idle', badge: null };
    const current = state.identity === identity ? state : { status: 'loading', badge: null };
    return { eligible: true, status: current.status, badge: current.badge };
};