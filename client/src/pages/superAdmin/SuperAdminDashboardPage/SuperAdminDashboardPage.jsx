import { usePlatformDashboard } from './hooks/usePlatformDashboard.js';
import PlatformHeader from './components/PlatformHeader.jsx';
import PlatformKpiStrip from './components/PlatformKpiStrip.jsx';
import PlatformAttentionPanel from './components/PlatformAttentionPanel.jsx';
import PlatformRevenuePanel from './components/PlatformRevenuePanel.jsx';
import PlatformGrowthPanel from './components/PlatformGrowthPanel.jsx';
import PlatformSchoolsPanel from './components/PlatformSchoolsPanel.jsx';
import PlatformPlansPanel from './components/PlatformPlansPanel.jsx';
import PlatformAiPanel from './components/PlatformAiPanel.jsx';
import PlatformDemoPanel from './components/PlatformDemoPanel.jsx';
import PlatformSkeleton from './components/PlatformSkeleton.jsx';
import PlatformError from './components/PlatformError.jsx';
import '../../../components/superAdmin/SuperAdminBase.css';
import './SuperAdminDashboardPage.css';

/**
 * Platform owner's home. One aggregated request behind a 60s cache; the page
 * renders counts it did not compute itself.
 */
export default function SuperAdminDashboardPage() {
    const {
        summary,
        loading,
        error,
        range,
        setRange,
        locale,
        refresh,
        hasData,
    } = usePlatformDashboard();

    return (
        <div className="platform-dashboard">
            <PlatformHeader
                range={range}
                onRangeChange={setRange}
                onRefresh={refresh}
                generatedAt={summary?.generatedAt}
                loading={loading}
                locale={locale}
            />

            {!hasData ? (
                error ? (
                    <PlatformError message={error} onRetry={refresh} />
                ) : (
                    <PlatformSkeleton />
                )
            ) : (
                <div className="platform-grid" aria-busy={loading ? 'true' : undefined}>
                    <PlatformKpiStrip summary={summary} locale={locale} />
                    <PlatformAttentionPanel summary={summary} locale={locale} />
                    <div className="platform-two-col">
                        <PlatformRevenuePanel summary={summary} locale={locale} />
                        <PlatformGrowthPanel summary={summary} locale={locale} />
                    </div>
                    <div className="platform-two-col">
                        <PlatformSchoolsPanel summary={summary} locale={locale} />
                        <PlatformPlansPanel summary={summary} locale={locale} />
                    </div>
                    <div className="platform-two-col is-ai">
                        <PlatformAiPanel summary={summary} locale={locale} />
                        <PlatformDemoPanel summary={summary} locale={locale} />
                    </div>
                </div>
            )}
        </div>
    );
}
