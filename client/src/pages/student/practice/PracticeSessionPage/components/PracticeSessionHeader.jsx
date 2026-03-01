import React from 'react';
import { HiOutlineArrowLeft } from 'react-icons/hi';

const PracticeSessionHeader = ({ onBack }) => {
    return (
        <button className="back-link" onClick={onBack}>
            <HiOutlineArrowLeft size={16} /> Back to Standards Practice
        </button>
    );
};

export default PracticeSessionHeader;
