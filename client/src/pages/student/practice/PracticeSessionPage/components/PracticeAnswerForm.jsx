import React from 'react';
import MultipleSelectAnswerInput from '../../../../../components/assessment/MultipleSelectAnswerInput';
import MatchingAnswerInput from '../../../../../components/assessment/MatchingAnswerInput';
import OrderingAnswerInput from '../../../../../components/assessment/OrderingAnswerInput';
import FillInBlankAnswerInput from '../../../../../components/assessment/FillInBlankAnswerInput';
import NumericAnswerInput from '../../../../../components/assessment/NumericAnswerInput';
import { isAnswerReady, isObjectiveAnswerType } from '../utils/practiceAnswerDraft';

const PracticeAnswerForm = ({
    question,
    questionType,
    options,
    selectedAnswer,
    onSelectedAnswerChange,
    shortAnswer,
    onShortAnswerChange,
    objectiveAnswer,
    onObjectiveAnswerChange,
    submittingAnswer,
    onSubmit,
    textareaRef
}) => {
    const handleOptionKeyDown = (e, idx) => {
        if (!options?.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            onSelectedAnswerChange(options[(idx + 1) % options.length].label);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onSelectedAnswerChange(options[(idx - 1 + options.length) % options.length].label);
        }
    };

    const objective = isObjectiveAnswerType(questionType);
    const canSubmit = objective
        ? isAnswerReady(question, objectiveAnswer)
        : questionType === 'short_answer'
            ? Boolean(shortAnswer.trim())
            : Boolean(selectedAnswer);

    return (
        <>
            {questionType === 'multiple_select' && (
                <MultipleSelectAnswerInput
                    question={question}
                    value={objectiveAnswer}
                    onChange={onObjectiveAnswerChange}
                    name={question?.attemptId}
                />
            )}

            {questionType === 'matching' && (
                <MatchingAnswerInput
                    question={question}
                    value={objectiveAnswer}
                    onChange={onObjectiveAnswerChange}
                />
            )}

            {questionType === 'ordering' && (
                <OrderingAnswerInput
                    question={question}
                    value={objectiveAnswer}
                    onChange={onObjectiveAnswerChange}
                />
            )}

            {questionType === 'fill_in_blank' && (
                <FillInBlankAnswerInput
                    question={question}
                    value={objectiveAnswer}
                    onChange={onObjectiveAnswerChange}
                />
            )}

            {questionType === 'numeric_response' && (
                <NumericAnswerInput
                    question={question}
                    value={typeof objectiveAnswer === 'string' ? objectiveAnswer : ''}
                    onChange={onObjectiveAnswerChange}
                />
            )}

            {!objective && (questionType === 'multiple_choice' || questionType === 'true_false') && (
                <div className="options-list" role="radiogroup" aria-label="Answer options">
                    {options?.map((option, idx) => (
                        <button
                            key={idx}
                            role="radio"
                            aria-checked={selectedAnswer === option.label}
                            className={`option-btn ${selectedAnswer === option.label ? 'selected' : ''}`}
                            onClick={() => onSelectedAnswerChange(option.label)}
                            onKeyDown={(e) => handleOptionKeyDown(e, idx)}
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

            {!objective && questionType === 'short_answer' && (
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
                    disabled={submittingAnswer || !canSubmit}
                >
                    {submittingAnswer ? 'Submitting...' : 'Submit Answer'}
                </button>
            </div>
        </>
    );
};

export default PracticeAnswerForm;
