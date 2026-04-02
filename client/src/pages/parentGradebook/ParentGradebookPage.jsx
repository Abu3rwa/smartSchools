import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlineAcademicCap,
    HiOutlineChartBar,
    HiOutlineDocumentText,
    HiOutlineChevronDown,
    HiOutlineChevronUp
} from 'react-icons/hi';
import { selectUser } from '../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import parentGradebookService from '../../services/parentGradebookService';

const ParentGradebookPage = () => {
    const { t } = useTranslation(['gradebook']);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const [loading, setLoading] = useState(true);
    const [gradesData, setGradesData] = useState(null);
    const [progressData, setProgressData] = useState(null);
    const [reportCards, setReportCards] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [expandedSubjects, setExpandedSubjects] = useState({});
    const [activeTab, setActiveTab] = useState('grades');
    const [semester, setSemester] = useState('');

    // Get children from user profile
    const children = user?.children || [];

    useEffect(() => {
        if (children.length > 0 && !selectedStudent) {
            setSelectedStudent(children[0]._id || children[0]);
        }
    }, [children, selectedStudent]);

    const fetchData = useCallback(async () => {
        if (!selectedStudent) return;
        setLoading(true);
        try {
            const params = { academicYear };
            if (semester) params.semester = semester;

            const [gradesRes, progressRes, reportCardsRes] = await Promise.all([
                parentGradebookService.getGrades(selectedStudent, params),
                parentGradebookService.getProgress(selectedStudent, params).catch(() => null),
                parentGradebookService.getReportCards(selectedStudent, { academicYear }).catch(() => null)
            ]);

            if (gradesRes?.success) setGradesData(gradesRes.data);
            if (progressRes?.success) setProgressData(progressRes.data);
            if (reportCardsRes?.success) setReportCards(reportCardsRes.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load grades');
        } finally {
            setLoading(false);
        }
    }, [selectedStudent, academicYear, semester]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleSubject = (subjectName) => {
        setExpandedSubjects(prev => ({ ...prev, [subjectName]: !prev[subjectName] }));
    };

    const getGradeColor = (percentage) => {
        if (percentage >= 90) return '#16a34a';
        if (percentage >= 80) return '#2563eb';
        if (percentage >= 70) return '#ca8a04';
        if (percentage >= 60) return '#ea580c';
        return '#dc2626';
    };

    if (children.length === 0) {
        return (
            <div className="page-container" style={{ padding: 24 }}>
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                    <HiOutlineAcademicCap size={48} style={{ color: '#9ca3af', marginBottom: 12 }} />
                    <h3>No Students Linked</h3>
                    <p className="text-muted">No students are currently linked to your account. Please contact the school administration.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                        <HiOutlineAcademicCap size={28} />
                        {t('gradebook:parent.title', 'Academic Progress')}
                    </h1>
                    <p className="text-muted" style={{ margin: '4px 0 0' }}>{academicYear}</p>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {children.length > 1 && (
                        <select
                            value={selectedStudent || ''}
                            onChange={(e) => setSelectedStudent(e.target.value)}
                            style={{ padding: '6px 12px', borderRadius: 6 }}
                        >
                            {children.map((child) => (
                                <option key={child._id || child} value={child._id || child}>
                                    {child.firstName ? `${child.firstName} ${child.lastName}` : `Student`}
                                </option>
                            ))}
                        </select>
                    )}
                    <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: 6 }}
                    >
                        <option value="">All Semesters</option>
                        <option value="1">Semester 1</option>
                        <option value="2">Semester 2</option>
                    </select>
                </div>
            </div>

            {/* Tab navigation */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
                {[
                    { key: 'grades', icon: HiOutlineAcademicCap, label: 'Grades' },
                    { key: 'progress', icon: HiOutlineChartBar, label: 'Progress' },
                    { key: 'reports', icon: HiOutlineDocumentText, label: 'Report Cards' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                            border: 'none', background: 'none', cursor: 'pointer',
                            borderBottom: activeTab === tab.key ? '2px solid var(--primary-color, #3b82f6)' : '2px solid transparent',
                            color: activeTab === tab.key ? 'var(--primary-color, #3b82f6)' : '#6b7280',
                            fontWeight: activeTab === tab.key ? 600 : 400, marginBottom: -2
                        }}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" />
                    <p className="text-muted" style={{ marginTop: 12 }}>Loading academic data...</p>
                </div>
            ) : (
                <>
                    {/* GRADES TAB */}
                    {activeTab === 'grades' && gradesData && (
                        <div>
                            {/* Overall summary */}
                            <div className="card" style={{ marginBottom: 16, padding: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: 0 }}>{gradesData.studentName}</h3>
                                        <p className="text-muted" style={{ margin: '4px 0 0' }}>
                                            {gradesData.totalGrades} grades across {gradesData.subjects?.length || 0} subjects
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{
                                            fontSize: 32, fontWeight: 700,
                                            color: getGradeColor(gradesData.overallAverage)
                                        }}>
                                            {gradesData.overallAverage}%
                                        </div>
                                        <div style={{ fontSize: 12, color: '#6b7280' }}>Overall Average</div>
                                    </div>
                                </div>
                            </div>

                            {/* Subject cards */}
                            {(gradesData.subjects || []).map((subj) => (
                                <div key={subj.subject} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
                                    <div
                                        onClick={() => toggleSubject(subj.subject)}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '14px 20px', cursor: 'pointer', background: '#f9fafb'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {expandedSubjects[subj.subject]
                                                ? <HiOutlineChevronUp size={18} />
                                                : <HiOutlineChevronDown size={18} />}
                                            <div>
                                                <strong>{subj.subject}</strong>
                                                <span className="text-muted" style={{ marginLeft: 8, fontSize: 13 }}>
                                                    {subj.totalGrades} grades
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{
                                            fontSize: 20, fontWeight: 600,
                                            color: getGradeColor(subj.average)
                                        }}>
                                            {subj.average}%
                                        </div>
                                    </div>

                                    {expandedSubjects[subj.subject] && (
                                        <div style={{ padding: '12px 20px' }}>
                                            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Date</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Assessment</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Category</th>
                                                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>Score</th>
                                                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 500 }}>%</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {subj.recentGrades.map((g, i) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                            <td style={{ padding: '8px' }}>{g.date ? new Date(g.date).toLocaleDateString() : '-'}</td>
                                                            <td style={{ padding: '8px' }}>
                                                                {g.title || g.category}
                                                                {g.comment && (
                                                                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{g.comment}</div>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '8px' }}>
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: 12, fontSize: 11,
                                                                    background: '#f3f4f6', textTransform: 'capitalize'
                                                                }}>
                                                                    {g.category}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'right' }}>{g.marks}/{g.maxMarks}</td>
                                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: getGradeColor(g.percentage) }}>
                                                                {g.percentage}%
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {(gradesData.subjects || []).length === 0 && (
                                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                                    <p className="text-muted">No grades available for the selected period.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PROGRESS TAB */}
                    {activeTab === 'progress' && (
                        <div>
                            {progressData ? (
                                <div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                                        {(progressData.subjectAverages || []).map((sa) => (
                                            <div key={sa.subject} className="card" style={{ padding: 16, textAlign: 'center' }}>
                                                <div style={{ fontSize: 28, fontWeight: 700, color: getGradeColor(sa.average) }}>
                                                    {sa.average}%
                                                </div>
                                                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{sa.subject}</div>
                                                <div style={{ fontSize: 11, color: '#9ca3af' }}>{sa.gradeCount} assessments</div>
                                            </div>
                                        ))}
                                    </div>

                                    {progressData.monthlyTrend && progressData.monthlyTrend.length > 0 && (
                                        <div className="card" style={{ padding: 20 }}>
                                            <h4 style={{ marginTop: 0 }}>Monthly Trend</h4>
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                                                {progressData.monthlyTrend.map((m, i) => (
                                                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                                                        <div
                                                            style={{
                                                                height: `${Math.max(m.average, 5)}%`,
                                                                background: getGradeColor(m.average),
                                                                borderRadius: '4px 4px 0 0',
                                                                minHeight: 4,
                                                                transition: 'height 0.3s'
                                                            }}
                                                        />
                                                        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{m.month}</div>
                                                        <div style={{ fontSize: 11, fontWeight: 600 }}>{m.average}%</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                                    <p className="text-muted">Progress data is not yet available.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* REPORT CARDS TAB */}
                    {activeTab === 'reports' && (
                        <div>
                            {reportCards.length > 0 ? (
                                <div style={{ display: 'grid', gap: 12 }}>
                                    {reportCards.map((rc) => (
                                        <div key={rc._id} className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <strong>{rc.title || `Report Card — ${rc.semester ? `Semester ${rc.semester}` : 'Full Year'}`}</strong>
                                                <div className="text-muted" style={{ fontSize: 13 }}>
                                                    {rc.academicYear} • Generated {rc.createdAt ? new Date(rc.createdAt).toLocaleDateString() : ''}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                {rc.overallAverage != null && (
                                                    <span style={{ fontSize: 18, fontWeight: 600, color: getGradeColor(rc.overallAverage) }}>
                                                        {rc.overallAverage}%
                                                    </span>
                                                )}
                                                {rc.pdfUrl && (
                                                    <a href={rc.pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                                                        <HiOutlineDocumentText size={14} /> View PDF
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                                    <HiOutlineDocumentText size={36} style={{ color: '#9ca3af', marginBottom: 8 }} />
                                    <p className="text-muted">No report cards have been published yet.</p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ParentGradebookPage;
