import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineCreditCard } from 'react-icons/hi';
import { selectUser } from '../../../store/slices/authSlice';
import aiCreditService from '../../../services/aiCreditService.js';
import { creditState, formatBalance } from '../../../utils/aiCredit.js';

// Same roles the API bills AI usage to and the /ai-credit/me page admits.
const CREDIT_ROLES = new Set(['teacher', 'admin']);

const HeaderCreditChip = () => {
    const { t, i18n } = useTranslation(['aiCredit']);
    const user = useSelector(selectUser);
    const location = useLocation();
    const eligible = CREDIT_ROLES.has(user?.role);
    const identity = user?.id || user?._id || user?.email || '';
    // Keyed by identity so a switched account never shows the previous balance.
    const [loaded, setLoaded] = useState({ identity: '', badge: null });

    // Refresh when the page changes or the tab regains focus, so usage from
    // whichever AI feature was just used shows up without a reload.
    useEffect(() => {
        if (!eligible) return undefined;
        let active = true;

        const load = () => {
            aiCreditService.getBadge()
                .then((data) => { if (active) setLoaded({ identity, badge: data }); })
                .catch(() => { /* the credit page reports problems; the bar stays quiet */ });
        };

        load();
        window.addEventListener('focus', load);
        return () => {
            active = false;
            window.removeEventListener('focus', load);
        };
    }, [eligible, identity, location.pathname]);

    const badge = loaded.identity === identity ? loaded.badge : null;
    if (!eligible || !badge) return null;

    const state = creditState(badge);
    const value = state === 'paused'
        ? t('aiCredit:chip.paused')
        : state === 'empty'
            ? t('aiCredit:chip.empty')
            : formatBalance(badge.balanceCents, i18n.language);
    const accessibleLabel = `${t('aiCredit:chip.label')}: ${value}`;

    return (
        <Link
            to="/portal/ai-credit/me"
            className={`header-credit-chip is-${state}`}
            aria-label={accessibleLabel}
            title={accessibleLabel}
        >
            <HiOutlineCreditCard size={15} aria-hidden="true" />
            <span className="header-credit-chip-label">{t('aiCredit:chip.label')}</span>
            <strong>{value}</strong>
        </Link>
    );
};

export default HeaderCreditChip;
