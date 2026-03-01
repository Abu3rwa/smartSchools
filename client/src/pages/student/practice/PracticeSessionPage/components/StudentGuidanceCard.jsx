import React from 'react';

const StudentGuidanceCard = ({ activeQuestionGuidance, assignmentInstructions }) => {
    return (
        <div className="student-guidance-card">
            <p className="student-guidance-title">How To Answer</p>
            <p className="student-guidance-copy">{activeQuestionGuidance}</p>
            {assignmentInstructions && (
                <p className="student-guidance-copy">
                    Teacher note: {assignmentInstructions}
                </p>
            )}
        </div>
    );
};

export default StudentGuidanceCard;
