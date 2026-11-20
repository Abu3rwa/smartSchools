import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineCreditCard } from 'react-icons/hi';
import { creditDisplay } from '../../../utils/aiCredit';

const HeaderCreditChip = ({ credit }) => {
    const { t, i18n } = useTranslation(['aiCredit', 'layout.header']);
    if (!credit.eligible) return null;

    const { value, state } = creditDisplay(credit, t, i18n.language);
    const label = t('aiCredit:chip.label');
    const accessibleLabel = `${label}: ${value}`;

    return (
        <Link
            to="/portal/ai-credit/me"
            className={`header-credit-chip is-${state}`}
            aria-label={accessibleLabel}
            title={accessibleLabel}
        >
            <HiOutlineCreditCard size={16} aria-hidden="true" />
            <span className="header-credit-chip-label">{label}</span>
            <strong>{value}</strong>
        </Link>
    );
};

export default HeaderCreditChip;