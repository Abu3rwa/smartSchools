import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { formatCount, truncateClassLabel } from '../utils/schoolAdminDashboardPresentation.js';

/**
 * Largest classes by enrollment, drawn as lightweight CSS bars instead of a chart.
 */
export default function ClassDistributionCard({ data }) {
    const { t, i18n } = useTranslation(['adminDashboard']);
    const isRtl = i18n.dir() === 'rtl';
    const locale = i18n.language === 'ar' ? 'ar' : 'en';
    const rows = Array.isArray(data) ? data : [];
    const largest = rows.reduce((max, row) => Math.max(max, Number(row.students) || 0), 0);

    return (
        <section className="admin-panel admin-panel-chart">
            <div className="admin-panel-head">
                <h2 className="admin-panel-title">{t('adminDashboard:classDistribution.title')}</h2>
                <Link to="/portal/classes" className="admin-text-link">
                    {t('adminDashboard:common.viewAll')}
                    <HiOutlineArrowRight size={15} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                </Link>
            </div>

            {rows.length > 0 ? (
                <ul className="admin-bars">
                    {rows.map((row) => (
                        <li className="admin-bar-row" key={row.id}>
                            <span className="admin-bar-name" title={row.name}>
                                {truncateClassLabel(row.name, 20)}
                            </span>
                            <span className="admin-bar-track">
                                <span
                                    className="admin-bar-fill"
                                    style={{
                                        width: `${largest > 0 ? Math.max(4, (row.students / largest) * 100) : 0}%`,
                                    }}
                                />
                            </span>
                            <span className="admin-bar-value">{formatCount(row.students, locale)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="admin-panel-empty">{t('adminDashboard:classDistribution.empty')}</p>
            )}
        </section>
    );
}
