/**
 * Full-page error state for School Admin Dashboard with retry.
 * Uses existing CSS classes: admin-dashboard-page, error-container, error-message, btn, btn-primary.
 */
export default function ErrorState({ message, onRetry }) {
    return (
        <div className="admin-dashboard-page">
            <div className="error-container">
                <p className="error-message">Error loading dashboard: {message}</p>
                <button className="btn btn-primary" onClick={onRetry}>
                    Retry
                </button>
            </div>
        </div>
    );
}
