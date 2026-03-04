import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../config/api';
import { HiOutlineClipboardList } from 'react-icons/hi';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { selectUser } from '../store/slices/authSlice';
import './StudentGradesPage.css';

const MONTHS = [
    { value: '', label: 'All months' },
    ...Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
    })),
];

const StudentGradesPage = () => {
    const { studentId } = useParams();
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);
    const isStudentView = user?.role === 'student' && !studentId;
    const canEditGrades = ['teacher', 'admin'].includes(user?.role || '');

    const [studentName, setStudentName] = useState('');
    const [grades, setGrades] = useState([]);
    const [bySubject, setBySubject] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [subjectId, setSubjectId] = useState('');
    const [month, setMonth] = useState('');
    const [semester, setSemester] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [savingGradeId, setSavingGradeId] = useState('');
    const [editingGradeId, setEditingGradeId] = useState('');
    const [editForm, setEditForm] = useState({ marks: '', maxMarks: '', remarks: '' });

    const pageTitle = useMemo(() => {
        if (isStudentView) {
            return 'My Grades';
        }
        return 'Student Gradebook';
    }, [isStudentView]);

    useEffect(() => {
        if (!studentId) {
            setStudentName('');
            return;
        }

        api.get(`/students/${studentId}`)
            .then((res) => {
                const student = res.data?.data?.student;
                if (student?.firstName || student?.lastName) {
                    setStudentName(`${student.firstName || ''} ${student.lastName || ''}`.trim());
                } else {
                    setStudentName('');
                }
            })
            .catch(() => setStudentName(''));
    }, [studentId]);

    const fetchGrades = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (subjectId) {
            params.set('subjectId', subjectId);
            params.set('subject', subjectId);
        }
        if (month) params.set('month', month);
        if (semester) params.set('semester', semester);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (academicYear) params.set('academicYear', academicYear);

        const endpoint = studentId
            ? `/grades/student/${studentId}`
            : '/grades/my-grades';

        api.get(`${endpoint}?${params.toString()}`)
            .then((res) => {
                const data = res.data?.data || {};
                setGrades(data.grades || []);
                setBySubject(data.bySubject || []);
                const subjList = (data.bySubject || []).map((s) => s.subject).filter(Boolean);
                setSubjects(subjList);
            })
            .catch(() => {
                setGrades([]);
                setBySubject([]);
                setSubjects([]);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchGrades();
    }, [studentId, subjectId, month, semester, academicYear, startDate, endDate]);

    const formatDate = (d) =>
        d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

    const formatGradeType = (t) => (t || '').replace(/_/g, ' ');

    const handleEditStart = (grade) => {
        setEditingGradeId(grade._id);
        setEditForm({
            marks: grade.marks,
            maxMarks: grade.maxMarks,
            remarks: grade.remarks || ''
        });
    };

    const handleEditCancel = () => {
        setEditingGradeId('');
        setEditForm({ marks: '', maxMarks: '', remarks: '' });
    };

    const handleEditSave = async (gradeId) => {
        const marks = Number(editForm.marks);
        const maxMarks = Number(editForm.maxMarks);

        if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0 || marks < 0 || marks > maxMarks) {
            window.alert('Please enter valid marks. Marks must be between 0 and max marks.');
            return;
        }

        setSavingGradeId(gradeId);
        try {
            await api.put(`/grades/${gradeId}`, {
                marks,
                maxMarks,
                remarks: String(editForm.remarks || '').trim()
            });
            setEditingGradeId('');
            fetchGrades();
        } catch (error) {
            window.alert(error.response?.data?.message || 'Failed to update grade');
        } finally {
            setSavingGradeId('');
        }
    };

    return (
        <div className="student-grades-page">
            <header className="page-header">
                <h1><HiOutlineClipboardList className="header-icon" /> {pageTitle}</h1>
                <p className="page-subtitle">
                    {isStudentView ? 'View your grades by subject and period.' : 'View and edit a student gradebook by date range.'}
                    {!isStudentView && studentName ? ` Student: ${studentName}.` : ''}
                    {academicYear ? ` Academic Year: ${academicYear}.` : ''}
                </p>
            </header>

            <div className="filters-bar">
                <label className="filter-group">
                    <span className="filter-label">Subject</span>
                    <select
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All subjects</option>
                        {subjects.map((s) => (
                            <option key={s._id} value={s._id}>{s.name}</option>
                        ))}
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">Month</span>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="filter-select"
                    >
                        {MONTHS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">Semester</span>
                    <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All</option>
                        <option value="1">Semester 1</option>
                        <option value="2">Semester 2</option>
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">Start date</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="filter-select"
                    />
                </label>
                <label className="filter-group">
                    <span className="filter-label">End date</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="filter-select"
                    />
                </label>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner" />
                    <p>Loading grades...</p>
                </div>
            ) : (
                <>
                    {bySubject.length > 0 && (
                        <section className="summary-cards">
                            <h2 className="section-title">Average by subject</h2>
                            <div className="summary-grid">
                                {bySubject.map((s) => (
                                    <div key={s.subject?._id} className="summary-card">
                                        <span className="summary-subject">{s.subject?.name}</span>
                                        <span className="summary-average">{s.average}%</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="grades-section">
                        <h2 className="section-title">Grades</h2>
                        {grades.length === 0 ? (
                            <p className="empty-state">No grades found for the selected filters.</p>
                        ) : (
                            <div className="table-wrap">
                                <table className="grades-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Subject</th>
                                            <th>Type</th>
                                            <th>Marks</th>
                                            <th>Max</th>
                                            <th>%</th>
                                            <th>Remarks</th>
                                            {canEditGrades && <th>Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grades.map((g) => {
                                            const pct = g.maxMarks > 0
                                                ? Math.round((g.marks / g.maxMarks) * 100)
                                                : 0;
                                            const isEditing = editingGradeId === g._id;
                                            const isSaving = savingGradeId === g._id;
                                            return (
                                                <tr key={g._id}>
                                                    <td>{formatDate(g.date)}</td>
                                                    <td>{g.subject?.name || '—'}</td>
                                                    <td>{formatGradeType(g.gradeType)}</td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                className="table-input"
                                                                value={editForm.marks}
                                                                onChange={(e) => setEditForm((prev) => ({ ...prev, marks: e.target.value }))}
                                                                min={0}
                                                                step={0.5}
                                                            />
                                                        ) : g.marks}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                className="table-input"
                                                                value={editForm.maxMarks}
                                                                onChange={(e) => setEditForm((prev) => ({ ...prev, maxMarks: e.target.value }))}
                                                                min={1}
                                                                step={0.5}
                                                            />
                                                        ) : g.maxMarks}
                                                    </td>
                                                    <td>{isEditing ? '—' : `${pct}%`}</td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input
                                                                type="text"
                                                                className="table-input"
                                                                value={editForm.remarks}
                                                                onChange={(e) => setEditForm((prev) => ({ ...prev, remarks: e.target.value }))}
                                                                placeholder="Optional remarks"
                                                            />
                                                        ) : (g.remarks || '—')}
                                                    </td>
                                                    {canEditGrades && (
                                                        <td>
                                                            {isEditing ? (
                                                                <div className="table-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-primary btn-sm"
                                                                        onClick={() => handleEditSave(g._id)}
                                                                        disabled={isSaving}
                                                                    >
                                                                        {isSaving ? 'Saving...' : 'Save'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-secondary btn-sm"
                                                                        onClick={handleEditCancel}
                                                                        disabled={isSaving}
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-secondary btn-sm"
                                                                    onClick={() => handleEditStart(g)}
                                                                >
                                                                    Edit
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default StudentGradesPage;
