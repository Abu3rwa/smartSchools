import { useEffect, useState } from 'react';
import api from '../config/api';
import { HiOutlineClipboardList } from 'react-icons/hi';
import './StudentGradesPage.css';

const MONTHS = [
    { value: '', label: 'All months' },
    ...Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
    })),
];

const StudentGradesPage = () => {
    const [grades, setGrades] = useState([]);
    const [bySubject, setBySubject] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [subjectId, setSubjectId] = useState('');
    const [month, setMonth] = useState('');
    const [semester, setSemester] = useState('');

    const fetchGrades = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (subjectId) params.set('subjectId', subjectId);
        if (month) params.set('month', month);
        if (semester) params.set('semester', semester);
        api.get(`/grades/my-grades?${params.toString()}`)
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
    }, [subjectId, month, semester]);

    const formatDate = (d) =>
        d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

    const formatGradeType = (t) => (t || '').replace(/_/g, ' ');

    return (
        <div className="student-grades-page">
            <header className="page-header">
                <h1><HiOutlineClipboardList className="header-icon" /> My Grades</h1>
                <p className="page-subtitle">View your grades by subject and period.</p>
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
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grades.map((g) => {
                                            const pct = g.maxMarks > 0
                                                ? Math.round((g.marks / g.maxMarks) * 100)
                                                : 0;
                                            return (
                                                <tr key={g._id}>
                                                    <td>{formatDate(g.date)}</td>
                                                    <td>{g.subject?.name || '—'}</td>
                                                    <td>{formatGradeType(g.gradeType)}</td>
                                                    <td>{g.marks}</td>
                                                    <td>{g.maxMarks}</td>
                                                    <td>{pct}%</td>
                                                    <td>{g.remarks || '—'}</td>
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
