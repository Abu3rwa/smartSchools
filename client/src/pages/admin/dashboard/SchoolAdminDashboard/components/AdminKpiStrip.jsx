import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Four headline metrics in a single divided surface. Tiles with a destination
 * render as links; the rest stay plain.
 */
export default function AdminKpiStrip({ stats }) {
    const { t } = useTranslation(['adminDashboard']);

    return (
        <section className="admin-kpi-strip" aria-label={t('adminDashboard:metrics.label')}>
            {stats.map((stat) => {
                const content = (
                    <>
                        <span className="admin-kpi-label">{stat.label}</span>
                        <span className="admin-kpi-value">{stat.value}</span>
                        <span className="admin-kpi-meta">{stat.meta}</span>
                    </>
                );
                return stat.to ? (
                    <Link className="admin-kpi admin-kpi--linked" key={stat.key} to={stat.to}>
                        {content}
                    </Link>
                ) : (
                    <div className="admin-kpi" key={stat.key}>
                        {content}
                    </div>
                );
            })}
        </section>
    );
}
