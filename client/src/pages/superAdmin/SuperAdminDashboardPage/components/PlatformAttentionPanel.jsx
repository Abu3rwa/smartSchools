import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineChevronRight } from 'react-icons/hi';
import {
    buildAttentionRows,
    formatCount,
} from '../utils/platformDashboardPresentation.js';

const MAX_VISIBLE_ROWS = 5;

export default function PlatformAttentionPanel({ summary, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const rows = buildAttentionRows(summary, t, locale);
    const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS);
    const total = rows.reduce((sum, row) => sum + row.count, 0);

    return (
        <section className="platform-panel platform-attention" aria-labelledby="platform-attention-title">
            <div className="platform-panel-head">
                <div>
                    <h2 id="platform-attention-title" className="platform-panel-title">
                        {t('superAdminDashboard:attention.title')}
                    </h2>
                    <p className="platform-panel-hint">{t('superAdminDashboard:attention.subtitle')}</p>
                </div>
                {total > 0 && (
                    <span className="platform-attention-total">{formatCount(total, locale)}</span>
                )}
            </div>

            {rows.length === 0 ? (
                <p className="platform-empty">{t('superAdminDashboard:attention.empty')}</p>
            ) : (
                <ul className="platform-attention-list">
                    {visibleRows.map((row) => (
                        <li key={row.key}>
                            <Link to={row.to} className={`platform-attention-row is-${row.key}`}>
                                <span className="platform-attention-count">{formatCount(row.count, locale)}</span>
                                <span className="platform-attention-body">
                                    <span className="platform-attention-title">{row.title}</span>
                                    {row.meta && <span className="platform-attention-meta">{row.meta}</span>}
                                </span>
                                <span className="platform-attention-action">
                                    {t('superAdminDashboard:attention.review')}
                                    <HiOutlineChevronRight size={14} />
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {rows.length > visibleRows.length && (
                <p className="platform-attention-more">
                    {t('superAdminDashboard:attention.truncated')}
                </p>
            )}
        </section>
    );
}
