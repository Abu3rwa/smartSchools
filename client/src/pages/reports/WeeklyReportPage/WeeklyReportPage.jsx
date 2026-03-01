import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentClass, selectClassStudents } from '../../../store/slices/classSlice';
import { selectLessons } from '../../../store/slices/lessonSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import WeeklyReportHeader from './components/WeeklyReportHeader';
import WeeklyLessonsSection from './components/WeeklyLessonsSection';
import WeeklyStudentsSection from './components/WeeklyStudentsSection';
import useWeeklyReportPageData from './hooks/useWeeklyReportPageData';
import './WeeklyReportPage.css';

const WeeklyReportPage = () => {
    const { classId } = useParams();

    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const lessons = useSelector(selectLessons);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const {
        selectedWeek,
        setSelectedWeek,
        weekStart,
        weekEnd,
        weeklyLessons
    } = useWeeklyReportPageData({ classId, academicYear, lessons });

    return (
        <div className="weekly-report-page">
            <WeeklyReportHeader
                classId={classId}
                className={currentClass?.name}
                academicYear={academicYear}
                selectedWeek={selectedWeek}
                onWeekChange={setSelectedWeek}
                weekStart={weekStart}
                weekEnd={weekEnd}
                onPrint={() => window.print()}
            />

            <div className="report-content">
                <WeeklyLessonsSection lessons={weeklyLessons} />
                <WeeklyStudentsSection students={students} />
            </div>
        </div>
    );
};

export default WeeklyReportPage;
