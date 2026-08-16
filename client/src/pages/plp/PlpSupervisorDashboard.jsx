import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
    fetchPlpRecords, fetchSupervisorTeachers,
    selectPlpRecords, selectSupervisorTeachers, selectPlpLoading,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import './PLP.css';

export default function PlpSupervisorDashboard() {
    const dispatch = useDispatch();
    const records = useSelector(selectPlpRecords);
    const teachers = useSelector(selectSupervisorTeachers);
    const loading = useSelector(selectPlpLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const now = new Date();
    const month = now.getMonth() + 1;

    useEffect(() => {
        dispatch(fetchSupervisorTeachers());
        dispatch(fetchPlpRecords({ academicYear, month }));
    }, [dispatch, academicYear, month]);

    const teacherIds = teachers.map((t) => t.teacher?._id).filter(Boolean);
    const myTeachers = teachers.map((t) => t.teacher).filter(Boolean);

    const recordsByTeacher = myTeachers.map((teacher) => {
        const teacherRecords = records.filter((r) => {
            const tid = typeof r.teacher === 'object' ? r.teacher._id : r.teacher;
            return tid === teacher._id;
        });
        const submitted = teacherRecords.filter((r) => r.status !== 'in_progress').length;
        return { teacher, total: teacherRecords.length, submitted };
    });

    return (
        <div className="plp-page">
            <div className="plp-header">
                <h1>PLP Supervisor Dashboard</h1>
            </div>
            {loading && <div className="plp-loading">Loading…</div>}
            {!loading && myTeachers.length === 0 && (
                <div className="plp-empty">No teachers are assigned to you yet. Contact your admin.</div>
            )}
            {myTeachers.length > 0 && (
                <div className="plp-grid">
                    {recordsByTeacher.map(({ teacher, total, submitted }) => (
                        <div key={teacher._id} className="plp-card">
                            <h3>{teacher.firstName} {teacher.lastName}</h3>
                            <p>{teacher.email}</p>
                            <p style={{ fontWeight: 600 }}>Records this month: {total} &nbsp;|&nbsp; Submitted: {submitted}</p>
                            <div className="plp-action-row">
                                <Link to={`/portal/plp/records?teacherId=${teacher._id}`} className="btn btn-secondary btn-sm">View Records</Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
