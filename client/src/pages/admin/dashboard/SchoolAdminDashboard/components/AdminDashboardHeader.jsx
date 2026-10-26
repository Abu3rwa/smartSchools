import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const HEADER_LINKS = [
    { key: 'students', path: '/portal/students' },
    { key: 'attendance', path: '/portal/attendance/admin' },
    { key: 'classes', path: '/portal/classes' },
];

/**
 * Page header: context chips, greeting and the three destinations an admin
 * reaches for most often.
 */
export default function AdminDashboardHeader({ title, subtitle, todayLabel, academicYear }) {
    const { t } = useTranslation(['adminDashboard']);

    return (
        <header className="admin-header">
            <div className="admin-header-main">
                <div className="admin-header-context">
                    {todayLabel && <span>{todayLabel}</span>}
                    {todayLabel && academicYear && <span aria-hidden="true">·</span>}
                    {academicYear && (
                        <span>{t('adminDashboard:header.academicYear', { year: academicYear })}</span>
                    )}
                </div>
                <h1 className="admin-dashboard-title">{title}</h1>
                <p className="admin-dashboard-subtitle">{subtitle}</p>
            </div>
            <nav className="admin-quick-links" aria-label={t('adminDashboard:links.label')}>
                {HEADER_LINKS.map((link) => (
                    <Link key={link.key} to={link.path} className="admin-quick-link">
                        {t(`adminDashboard:links.${link.key}`)}
                    </Link>
                ))}
            </nav>
        </header>
    );
}
