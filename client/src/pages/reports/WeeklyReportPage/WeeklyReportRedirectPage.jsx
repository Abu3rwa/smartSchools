import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStudent, selectCurrentStudent, selectStudentsLoading } from '../../../store/slices/studentSlice';

const WeeklyReportRedirectPage = () => {
    const { studentId } = useParams();
    const dispatch = useDispatch();
    const student = useSelector(selectCurrentStudent);
    const loading = useSelector(selectStudentsLoading);

    useEffect(() => {
        if (studentId) {
            dispatch(fetchStudent(studentId));
        }
    }, [dispatch, studentId]);

    const resolvedClassId =
        student?._id === studentId
            ? (student.currentClass?._id || student.currentClass || '')
            : '';

    if (resolvedClassId) {
        return <Navigate to={`/portal/grades/weekly/class/${resolvedClassId}`} replace />;
    }

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="not-found">
            <h2>Weekly report unavailable</h2>
            <p>This student is not assigned to a class, so there is no class weekly report to show.</p>
            <Link to={studentId ? `/portal/students/${studentId}` : '/portal/students'} className="btn btn-secondary">
                Back to Student
            </Link>
        </div>
    );
};

export default WeeklyReportRedirectPage;
