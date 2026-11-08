import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft } from 'react-icons/hi';

const PracticeSessionHeader = ({ onBack }) => {
    const { t } = useTranslation('studentPractice');

    return (
        <button className="back-link" onClick={onBack}>
            <HiOutlineArrowLeft size={16} /> {t('session.header.back')}
        </button>
    );
};

export default PracticeSessionHeader;
