import { useTranslation } from 'react-i18next';
import {
    buildGrowthSeries,
    formatCount,
} from '../utils/platformDashboardPresentation.js';

const AXIS_STEP = 2;

export default function PlatformGrowthPanel({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const { rows, totals, hasData } = buildGrowthSeries(summary.series, locale);

    const barLabel = (row) => [
        row.label,
        `${formatCount(row.newStudents, locale)} ${t('superAdminDashboard:growth.newStudents')}`,
        `${formatCount(row.newSchools, locale)} ${t('superAdminDashboard:growth.newSchools')}`,
    ].join(' · ');

    return (
        <section className="platform-panel" aria-labelledby="platform-growth-title">
            <div className="platform-panel-head">
                <div>
                    <h2 id="platform-growth-title" className="platform-panel-title">
                        {t('superAdminDashboard:growth.title')}
                    </h2>
                    <p className="platform-panel-hint">{t('superAdminDashboard:growth.subtitle')}</p>
                </div>
            </div>

            {!hasData ? (
                <p className="platform-empty">{t('superAdminDashboard:growth.empty')}</p>
            ) : (
                <div className="platform-chart-block">
                    <div className="platform-stat-row">
                        <div className="platform-stat">
                            <span className="platform-stat-value">
                                {formatCount(totals.schools, locale)}
                            </span>
                            <span className="platform-stat-label">
                                {t('superAdminDashboard:growth.newSchools')}
                            </span>
                        </div>
                        <div className="platform-stat">
                            <span className="platform-stat-value">
                                {formatCount(totals.students, locale)}
                            </span>
                            <span className="platform-stat-label">
                                {t('superAdminDashboard:growth.newStudents')}
                            </span>
                        </div>
                    </div>
                    <div className="platform-chart" role="img" aria-label={t('superAdminDashboard:growth.newStudents')}>
                        {rows.map((row) => (
                            <div className="platform-chart-col is-single" key={row.month} title={barLabel(row)}>
                                <span
                                    className="platform-chart-bar is-students"
                                    style={{ height: `${row.studentsPct}%` }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="platform-chart-axis" aria-hidden="true">
                        {rows.map((row, index) => (
                            <span key={row.month}>{index % AXIS_STEP === 0 ? row.label : ''}</span>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
