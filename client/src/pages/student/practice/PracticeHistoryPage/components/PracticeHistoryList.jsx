import PracticeHistoryItem from './PracticeHistoryItem.jsx';

/**
 * List of history items. Uses CSS class: history-list.
 */
export default function PracticeHistoryList({ history }) {
    return (
        <div className="history-list">
            {history.map((item) => (
                <PracticeHistoryItem key={item._id} item={item} />
            ))}
        </div>
    );
}
