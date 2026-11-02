import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineHome } from 'react-icons/hi';
import './StudentHomeButton.css';

const StudentHomeButton = () => {
    const navigate = useNavigate();
    const { t } = useTranslation(['layout.sidebar']);
    const label = t('layout.sidebar:items.dashboard', { defaultValue: 'Home' });

    return (
        <button
            type="button"
            className="student-home-fab"
            onClick={() => navigate('/portal/dashboard')}
            aria-label={label}
            title={label}
        >
            <HiOutlineHome size={22} aria-hidden="true" />
        </button>
    );
};

export default StudentHomeButton;
