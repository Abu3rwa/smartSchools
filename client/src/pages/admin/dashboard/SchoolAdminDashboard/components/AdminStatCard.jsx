/**
 * Single stat card for the dashboard.
 * Uses existing CSS classes: admin-stat-card, stat-{variant}, admin-stat-icon, admin-stat-info, admin-stat-subtitle.
 */
export default function AdminStatCard({ icon: Icon, variant, value, label, subtitle }) {
    return (
        <div className={`admin-stat-card stat-${variant}`}>
            <div className={`admin-stat-icon ${variant}`}>
                <Icon size={24} />
            </div>
            <div className="admin-stat-info">
                <h3>{value}</h3>
                <p>{label}</p>
                {subtitle && <span className="admin-stat-subtitle">{subtitle}</span>}
            </div>
        </div>
    );
}
