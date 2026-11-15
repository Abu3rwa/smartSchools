import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineAcademicCap,
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineTrendingUp
} from 'react-icons/hi';
import { selectUser } from '../../../../store/slices/authSlice';
import { selectPendingCount } from '../../../../store/slices/substitutionsSlice';
import { selectMyClasses } from '../../../../store/slices/teacherSlice';
import DashboardHero from './components/DashboardHero';
import KpiRow from './components/KpiRow';
import TodayScheduleCard from './components/TodayScheduleCard';
import SubRequestsCard from './components/SubRequestsCard';
import AtRiskCard from './components/AtRiskCard';
import QuickActionsCard from './components/QuickActionsCard';
import TeacherAnalyticsSection from './components/TeacherAnalyticsSection';
import useTeacherDashboardData from './hooks/useTeacherDashboardData';
import useInboxAttention from './hooks/useInboxAttention';
import useNowMinutes from './hooks/useNowMinutes';
import { QUICK_ACTIONS } from './constants';
import { buildClassChips, getNextClass, getTodayLabel } from './utils/teacherDashboardPresentation';
import './TeacherDashboardPage.css';

const TeacherDashboardPage = () => {
    const { t, i18n } = useTranslation(['dashboard']);
    const user = useSelector(selectUser);
    const pendingCount = useSelector(selectPendingCount);
    const myClasses = useSelector(selectMyClasses);
    const inboxCount = useInboxAttention();
    const nowMinutes = useNowMinutes();

    const {
        timetableLoading,
        timetableError,
        todaySchedule,
        weekSchedule,
        analyticsData,
        analyticsLoading,
        analyticsError,
        reload
    } = useTeacherDashboardData();

    const locale = i18n.resolvedLanguage || i18n.language;
    const firstName = user?.firstName ?? t('dashboard:teacherDashboard.fallbacks.teacherName');
    const pendingSubsCount = pendingCount?.count ?? 0;
    const summary = analyticsData?.summary;
    const analyticsReady = !analyticsLoading && !analyticsError;
    const timetableReady = !timetableLoading && !timetableError;
    const average = analyticsReady ? Math.round(Number(summary?.avgClassPerformance) || 0) : null;

    const kpis = [
        {
            tone: 'teal',
            icon: HiOutlineCalendar,
            value: timetableReady ? todaySchedule.length : '—',
            label: t('dashboard:teacherDashboard.summary.classesToday')
        },
        {
            tone: pendingSubsCount > 0 ? 'amber' : 'emerald',
            icon: HiOutlineClipboardList,
            value: pendingCount?.loading ? '—' : pendingSubsCount,
            label: t('dashboard:teacherDashboard.summary.pendingSubRequests')
        },
        {
            tone: 'blue',
            icon: HiOutlineAcademicCap,
            value: analyticsReady ? summary?.activeClasses ?? 0 : '—',
            label: t('dashboard:teacherDashboard.analytics.summary.activeClasses')
        },
        {
            tone: 'emerald',
            icon: HiOutlineTrendingUp,
            value: average === null ? '—' : `${average}%`,
            label: t('dashboard:teacherDashboard.analytics.summary.avgClassPerformance'),
            percent: average ?? 0
        }
    ];

    return (
        <div className="tdash">
            <DashboardHero
                firstName={firstName}
                dateLabel={getTodayLabel(locale)}
                classChips={buildClassChips(myClasses)}
                inboxCount={inboxCount}
                loading={timetableLoading}
                error={timetableError}
                hasClasses={todaySchedule.length > 0}
                next={getNextClass(todaySchedule, nowMinutes)}
                locale={locale}
            />

            <KpiRow items={kpis} />

            <div className="td-grid">
                <TodayScheduleCard
                    todaySchedule={todaySchedule}
                    weekSchedule={weekSchedule}
                    timetableLoading={timetableLoading}
                    timetableError={timetableError}
                    nowMinutes={nowMinutes}
                    onRetry={reload}
                />
                <div className="td-aside">
                    <SubRequestsCard pendingCount={pendingCount} pendingSubsCount={pendingSubsCount} />
                    <AtRiskCard
                        students={analyticsData?.atRiskStudents || []}
                        loading={analyticsLoading}
                        error={analyticsError}
                    />
                </div>
            </div>

            <QuickActionsCard actions={QUICK_ACTIONS} />

            <TeacherAnalyticsSection
                analyticsData={analyticsData}
                analyticsLoading={analyticsLoading}
                analyticsError={analyticsError}
                onRetry={reload}
            />
        </div>
    );
};

export default TeacherDashboardPage;