import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    formatCount,
    formatShortDate,
} from '../utils/platformDashboardPresentation.js';

const STAGES = ['new', 'contacted', 'scheduled'];

export default function PlatformDemoPanel({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const demos = summary.demo?.recent || [];
    const funnel = summary.demo?.funnel;
    const byAge = funnel?.byAge || { fresh: 0, aging: 0, overdue: 0 };
    const stageMax = Math.max(1, ...STAGES.map((stage) => funnel?.byStatus?.[stage] || 0));

    return (
        <section className="platform-panel" aria-labelledby="platform-demo-title">
            <div className="platform-panel-head">
                <div>
                    <h2 id="platform-demo-title" className="platform-panel-title">
                        {t('superAdminDashboard:demoRequests.title')}
                    </h2>
                    <p className="platform-panel-hint">{t('superAdminDashboard:demoRequests.subtitle')}</p>
                </div>
                <Link to="/admin/demo-requests" className="platform-text-link">
                    {t('superAdminDashboard:demoRequests.viewAll')}
                </Link>
            </div>

            {funnel && funnel.total > 0 && (
                <div className="platform-funnel">
                    <div className="platform-funnel-stages">
                        {STAGES.map((stage) => {
                            const count = funnel.byStatus?.[stage] || 0;
                            return (
                                <div className="platform-funnel-stage" key={stage}>
                                    <div className="platform-funnel-stage-head">
                                        <span>{t(`superAdminDashboard:demoRequests.status.${stage}`)}</span>
                                        <span className="platform-funnel-stage-count">
                                            {formatCount(count, locale)}
                                        </span>
                                    </div>
                                    <span className="platform-funnel-track">
                                        <span
                                            className="platform-funnel-fill"
                                            style={{ width: `${Math.round((count / stageMax) * 100)}%` }}
                                        />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="platform-funnel-age">
                        <span className="platform-funnel-age-label">
                            {t('superAdminDashboard:demoRequests.age.label')}
                        </span>
                        <span>
                            {t('superAdminDashboard:demoRequests.age.fresh')}
                            {' '}<b>{formatCount(byAge.fresh, locale)}</b>
                        </span>
                        <span>
                            {t('superAdminDashboard:demoRequests.age.aging')}
                            {' '}<b>{formatCount(byAge.aging, locale)}</b>
                        </span>
                        <span>
                            {t('superAdminDashboard:demoRequests.age.overdue')}
                            {' '}<b>{formatCount(byAge.overdue, locale)}</b>
                        </span>
                    </div>
                </div>
            )}

            {demos.length === 0 ? (
                <p className="platform-empty">{t('superAdminDashboard:demoRequests.empty')}</p>
            ) : (
                <div className="platform-table-wrap">
                    <table className="platform-table is-demos">
                        <thead>
                            <tr>
                                <th>{t('superAdminDashboard:demoRequests.table.school')}</th>
                                <th>{t('superAdminDashboard:demoRequests.table.contact')}</th>
                                <th className="is-optional">{t('superAdminDashboard:demoRequests.table.requested')}</th>
                                <th>{t('superAdminDashboard:demoRequests.table.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {demos.map((demo) => (
                                <tr key={demo.id}>
                                    <td className="platform-table-strong">{demo.schoolName}</td>
                                    <td>
                                        <div>{demo.name}</div>
                                        <div className="platform-table-sub">{demo.email}</div>
                                    </td>
                                    <td className="is-optional platform-table-muted">
                                        {formatShortDate(demo.createdAt, locale) || t('superAdminDashboard:common.notSet')}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${demo.status}`}>
                                            {t(`superAdminDashboard:demoRequests.status.${demo.status}`, {
                                                defaultValue: demo.status,
                                            })}
                                        </span>
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
