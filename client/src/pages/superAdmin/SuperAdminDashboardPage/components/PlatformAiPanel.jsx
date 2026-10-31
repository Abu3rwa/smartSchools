import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    formatCents,
    formatPercent,
} from '../utils/platformDashboardPresentation.js';

export default function PlatformAiPanel({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const rows = summary.ai?.bySchool || [];
    const currency = summary.money?.currency || 'USD';
    const notSet = t('superAdminDashboard:common.notSet');

    const margin = (row) => (row.chargedCents > 0 ? row.profitCents / row.chargedCents : null);

    return (
        <section className="platform-panel" aria-labelledby="platform-ai-title">
            <div className="platform-panel-head">
                <div>
                    <h2 id="platform-ai-title" className="platform-panel-title">
                        {t('superAdminDashboard:ai.title')}
                    </h2>
                    <p className="platform-panel-hint">{t('superAdminDashboard:ai.subtitle')}</p>
                </div>
                <Link to="/admin/ai-credit" className="platform-text-link">
                    {t('superAdminDashboard:ai.viewAll')}
                </Link>
            </div>

            {rows.length === 0 ? (
                <p className="platform-empty">{t('superAdminDashboard:ai.empty')}</p>
            ) : (
                <div className="platform-table-wrap">
                    <table className="platform-table is-ai">
                        <thead>
                            <tr>
                                <th>{t('superAdminDashboard:ai.table.school')}</th>
                                <th className="is-numeric">{t('superAdminDashboard:ai.table.charged')}</th>
                                <th className="is-numeric">{t('superAdminDashboard:ai.table.profit')}</th>
                                <th className="is-numeric">{t('superAdminDashboard:ai.table.margin')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <Link to={`/admin/schools/${row.id}`} className="platform-table-name">
                                            {row.name || notSet}
                                        </Link>
                                    </td>
                                    <td className="is-numeric">{formatCents(row.chargedCents, locale, currency)}</td>
                                    <td className="is-numeric">{formatCents(row.profitCents, locale, currency)}</td>
                                    <td className="is-numeric">
                                        {formatPercent(margin(row), locale) || notSet}
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
