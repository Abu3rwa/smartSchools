import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpSupervisorAssignments, createPlpSupervisorAssignment, deletePlpSupervisorAssignment,
    selectPlpSupervisorAssignments, selectPlpLoading, selectPlpError, clearPlpError,
} from '../../store/slices/plpSlice';
import { fetchTeachers, selectTeachers } from '../../store/slices/teacherSlice';
import toast from 'react-hot-toast';
import './PLP.css';

export default function PlpSupervisorAssignmentsPage() {
    const dispatch = useDispatch();
    const assignments = useSelector(selectPlpSupervisorAssignments);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const teachers = useSelector(selectTeachers);

    const [supervisorId, setSupervisorId] = useState('');
    const [teacherId, setTeacherId] = useState('');

    useEffect(() => { dispatch(fetchPlpSupervisorAssignments()); dispatch(fetchTeachers({ limit: 200 })); }, [dispatch]);
    useEffect(() => { if (error) { toast.error(error); dispatch(clearPlpError()); } }, [error, dispatch]);

    const add = async () => {
        if (!supervisorId || !teacherId) { toast.error('Select both supervisor and teacher'); return; }
        const r = await dispatch(createPlpSupervisorAssignment({ supervisorId, teacherId }));
        if (!r.error) { setSupervisorId(''); setTeacherId(''); toast.success('Assignment created'); }
        else toast.error(r.payload);
    };

    const remove = async (id) => {
        if (!window.confirm('Remove this assignment?')) return;
        await dispatch(deletePlpSupervisorAssignment(id));
        toast.success('Removed');
    };

    const teacherOptions = teachers.filter((t) => t.user);

    return (
        <div className="plp-page">
            <div className="plp-header">
                <h1>Supervisor → Teacher Assignments</h1>
            </div>

            <div className="plp-section">
                <h2>Add Assignment</h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="plp-form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                        <label>Supervisor</label>
                        <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
                            <option value="">Select supervisor…</option>
                            {teacherOptions.map((t) => (
                                <option key={t.user._id} value={t.user._id}>
                                    {t.user.firstName} {t.user.lastName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="plp-form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                        <label>Teacher</label>
                        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                            <option value="">Select teacher…</option>
                            {teacherOptions.map((t) => (
                                <option key={t.user._id} value={t.user._id}>
                                    {t.user.firstName} {t.user.lastName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={add}>Add</button>
                </div>
            </div>

            {loading && <div className="plp-loading">Loading…</div>}

            {!loading && assignments.length === 0 && (
                <div className="plp-empty">No supervisor assignments yet.</div>
            )}

            {assignments.length > 0 && (
                <div className="plp-section" style={{ padding: 0 }}>
                    <table className="plp-table">
                        <thead>
                            <tr><th>Supervisor</th><th>Teacher</th><th></th></tr>
                        </thead>
                        <tbody>
                            {assignments.map((a) => (
                                <tr key={a._id}>
                                    <td>{a.supervisor?.firstName} {a.supervisor?.lastName}</td>
                                    <td>{a.teacher?.firstName} {a.teacher?.lastName}</td>
                                    <td>
                                        <button className="btn btn-secondary btn-sm" onClick={() => remove(a._id)}>Remove</button>
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
