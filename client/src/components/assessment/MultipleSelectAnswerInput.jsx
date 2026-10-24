import './AssessmentAnswers.css';

/**
 * The response is the list of chosen option labels, which is exactly how the authored key is
 * stored, so nothing has to be translated between the student and the grader.
 */
const MultipleSelectAnswerInput = ({ question, value, onChange, labels, name }) => {
  const options = (Array.isArray(question?.options) ? question.options : [])
    .map((option, index) => ({
      label: String(option?.label || String.fromCharCode(65 + index)).trim(),
      text: String(option?.text ?? '').trim(),
    }))
    .filter((option) => option.text);
  const selected = new Set((Array.isArray(value) ? value : String(value ?? '').split('|'))
    .map((entry) => String(entry ?? '').trim().toUpperCase())
    .filter(Boolean));

  const toggle = (label, checked) => {
    const next = new Set(selected);
    if (checked) next.add(label);
    else next.delete(label);
    onChange(options.filter((option) => next.has(option.label)).map((option) => option.label));
  };

  if (!options.length) {
    return <p className="assessment-answer-hint">{labels?.empty || 'This question has no options yet.'}</p>;
  }

  return (
    <div className="assessment-options">
      <p className="assessment-answer-hint">{labels?.hint || 'Select every answer that applies.'}</p>
      {options.map((option) => (
        <label className="assessment-option" key={`${name || 'option'}-${option.label}`}>
          <input
            type="checkbox"
            checked={selected.has(option.label)}
            onChange={(event) => toggle(option.label, event.target.checked)}
          />
          <span><strong>{option.label}.</strong> {option.text}</span>
        </label>
      ))}
    </div>
  );
};

export default MultipleSelectAnswerInput;
