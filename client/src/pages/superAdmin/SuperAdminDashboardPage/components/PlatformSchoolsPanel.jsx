import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineEye } from 'react-icons/hi';
import {
    formatCount,
    formatShortDate,
} from '../utils/platformDashboardPresentation.js';

export default function PlatformSchoolsPanel({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const schools = summary.schoolsPreview || [];

    return (
        <section className="platform-panel" aria-labelledby="platform-schools-title">
            <div className="platform-panel-head">
                <div>
                    <h2 id="platform-schools-title" className="platform-panel-title">
                        {t('superAdminDashboard:schools.title')}
                    </h2>
                    <p className="platform-panel-hint">{t('superAdminDashboard:schools.subtitle')}</p>
                </div>
                <Link to="/admin/schools" className="platform-text-link">
                    {t('superAdminDashboard:schools.viewAll')}
                </Link>
            </div>

            {schools.length === 0 ? (
                <p className="platform-empty">{t('superAdminDashboard:schools.empty')}</p>
            ) : (
                <div className="platform-table-wrap">
                    <table className="platform-table is-schools">
                        <thead>
                            <tr>
                                <th>{t('superAdminDashboard:schools.table.school')}</th>
                                <th className="is-optional">{t('superAdminDashboard:schools.table.plan')}</th>
                                <th>{t('superAdminDashboard:schools.table.status')}</th>
                                <th className="is-numeric">{t('superAdminDashboard:schools.table.students')}</th>
                                <th className="is-optional is-numeric">{t('superAdminDashboard:schools.table.staff')}</th>
                                <th className="is-optional">{t('superAdminDashboard:schools.table.lastActivity')}</th>
                                <th className="is-optional">{t('superAdminDashboard:schools.table.renewal')}</th>
                                <th aria-label={t('superAdminDashboard:schools.table.open')} />
                            </tr>
                        </thead>
                        <tbody>
                            {schools.map((school) => (
                                <tr key={school.id}>
                                    <td>
                                        <Link to={`/admin/schools/${school.id}`} className="platform-table-name">
                                            {school.name}
                                        </Link>
                                    </td>
                                    <td className="is-optional">
                                        {t(`superAdminDashboard:plan.${school.plan}`, { defaultValue: school.plan })}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${school.status}`}>
                                            {t(`superAdminDashboard:status.${school.status}`, { defaultValue: school.status })}
                                        </span>
                                    </td>
                                    <td className="is-numeric">{formatCount(school.students, locale)}</td>
                                    <td className="is-optional is-numeric">{formatCount(school.staff, locale)}</td>
                                    <td className="is-optional platform-table-muted">
                                        {formatShortDate(school.lastLogin, locale) || t('superAdminDashboard:common.never')}
                                    </td>
                                    <td className="is-optional platform-table-muted">
                                        {formatShortDate(school.renewalAt, locale) || t('superAdminDashboard:common.notSet')}
                                    </td>
                                    <td className="is-action">
                                        <Link
                                            to={`/admin/schools/${school.id}`}
                                            className="platform-row-action"
                                            aria-label={`${t('superAdminDashboard:schools.table.open')} ${school.name}`}
                                        >
                                            <HiOutlineEye size={15} />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
