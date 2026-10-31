import { useTranslation } from 'react-i18next';
import {
    buildRevenueSeries,
    formatMoney,
    formatPercent,
} from '../utils/platformDashboardPresentation.js';

const AXIS_STEP = 2;

export default function PlatformRevenuePanel({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const currency = summary.money?.currency || 'USD';
    const { rows, totals, hasData } = buildRevenueSeries(summary.series, locale);

    const barLabel = (row) => [
        row.label,
        `${formatMoney(row.invoiced, locale, currency)} ${t('superAdminDashboard:revenue.invoiced')}`,
        `${formatMoney(row.collected, locale, currency)} ${t('superAdminDashboard:revenue.collected')}`,
    ].join(' · ');

    return (
        <section className="platform-panel" aria-labelledby="platform-revenue-title">
            <div className="platform-panel-head">
                <div>
                    <h2 id="platform-revenue-title" className="platform-panel-title">
                        {t('superAdminDashboard:revenue.title')}
                    </h2>
                    <p className="platform-panel-hint">{t('superAdminDashboard:revenue.subtitle')}</p>
                </div>
                <div className="platform-chart-legend" aria-hidden="true">
                    <span><i className="is-invoiced" />{t('superAdminDashboard:revenue.invoiced')}</span>
                    <span><i className="is-collected" />{t('superAdminDashboard:revenue.collected')}</span>
                </div>
            </div>

            {!hasData ? (
                <p className="platform-empty">{t('superAdminDashboard:revenue.empty')}</p>
            ) : (
                <div className="platform-chart-block">
                    <div className="platform-chart" role="img" aria-label={t('superAdminDashboard:revenue.title')}>
                        {rows.map((row) => (
                            <div className="platform-chart-col" key={row.month} title={barLabel(row)}>
                                <span
                                    className="platform-chart-bar is-invoiced"
                                    style={{ height: `${row.invoicedPct}%` }}
                                />
                                <span
                                    className="platform-chart-bar is-collected"
                                    style={{ height: `${row.collectedPct}%` }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="platform-chart-axis" aria-hidden="true">
                        {rows.map((row, index) => (
                            <span key={row.month}>{index % AXIS_STEP === 0 ? row.label : ''}</span>
                        ))}
                    </div>
                    <div className="platform-stat-row">
                        <div className="platform-stat">
                            <span className="platform-stat-value">
                                {formatMoney(totals.invoiced, locale, currency)}
                            </span>
                            <span className="platform-stat-label">
                                {t('superAdminDashboard:revenue.invoiced')}
                            </span>
                        </div>
                        <div className="platform-stat">
                            <span className="platform-stat-value">
                                {formatMoney(totals.collected, locale, currency)}
                            </span>
                            <span className="platform-stat-label">
                                {t('superAdminDashboard:revenue.collected')}
                            </span>
                        </div>
                        <div className="platform-stat">
                            <span className="platform-stat-value">
                                {formatPercent(totals.rate, locale) || t('superAdminDashboard:common.notSet')}
                            </span>
                            <span className="platform-stat-label">
                                {t('superAdminDashboard:revenue.collectionRate')}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
