import { useMemo } from 'react';
import StudentDashboardHeader from './components/StudentDashboardHeader';
import StudentDashboardLoading from './components/StudentDashboardLoading';
import StudentScheduleCard from './components/StudentScheduleCard';
import RecentGradesCard from './components/RecentGradesCard';
import PracticeProgressCard from './components/PracticeProgressCard';
import UpcomingDueDatesCard from './components/UpcomingDueDatesCard';
import useStudentDashboardData from './hooks/useStudentDashboardData';
import {
    getTodayStart,
    getUpcomingAssignments
} from './utils/studentDashboardPresentation';
import './StudentDashboardPage.css';

const StudentDashboardPage = () => {
    const {
        assignments,
        assignmentsLoading,
        user,
        schedule,
        grades,
        dataLoading
    } = useStudentDashboardData();

    const loading = assignmentsLoading || dataLoading;
    const firstName = user?.firstName ?? 'Student';

    const todayStart = useMemo(() => getTodayStart(), []);
    const upcomingAssignments = useMemo(() => {
        return getUpcomingAssignments(assignments, todayStart);
    }, [assignments, todayStart]);

    return (
        <div className="student-dashboard">
            <StudentDashboardHeader firstName={firstName} />

            {loading ? (
                <StudentDashboardLoading />
            ) : (
                <div className="student-dashboard-grid">
                    <StudentScheduleCard schedule={schedule} />
                    <RecentGradesCard grades={grades} />
                    <PracticeProgressCard assignments={assignments} />
                    <UpcomingDueDatesCard upcomingAssignments={upcomingAssignments} todayStart={todayStart} />
                </div>
            )}
        </div>
    );
};

export default StudentDashboardPage;
