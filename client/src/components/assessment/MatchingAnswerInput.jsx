import { getMatchingColumns, readMatchingSelections } from '../../utils/mapPracticeMatching';
import './AssessmentAnswers.css';

/**
 * Terms stay in authored order and only the choices arrive shuffled, so a term is always
 * identified by the same words while its position in the list gives nothing away.
 */
const MatchingAnswerInput = ({ question, value, onChange, labels, results, disabled }) => {
  const { terms, choices } = getMatchingColumns(question);
  const selections = readMatchingSelections(value);
  const usedChoices = new Set([...selections.values()]);
  const verdicts = new Map((results || []).map((row) => [String(row.term), row.isCorrect]));

  const pick = (term, choice) => {
    const merged = new Map(selections);
    if (choice) merged.set(term, choice);
    else merged.delete(term);
    onChange([...merged.entries()].map(([left, right]) => ({ left, right })));
  };

  if (!terms.length) {
    return <p className="assessment-answer-hint">{labels?.empty || 'This matching question has no pairs yet.'}</p>;
  }

  return (
    <div className="assessment-matching">
      <p className="assessment-answer-hint">{labels?.hint || 'Match each item with its correct partner.'}</p>
      {terms.map((term, index) => {
        const verdict = verdicts.get(term);
        const stateClass = verdict === true ? ' correct' : verdict === false ? ' incorrect' : '';
        return (
          <label className={`assessment-matching-row${stateClass}`} key={`${index}-${term}`}>
            <span className="assessment-matching-term">
              {term}
              {verdict != null && (
                <span className="assessment-matching-verdict">
                  {verdict ? labels?.correct || 'Correct' : labels?.incorrect || 'Wrong'}
                </span>
              )}
            </span>
            <select
              className={`assessment-matching-select${stateClass}`}
              value={selections.get(term) || ''}
              onChange={(event) => pick(term, event.target.value)}
              disabled={disabled}
            >
              <option value="">{labels?.choose || 'Choose a match'}</option>
              {choices.map((choice, choiceIndex) => (
                <option
                  key={`${index}-${choiceIndex}-${choice}`}
                  value={choice}
                  disabled={choice !== selections.get(term) && usedChoices.has(choice)}
                >
                  {choice}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
};

export default MatchingAnswerInput;
