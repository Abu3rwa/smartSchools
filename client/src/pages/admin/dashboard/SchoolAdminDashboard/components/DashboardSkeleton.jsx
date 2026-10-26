/**
 * Low-cost placeholder shown only on the first load, so the page frame appears
 * immediately instead of a full-page spinner.
 */
export default function DashboardSkeleton() {
    return (
        <div className="admin-dashboard-grid" aria-hidden="true">
            <div className="admin-kpi-strip is-skeleton">
                {[0, 1, 2, 3].map((index) => (
                    <div className="admin-kpi" key={index}>
                        <span className="admin-skeleton-line is-sm" />
                        <span className="admin-skeleton-line is-lg" />
                        <span className="admin-skeleton-line is-md" />
                    </div>
                ))}
            </div>
            <div className="admin-panel admin-skeleton-panel" />
            <div className="admin-charts-row">
                <div className="admin-panel admin-skeleton-panel is-tall" />
                <div className="admin-panel admin-skeleton-panel is-tall" />
            </div>
        </div>
    );
}
