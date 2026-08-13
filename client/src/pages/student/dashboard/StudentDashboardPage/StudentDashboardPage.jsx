import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { HiOutlineDocumentReport } from 'react-icons/hi';
import './StudentDashboardPage.css';

const StudentDashboardPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
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

    const practiceAssignments = useMemo(() => 
        assignments.filter(a => a.practiceConfig?.sessionType !== 'assessment'),
    [assignments]);

    const assessmentAssignments = useMemo(() => 
        assignments.filter(a => a.practiceConfig?.sessionType === 'assessment'),
    [assignments]);

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
                            className={`student-dashboard-nav-btn${location.pathname === item.path ? ' active' : ''}`}
                            onClick={() => navigate(item.path)}
                            aria-current={location.pathname === item.path ? 'page' : undefined}
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
                    
                    <PracticeProgressCard 
                        assignments={practiceAssignments} 
                        title="Practice Progress"
                        emptyText="No practice standards assigned yet."
                    />
                    
                    {assessmentAssignments.length > 0 && (
                        <PracticeProgressCard 
                            assignments={assessmentAssignments} 
                            title="Graded Assessments"
                            emptyText="No graded assessments available."
                            icon={HiOutlineDocumentReport}
                        />
                    )}

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
