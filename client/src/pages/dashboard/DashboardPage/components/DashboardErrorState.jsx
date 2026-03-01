const DashboardErrorState = ({ error, onRetry }) => {
    return (
        <div className="dashboard-page">
            <div className="error-container">
                <p className="error-message">Error loading dashboard: {error}</p>
                <button className="btn btn-primary" onClick={onRetry}>
                    Retry
                </button>
            </div>
        </div>
    );
};

export default DashboardErrorState;
