import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
    fetchPlpRecords, submitPlpRecord,
    selectPlpRecords, selectPlpLoading, selectPlpError, clearPlpError,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import { selectUser } from '../../store/slices/authSlice';
import toast from 'react-hot-toast';
import './PLP.css';

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function PlpTeacherClassboardPage() {
    const dispatch = useDispatch();
    const records = useSelector(selectPlpRecords);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);

    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);

    useEffect(() => {
        dispatch(fetchPlpRecords({ academicYear, month }));
    }, [dispatch, academicYear, month]);

    useEffect(() => {
        if (error) { toast.error(error); dispatch(clearPlpError()); }
    }, [error, dispatch]);

    const handleSubmit = async (id) => {
        const r = await dispatch(submitPlpRecord(id));
        if (!r.error) toast.success('Record submitted');
        else toast.error(r.payload);
    };

    const isAdmin = ['admin', 'department_principal'].includes(user?.role);

    return (
        <div className="plp-page">
            <div className="plp-header">
                <h1>PLP Classboard</h1>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
            </div>
            {loading && <div className="plp-loading">Loading…</div>}
            {!loading && records.length === 0 && <div className="plp-empty">No PLP records for this month.</div>}
            {records.length > 0 && (
                <div className="plp-section" style={{ padding: 0 }}>
                    <table className="plp-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Class</th>
                                <th>Theme</th>
                                <th>Level</th>
                                <th>Score</th>
                                <th>Evidence</th>
                                <th>Award</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((r) => (
                                <tr key={r._id}>
                                    <td>{r.student?.firstName} {r.student?.lastName}</td>
                                    <td>{r.class?.name}</td>
                                    <td style={{ textTransform: 'capitalize' }}>{r.theme}</td>
                                    <td><span className={`plp-badge plp-badge-${r.level}`}>{r.level}</span></td>
                                    <td>{r.weightedScore?.toFixed(1)}</td>
                                    <td>{r.evidenceCount}</td>
                                    <td><span className={`plp-badge plp-badge-${r.awardDecision}`}>{r.awardDecision?.replace('_', ' ')}</span></td>
                                    <td><span className={`plp-badge plp-badge-${r.status}`}>{r.status}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <Link to={`/portal/plp/records/${r._id}`} className="btn btn-secondary btn-sm">Detail</Link>
                                            {r.status === 'in_progress' && !isAdmin && (
                                                <button className="btn btn-primary btn-sm" onClick={() => handleSubmit(r._id)}>Submit</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
