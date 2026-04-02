import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    HiOutlinePrinter,
    HiOutlineDocumentReport,
    HiOutlineExclamation
} from 'react-icons/hi';
import {
    selectSpreadsheetStudents,
    selectSpreadsheetColumns,
    selectSpreadsheetGrades,
    selectMissingReport,
    fetchMissingReport
} from '../../../store/slices/spreadsheetSlice';

const PRINT_STYLES = `
@media print {
    body * { visibility: hidden; }
    .print-area, .print-area * { visibility: visible; }
    .print-area { position: absolute; left: 0; top: 0; width: 100%; }
    .no-print { display: none !important; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; }
    th { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
    h2, h3 { text-align: center; }
}
`;

const PrintableGradebook = ({ classId, subjectId, semester, academicYear }) => {
    const dispatch = useDispatch();
    const students = useSelector(selectSpreadsheetStudents);
    const columns = useSelector(selectSpreadsheetColumns);
    const grades = useSelector(selectSpreadsheetGrades);
    const missingReport = useSelector(selectMissingReport);

    const [view, setView] = useState('spreadsheet'); // spreadsheet | missing | progress
    const printRef = useRef(null);

    useEffect(() => {
        if (view === 'missing' && classId) {
            dispatch(fetchMissingReport({ classId, subjectId, semester, academicYear }));
        }
    }, [dispatch, view, classId, subjectId, semester, academicYear]);

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    const getGrade = (studentId, columnId) => {
        const key = `${studentId}_${columnId}`;
        return grades?.[key]?.marks ?? '';
    };

    const getStudentAvg = (studentId) => {
        let sum = 0, count = 0;
        (columns || []).forEach(col => {
            const val = getGrade(studentId, col._id);
            if (val !== '' && !isNaN(val) && col.totalMarks > 0) {
                sum += (Number(val) / col.totalMarks) * 100;
                count++;
            }
        });
        return count > 0 ? (sum / count).toFixed(1) + '%' : '—';
    };

    return (
        <div>
            <style>{PRINT_STYLES}</style>

            {/* Toolbar — hidden in print */}
            <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <button className={`btn btn-sm ${view === 'spreadsheet' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setView('spreadsheet')}>
                    <HiOutlineDocumentReport size={14} style={{ marginRight: 4 }} />Gradebook
                </button>
                <button className={`btn btn-sm ${view === 'missing' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setView('missing')}>
                    <HiOutlineExclamation size={14} style={{ marginRight: 4 }} />Missing Grades
                </button>
                <button className={`btn btn-sm ${view === 'progress' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setView('progress')}>
                    Student Progress
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={handlePrint}>
                    <HiOutlinePrinter size={14} style={{ marginRight: 4 }} />Print
                </button>
            </div>

            <div className="print-area" ref={printRef}>
                {/* Spreadsheet Print View */}
                {view === 'spreadsheet' && (
                    <div>
                        <h2 style={{ textAlign: 'center', marginBottom: 4 }}>Gradebook Report</h2>
                        <p style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
                            Semester {semester} — Academic Year {academicYear}
                        </p>
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', minWidth: 150 }}>Student</th>
                                    {(columns || []).map(col => (
                                        <th key={col._id} style={{ fontSize: 10 }}>
                                            {col.name}
                                            <br />
                                            <span style={{ fontWeight: 400, fontSize: 9 }}>/{col.totalMarks}</span>
                                        </th>
                                    ))}
                                    <th>Avg</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(students || []).map(s => (
                                    <tr key={s._id}>
                                        <td style={{ textAlign: 'left', fontWeight: 500 }}>{s.name}</td>
                                        {(columns || []).map(col => (
                                            <td key={col._id}>{getGrade(s._id, col._id)}</td>
                                        ))}
                                        <td style={{ fontWeight: 600 }}>{getStudentAvg(s._id)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Missing Grades Report */}
                {view === 'missing' && (
                    <div>
                        <h2 style={{ textAlign: 'center', marginBottom: 16 }}>Missing Grades Report</h2>
                        {!missingReport || missingReport.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#9ca3af' }}>No missing grades found.</p>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left' }}>Student</th>
                                        <th>Missing Columns</th>
                                        <th>Completion %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {missingReport.map((item, i) => (
                                        <tr key={i}>
                                            <td style={{ textAlign: 'left' }}>{item.studentName}</td>
                                            <td>
                                                {(item.missingColumns || []).map(c => c.name || c).join(', ')}
                                            </td>
                                            <td style={{
                                                fontWeight: 600,
                                                color: (item.completionPercent || 0) < 50 ? '#ef4444' :
                                                    (item.completionPercent || 0) < 80 ? '#f59e0b' : '#10b981'
                                            }}>
                                                {item.completionPercent?.toFixed(0) || 0}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* Student Progress Cards */}
                {view === 'progress' && (
                    <div>
                        <h2 style={{ textAlign: 'center', marginBottom: 16 }}>Student Progress Reports</h2>
                        {(students || []).map(s => (
                            <div key={s._id} style={{
                                border: '1px solid #d1d5db', borderRadius: 8, padding: 16,
                                marginBottom: 16, pageBreakInside: 'avoid'
                            }}>
                                <h3 style={{ margin: '0 0 8px' }}>{s.name}</h3>
                                <table style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left' }}>Assessment</th>
                                            <th>Score</th>
                                            <th>Max</th>
                                            <th>%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(columns || []).map(col => {
                                            const val = getGrade(s._id, col._id);
                                            const pct = val !== '' && col.totalMarks > 0
                                                ? ((Number(val) / col.totalMarks) * 100).toFixed(0)
                                                : '—';
                                            return (
                                                <tr key={col._id}>
                                                    <td style={{ textAlign: 'left' }}>{col.name}</td>
                                                    <td>{val || '—'}</td>
                                                    <td>{col.totalMarks}</td>
                                                    <td style={{
                                                        fontWeight: 600,
                                                        color: pct === '—' ? '#9ca3af' :
                                                            Number(pct) >= 80 ? '#10b981' :
                                                                Number(pct) >= 60 ? '#f59e0b' : '#ef4444'
                                                    }}>
                                                        {pct === '—' ? '—' : `${pct}%`}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <p style={{ textAlign: 'right', fontWeight: 600, marginTop: 8 }}>
                                    Overall: {getStudentAvg(s._id)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PrintableGradebook;
