import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft } from 'react-icons/hi';

/**
 * Back link to practice dashboard. Uses CSS class: back-link.
 */
export default function PracticeHistoryBackLink({ onClick }) {
    const { t } = useTranslation('studentPractice');

    return (
        <button type="button" className="back-link" onClick={onClick}>
            <HiOutlineArrowLeft size={16} /> {t('history.back')}
        </button>
    );
}
