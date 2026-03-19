import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import StudentDashboardHeader from './components/StudentDashboardHeader';
import StudentDashboardLoading from './components/StudentDashboardLoading';
import StudentScheduleCard from './components/StudentScheduleCard';
import RecentGradesCard from './components/RecentGradesCard';
import PracticeProgressCard from './components/PracticeProgressCard';
import UpcomingDueDatesCard from './components/UpcomingDueDatesCard';
import MyTasksCard from './components/MyTasksCard';
import { selectSchoolFeatures } from '../../../../store/slices/schoolFeaturesSlice';
import useStudentDashboardData from './hooks/useStudentDashboardData';
import { studentNavLinks } from './utils/studentNavLinks';
import {
    getTodayStart,
    getUpcomingAssignments
} from './utils/studentDashboardPresentation';
import './StudentDashboardPage.css';

const StudentDashboardPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation(['layout.sidebar']);
    const schoolFeatures = useSelector(selectSchoolFeatures);
    const {
        assignments,
        assignmentsLoading,
        user,
        schedule,
        grades,
        classAssignments,
        academicTasks,
        tasksLoading,
        dataLoading
    } = useStudentDashboardData();

    const loading = assignmentsLoading || dataLoading;
    const firstName = user?.firstName ?? 'Student';

    const availableNavLinks = useMemo(() => (
        studentNavLinks.filter((item) => {
            if (!item.feature) return true;
            return schoolFeatures?.[item.feature] !== false;
        })
    ), [schoolFeatures]);

    const todayStart = useMemo(() => getTodayStart(), []);
    const upcomingAssignments = useMemo(() => {
        return getUpcomingAssignments(assignments, classAssignments, todayStart);
    }, [assignments, classAssignments, todayStart]);

    return (
        <div className="student-dashboard">
            <StudentDashboardHeader firstName={firstName} />

            <section className="student-dashboard-nav" aria-label="Student navigation">
                {availableNavLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.path}
                            type="button"
                            className="student-dashboard-nav-btn"
                            onClick={() => navigate(item.path)}
                        >
                            <Icon size={26} className="student-dashboard-nav-icon" />
                            <span>{t(`layout.sidebar:items.${item.labelKey}`)}</span>
                        </button>
                    );
                })}
            </section>

            {loading ? (
                <StudentDashboardLoading />
            ) : (
                <div className="student-dashboard-grid">
                    <StudentScheduleCard schedule={schedule} />
                    <RecentGradesCard grades={grades} />
                    <PracticeProgressCard assignments={assignments} />
                    <UpcomingDueDatesCard upcomingAssignments={upcomingAssignments} todayStart={todayStart} />
                    {schoolFeatures?.academicIntelligence !== false ? (
                        <MyTasksCard tasks={academicTasks} loading={tasksLoading} />
                    ) : null}
                </div>
            )}
        </div>
    );
};

export default StudentDashboardPage;
