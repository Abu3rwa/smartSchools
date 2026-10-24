import { getNumericHint } from '../../utils/mapPracticeObjectiveAnswers';
import './AssessmentAnswers.css';

const NumericAnswerInput = ({ question, value, onChange, labels }) => {
  const hint = getNumericHint(question);
  const parts = [];
  if (hint?.unit) parts.push(`${labels?.unit || 'Unit'}: ${hint.unit}`);
  if (hint?.decimalPlaces !== null && hint?.decimalPlaces !== undefined && hint?.decimalPlaces !== '') {
    parts.push(`${labels?.decimals || 'Decimals'}: ${hint.decimalPlaces}`);
  }
  if (hint?.acceptFractions) parts.push(labels?.fractions || 'Fractions allowed');
  if (hint?.acceptPercent) parts.push(labels?.percent || 'Percent allowed');

  return (
    <div className="assessment-numeric">
      <label className="assessment-numeric-field" htmlFor={`numeric-${question?._id || 'question'}`}>
        <span className="assessment-numeric-label">{labels?.prompt || 'Your answer'}</span>
        <input
          id={`numeric-${question?._id || 'question'}`}
          className="assessment-numeric-input"
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          placeholder={hint?.unit ? `12 ${hint.unit}` : '12'}
        />
      </label>
      {hint?.prompt && <p className="assessment-answer-hint">{hint.prompt}</p>}
      {!!parts.length && <p className="assessment-numeric-meta">{parts.join(' · ')}</p>}
    </div>
  );
};

export default NumericAnswerInput;
