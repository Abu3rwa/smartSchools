import { HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const MessagesFab = ({ isHidden, onClick }) => {
    const { t } = useTranslation(['messages']);

    return (
        <button
            type="button"
            className={`messages-fab btn btn-primary ${isHidden ? 'hidden' : ''}`}
            onClick={onClick}
            aria-label={t('messages:header.createAria')}
        >
            <HiOutlinePlus size={18} />
            <span>{t('messages:header.newMessage')}</span>
        </button>
    );
};

export default MessagesFab;
