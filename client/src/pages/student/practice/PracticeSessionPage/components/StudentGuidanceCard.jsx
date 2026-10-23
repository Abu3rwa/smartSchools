import React from 'react';
import { useTranslation } from 'react-i18next';

const StudentGuidanceCard = ({ activeQuestionGuidance, assignmentInstructions }) => {
    const { t } = useTranslation(['studentPractice']);

    if (!activeQuestionGuidance && !assignmentInstructions) return null;

    return (
        <div className="student-guidance-card">
            {activeQuestionGuidance && (
                <>
                    <p className="student-guidance-title">{t('studentPractice:session.guidanceTitle')}</p>
                    <p className="student-guidance-copy">{t(activeQuestionGuidance)}</p>
                </>
            )}
            {assignmentInstructions && (
                <p className="student-guidance-copy">
                    {t('studentPractice:session.teacherNote', { text: assignmentInstructions })}
                </p>
            )}
        </div>
    );
};

export default StudentGuidanceCard;
