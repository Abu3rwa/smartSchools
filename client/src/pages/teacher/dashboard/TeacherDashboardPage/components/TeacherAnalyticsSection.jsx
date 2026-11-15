import { useTranslation } from 'react-i18next';
import { HiOutlineChartBar, HiOutlineExclamation, HiOutlineRefresh } from 'react-icons/hi';
import SectionCard from './SectionCard';
import { toneVar } from '../constants';
import { WEEKDAY_KEYS, getPerformanceTone, getWorkloadCeiling } from '../utils/teacherDashboardPresentation';

const WorkloadPanel = ({ workload, today, t }) => {
    const counts = workload.map((item) => Number(item.count) || 0);
    const ceiling = getWorkloadCeiling(counts);
    const axis = [ceiling, (ceiling * 2) / 3, ceiling / 3, 0];

    return (
        <div className="td-panel">
            <h4 className="td-paneltitle">{t('dashboard:teacherDashboard.analytics.workloadByWeekday')}</h4>
            <div className="td-wchart" role="img" aria-label={t('dashboard:teacherDashboard.analytics.workloadByWeekday')}>
                <div className="td-waxis">
                    {axis.map((value) => <span key={value}>{value}</span>)}
                </div>
                <div className="td-wlines">
                    {[0, 1, 2, 3].map((line) => (
                        <span key={line} style={{ bottom: `${(line / 3) * 100}%` }} />
                    ))}
                </div>
                <div className="td-wbars">
                    {workload.map((item, index) => {
                        const count = counts[index];
                        return (
                            <div
                                className={`td-wcol${item.day === today ? ' today' : ''}${count ? '' : ' zero'}`}
                                key={item.day}
                            >
                                <span className="td-wval">{count || ''}</span>
                                <div className="td-wplot">
                                    <div
                                        className="td-wbar"
                                        style={{ height: `${Math.max(2, (count / ceiling) * 100)}%` }}
                                    />
                                </div>
                                <span className="td-wday">
                                    {t(`dashboard:teacherDashboard.analytics.weekdays.${WEEKDAY_KEYS[item.day]}`)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="td-legend">
                <span><i style={{ background: 'var(--td-teal)' }} />{t('dashboard:teacherDashboard.analytics.classes')}</span>
                <span><i style={{ background: 'var(--td-amber)' }} />{t('dashboard:teacherDashboard.summary.today')}</span>
            </div>
        </div>
    );
};

const PerformancePanel = ({ classes, average, t }) => {
    const position = Math.min(100, Math.max(0, average));
    // Keep the label inside the panel when the average sits near either edge.
    const shift = position <= 14 ? '0%' : position >= 86 ? '-100%' : '-50%';

    return (
        <div className="td-panel">
            <h4 className="td-paneltitle">{t('dashboard:teacherDashboard.analytics.classPerformance')}</h4>
            <div className="td-bars">
                {classes.map((item) => {
                    const value = Math.round(Number(item.avgPercentage) || 0);
                    return (
                        <div className="td-prow" key={item.classId} style={{ '--tone': toneVar(getPerformanceTone(value)) }}>
                            <div className="td-barline">
                                <span className="td-barname" title={item.className}>{item.className}</span>
                                <span className="td-barval">{`${value}%`}</span>
                            </div>
                            <div className="td-track2">
                                <div className="td-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
                            </div>
                        </div>
                    );
                })}
                <span className="td-avgline" style={{ insetInlineStart: `${position}%` }} />
                <span
                    className="td-avgtag"
                    style={{ insetInlineStart: `${position}%`, '--td-avg-shift': shift }}
                >
                    <bdi>{`${t('dashboard:teacherDashboard.analytics.classAverage')} ${average}%`}</bdi>
                </span>
            </div>
            <div className="td-thresholds">
                <span><i style={{ background: 'var(--td-emerald)' }} /><bdi>75–100%</bdi></span>
                <span><i style={{ background: 'var(--td-teal)' }} /><bdi>60–74%</bdi></span>
                <span><i style={{ background: 'var(--td-amber)' }} /><bdi>&lt; 60%</bdi></span>
            </div>
        </div>
    );
};

const TeacherAnalyticsSection = ({ analyticsData, analyticsLoading, analyticsError, onRetry }) => {
    const { t } = useTranslation(['dashboard']);
    const today = new Date().getDay();

    let body;
    if (analyticsLoading) {
        body = (
            <div className="td-panels">
                {[0, 1].map((panel) => (
                    <div className="td-panel" key={panel}>
                        <div className="td-sk" style={{ height: 12, width: '52%' }} />
                        <div className="td-sk" style={{ height: 130, marginTop: 12 }} />
                    </div>
                ))}
            </div>
        );
    } else if (analyticsError) {
        body = (
            <div className="td-empty err">
                <i><HiOutlineExclamation size={20} /></i>
                <p>{t('dashboard:teacherDashboard.analytics.loadError')}</p>
                <button type="button" className="td-btn" onClick={onRetry}>
                    <HiOutlineRefresh size={14} />
                    {t('dashboard:teacherDashboard.todaySchedule.retry')}
                </button>
            </div>
        );
    } else {
        const workload = analyticsData?.workloadByWeekday || [];
        const classes = analyticsData?.classPerformance || [];
        const average = Math.round(Number(analyticsData?.summary?.avgClassPerformance) || 0);
        const hasWorkload = workload.some((item) => Number(item.count) > 0);

        body = (
            <div className="td-panels">
                {hasWorkload
                    ? <WorkloadPanel workload={workload} today={today} t={t} />
                    : (
                        <div className="td-panel">
                            <h4 className="td-paneltitle">{t('dashboard:teacherDashboard.analytics.workloadByWeekday')}</h4>
                            <p className="empty-text">{t('dashboard:teacherDashboard.analytics.noData')}</p>
                        </div>
                    )}
                {classes.length > 0
                    ? <PerformancePanel classes={classes} average={average} t={t} />
                    : (
                        <div className="td-panel">
                            <h4 className="td-paneltitle">{t('dashboard:teacherDashboard.analytics.classPerformance')}</h4>
                            <p className="empty-text">{t('dashboard:teacherDashboard.analytics.noData')}</p>
                        </div>
                    )}
            </div>
        );
    }

    return (
        <SectionCard
            title={t('dashboard:teacherDashboard.analytics.title')}
            subtitle={t('dashboard:teacherDashboard.analytics.subtitle')}
            icon={HiOutlineChartBar}
            tone="blue"
        >
            {body}
        </SectionCard>
    );
};

export default TeacherAnalyticsSection;