import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineLink } from 'react-icons/hi';
import LessonPlanPickerModal from './LessonPlanPickerModal';
import './LessonPlanLinkButton.css';

const LessonPlanLinkButton = ({
    classId,
    subjectId,
    selectedLessonPlanIds = [],
    onChange,
    compact = false
}) => {
    const { t } = useTranslation(['grades']);
    const [open, setOpen] = useState(false);
    const closeModal = useCallback(() => setOpen(false), []);
    const count = Array.isArray(selectedLessonPlanIds) ? selectedLessonPlanIds.length : 0;

    return (
        <>
            <button
                type="button"
                className={`btn btn-outline btn-sm lesson-link-button${compact ? ' lesson-link-button--compact' : ''}`}
                aria-haspopup="dialog"
                disabled={!classId || !subjectId}
                onClick={() => setOpen(true)}
            >
                <HiOutlineLink aria-hidden="true" />
                {t('grades:lessonLinks.open')}
                {count > 0 && <span className="lesson-link-button__count">{count}</span>}
            </button>
            {open && (
                <LessonPlanPickerModal
                    classId={classId}
                    subjectId={subjectId}
                    selectedLessonPlanIds={selectedLessonPlanIds}
                    onChange={onChange}
                    onClose={closeModal}
                />
            )}
        </>
    );
};

export default LessonPlanLinkButton;
