import { useTranslation } from 'react-i18next';

/**
 * Four headline metrics in a single divided surface.
 */
export default function AdminKpiStrip({ stats }) {
    const { t } = useTranslation(['adminDashboard']);

    return (
        <section className="admin-kpi-strip" aria-label={t('adminDashboard:metrics.label')}>
            {stats.map((stat) => (
                <div className="admin-kpi" key={stat.key}>
                    <span className="admin-kpi-label">{stat.label}</span>
                    <span className="admin-kpi-value">{stat.value}</span>
                    <span className="admin-kpi-meta">{stat.meta}</span>
                </div>
            ))}
        </section>
    );
}
