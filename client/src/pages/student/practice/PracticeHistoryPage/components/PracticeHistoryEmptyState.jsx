import { EMPTY_MESSAGE, START_PRACTICING_LABEL } from '../constants.js';

/**
 * Empty state when no history. Uses CSS class: history-empty.
 */
export default function PracticeHistoryEmptyState({ assignmentId, onStartPracticing }) {
    return (
        <div className="history-empty">
            <p>{EMPTY_MESSAGE}</p>
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => onStartPracticing(assignmentId)}
                style={{ marginTop: 'var(--spacing-md)' }}
            >
                {START_PRACTICING_LABEL}
            </button>
        </div>
    );
}
