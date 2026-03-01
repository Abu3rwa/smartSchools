import React from 'react';

const PracticeAnswerForm = ({ 
    questionType, 
    options, 
    selectedAnswer, 
    onSelectedAnswerChange, 
    shortAnswer, 
    onShortAnswerChange, 
    submittingAnswer, 
    onSubmit, 
    textareaRef 
}) => {
    return (
        <>
            {(questionType === 'multiple_choice' || questionType === 'true_false') && (
                <div className="options-list">
                    {options?.map((option, idx) => (
                        <button
                            key={idx}
                            className={`option-btn ${selectedAnswer === option.label ? 'selected' : ''}`}
                            onClick={() => onSelectedAnswerChange(option.label)}
                            disabled={submittingAnswer}
                        >
                            <span
                                className={`option-label ${questionType === 'true_false' ? 'option-label-text' : ''}`}
                            >
                                {questionType === 'true_false'
                                    ? (option.text || option.label)
                                    : option.label}
                            </span>
                            {questionType !== 'true_false' && (
                                <span className="option-text">{option.text}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {questionType === 'short_answer' && (
                <textarea
                    ref={textareaRef}
                    className="short-answer-input"
                    value={shortAnswer}
                    onChange={(e) => onShortAnswerChange(e.target.value)}
                    placeholder="Type your answer clearly and explain your thinking..."
                    disabled={submittingAnswer}
                />
            )}

            <div className="question-actions">
                <button
                    className="btn btn-primary"
                    onClick={onSubmit}
                    disabled={
                        submittingAnswer ||
                        (questionType === 'short_answer'
                            ? !shortAnswer.trim()
                            : !selectedAnswer)
                    }
                >
                    {submittingAnswer ? 'Submitting...' : 'Submit Answer'}
                </button>
            </div>
        </>
    );
};

export default PracticeAnswerForm;
