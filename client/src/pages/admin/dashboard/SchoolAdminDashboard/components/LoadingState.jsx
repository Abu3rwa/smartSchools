/**
 * Full-page loading state for School Admin Dashboard.
 * Uses existing CSS classes: admin-dashboard-page, loading-container, spinner.
 */
export default function LoadingState() {
    return (
        <div className="admin-dashboard-page">
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading dashboard...</p>
            </div>
        </div>
    );
}
