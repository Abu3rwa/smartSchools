import { useMemo } from 'react';
import { buildBlankResponse, getBlankIds, getQuestionPrompt, readBlankAnswers, splitStemByBlanks } from '../../utils/mapPracticeObjectiveAnswers';
import './AssessmentAnswers.css';

const FillInBlankAnswerInput = ({ question, value, onChange, labels }) => {
  const ids = useMemo(() => getBlankIds(question), [question]);
  const answers = readBlankAnswers(value);
  const prompt = getQuestionPrompt(question);
  const segments = useMemo(() => splitStemByBlanks(prompt, ids), [prompt, ids]);

  const setAnswer = (id, next) => {
    const merged = new Map(answers);
    if (next.trim()) merged.set(id, next);
    else merged.delete(id);
    onChange(buildBlankResponse(merged));
  };

  const hasTokens = /\{\{/.test(prompt);

  return (
    <div className="assessment-blanks">
      <p className="assessment-answer-hint">{labels?.hint || 'Type the missing word or phrase in each blank.'}</p>
      <p className={`assessment-blank-sentence${hasTokens ? ' is-inline' : ' is-stacked'}`}>
        {segments.map((segment, index) => (segment.type === 'text'
          ? <span key={`text-${index}`}>{segment.text}</span>
          : (
            <span className="assessment-blank-field" key={`blank-${segment.id}-${index}`}>
              <input
                type="text"
                dir="auto"
                className="assessment-blank-input"
                value={answers.get(segment.id) || ''}
                onChange={(event) => setAnswer(segment.id, event.target.value)}
                placeholder={hasTokens ? (labels?.placeholder || 'answer') : `${labels?.blank || 'Blank'} ${segment.position}`}
                aria-label={`${labels?.blank || 'Blank'} ${segment.id}`}
              />
            </span>
          )))}
      </p>
    </div>
  );
};

export default FillInBlankAnswerInput;
