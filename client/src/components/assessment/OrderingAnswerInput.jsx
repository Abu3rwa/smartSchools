import { useMemo } from 'react';
import { buildOrderingResponse, getOrderingItems, moveOrderingItem, readOrderingOrder } from '../../utils/mapPracticeObjectiveAnswers';
import './AssessmentAnswers.css';

const ArrowIcon = ({ direction }) => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
    <path d={direction === 'up' ? 'M10 4 16 12H4z' : 'M10 16 4 8h12z'} fill="currentColor" />
  </svg>
);

const OrderingAnswerInput = ({ question, value, onChange, labels }) => {
  const items = useMemo(() => getOrderingItems(question), [question]);
  const chosen = readOrderingOrder(value);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = chosen.map((id) => byId.get(id)).filter(Boolean);
  const remaining = items.filter((item) => !chosen.includes(item.id));

  const commit = (ids) => onChange(buildOrderingResponse(ids));

  if (!items.length) {
    return <p className="assessment-answer-hint">{labels?.empty || 'This ordering question has no items yet.'}</p>;
  }

  return (
    <div className="assessment-ordering">
      <p className="assessment-answer-hint">{labels?.hint || 'Put the items in the correct order.'}</p>

      <ol className="assessment-ordering-answer">
        {ordered.map((item, index) => (
          <li className="assessment-ordering-slot" key={`answer-${item.id}`}>
            <span className="assessment-ordering-position">{index + 1}</span>
            <span className="assessment-ordering-text">{item.text}</span>
            <span className="assessment-ordering-actions">
              <button
                type="button"
                className="assessment-icon-button"
                disabled={index === 0}
                onClick={() => commit(moveOrderingItem(chosen, index, -1))}
                aria-label={labels?.moveUp || `Move ${item.text} up`}
              >
                <ArrowIcon direction="up" />
              </button>
              <button
                type="button"
                className="assessment-icon-button"
                disabled={index === ordered.length - 1}
                onClick={() => commit(moveOrderingItem(chosen, index, 1))}
                aria-label={labels?.moveDown || `Move ${item.text} down`}
              >
                <ArrowIcon direction="down" />
              </button>
              <button
                type="button"
                className="assessment-text-button"
                onClick={() => commit(chosen.filter((id) => id !== item.id))}
                aria-label={labels?.remove || `Remove ${item.text}`}
              >
                {labels?.removeLabel || 'Remove'}
              </button>
            </span>
          </li>
        ))}
        {!ordered.length && <li className="assessment-ordering-empty">{labels?.emptyAnswer || 'Nothing ordered yet. Add an item below.'}</li>}
      </ol>

      <div className="assessment-ordering-bank">
        {remaining.map((item) => (
          <button
            type="button"
            className="assessment-bank-item"
            key={`bank-${item.id}`}
            onClick={() => commit([...chosen, item.id])}
          >
            <span>{item.text}</span>
            <span className="assessment-bank-add">{labels?.add || 'Add'}</span>
          </button>
        ))}
        {!remaining.length && <p className="assessment-answer-hint">{labels?.allPlaced || 'All items are in your answer.'}</p>}
      </div>
    </div>
  );
};

export default OrderingAnswerInput;
