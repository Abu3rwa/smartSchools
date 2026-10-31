import { useTranslation } from 'react-i18next';
import {
    buildPlanRows,
    formatCount,
} from '../utils/platformDashboardPresentation.js';

export default function PlatformPlansPanel({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const rows = buildPlanRows(summary);

    return (
        <section className="platform-panel" aria-labelledby="platform-plans-title">
            <div className="platform-panel-head">
                <div>
                    <h2 id="platform-plans-title" className="platform-panel-title">
                        {t('superAdminDashboard:plans.title')}
                    </h2>
                    <p className="platform-panel-hint">{t('superAdminDashboard:plans.subtitle')}</p>
                </div>
            </div>

            {rows.length === 0 ? (
                <p className="platform-empty">{t('superAdminDashboard:plans.empty')}</p>
            ) : (
                <ul className="platform-plan-list">
                    {rows.map((row) => (
                        <li className="platform-plan-row" key={row.plan}>
                            <span className="platform-plan-name">
                                {t(`superAdminDashboard:plan.${row.plan}`, { defaultValue: row.plan })}
                            </span>
                            <span className="platform-plan-track">
                                <span className="platform-plan-fill" style={{ width: `${row.percent}%` }} />
                            </span>
                            <span className="platform-plan-count">{formatCount(row.count, locale)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
