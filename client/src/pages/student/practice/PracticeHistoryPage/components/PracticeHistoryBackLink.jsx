import { HiOutlineArrowLeft } from 'react-icons/hi';
import { BACK_LABEL } from '../constants.js';

/**
 * Back link to practice dashboard. Uses CSS class: back-link.
 */
export default function PracticeHistoryBackLink({ onClick }) {
    return (
        <button type="button" className="back-link" onClick={onClick}>
            <HiOutlineArrowLeft size={16} /> {BACK_LABEL}
        </button>
    );
}
