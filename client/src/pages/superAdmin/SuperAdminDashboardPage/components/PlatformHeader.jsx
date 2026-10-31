import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineRefresh } from 'react-icons/hi';
import { formatUpdatedAgo } from '../utils/platformDashboardPresentation.js';

const RANGES = ['30d', '90d', '12m'];
const FRESHNESS_TICK_MS = 60 * 1000;

export default function PlatformHeader({ range, onRangeChange, onRefresh, generatedAt, loading, locale }) {
    const { t } = useTranslation(['superAdminDashboard']);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!generatedAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);
        return () => clearInterval(timer);
    }, [generatedAt]);

    const updated = formatUpdatedAgo(generatedAt, locale, now);
    const status = loading
        ? t('superAdminDashboard:header.refreshing')
        : updated
            ? t('superAdminDashboard:header.updatedAgo', { when: updated })
            : '';

    return (
        <header className="platform-header">
            <div className="platform-header-main">
                <h1 className="platform-title">{t('superAdminDashboard:header.title')}</h1>
                <p className="platform-subtitle">{t('superAdminDashboard:header.subtitle')}</p>
            </div>

            <div className="platform-header-actions">
                <div className="platform-range" role="group" aria-label={t('superAdminDashboard:header.rangeLabel')}>
                    {RANGES.map((key) => (
                        <button
                            key={key}
                            type="button"
                            className={`platform-range-btn${key === range ? ' is-active' : ''}`}
                            aria-pressed={key === range}
                            onClick={() => onRangeChange(key)}
                        >
                            {t(`superAdminDashboard:header.range.${key}`)}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    className="platform-refresh"
                    onClick={onRefresh}
                    disabled={loading}
                >
                    <HiOutlineRefresh size={15} />
                    {t('superAdminDashboard:header.refresh')}
                </button>

                {status && (
                    <span className="platform-updated" aria-hidden="true">{status}</span>
                )}
                <span className="platform-sr-only" role="status" aria-live="polite">{status}</span>
            </div>
        </header>
    );
}
