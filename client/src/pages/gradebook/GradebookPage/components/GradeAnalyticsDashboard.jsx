import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
    HiOutlineChartBar,
    HiOutlineTrendingUp,
    HiOutlineAcademicCap,
    HiOutlineExclamation
} from 'react-icons/hi';
import {
    selectSpreadsheetStudents,
    selectSpreadsheetColumns,
    selectSpreadsheetGrades
} from '../../../store/slices/spreadsheetSlice';

const GRADE_BANDS = [
    { label: 'A (90-100)', min: 90, color: '#10b981' },
    { label: 'B (80-89)', min: 80, color: '#3b82f6' },
    { label: 'C (70-79)', min: 70, color: '#f59e0b' },
    { label: 'D (60-69)', min: 60, color: '#f97316' },
    { label: 'F (<60)', min: 0, color: '#ef4444' }
];

const getBand = (pct) => GRADE_BANDS.find(b => pct >= b.min) || GRADE_BANDS[GRADE_BANDS.length - 1];

const GradeAnalyticsDashboard = () => {
    const students = useSelector(selectSpreadsheetStudents) || [];
    const columns = useSelector(selectSpreadsheetColumns) || [];
    const grades = useSelector(selectSpreadsheetGrades) || {};

    const getGrade = (studentId, columnId) => {
        const key = `${studentId}_${columnId}`;
        return grades[key]?.marks;
    };

    // Compute analytics
    const analytics = useMemo(() => {
        if (!students.length || !columns.length) return null;

        // Per-student averages
        const studentAvgs = students.map(s => {
            let sum = 0, count = 0;
            columns.forEach(col => {
                const val = getGrade(s._id, col._id);
                if (val !== undefined && val !== '' && !isNaN(val) && col.totalMarks > 0) {
                    sum += (Number(val) / col.totalMarks) * 100;
                    count++;
                }
            });
            return { ...s, avg: count > 0 ? sum / count : null };
        });

        // Per-column averages
        const columnAvgs = columns.map(col => {
            let sum = 0, count = 0;
            students.forEach(s => {
                const val = getGrade(s._id, col._id);
                if (val !== undefined && val !== '' && !isNaN(val) && col.totalMarks > 0) {
                    sum += (Number(val) / col.totalMarks) * 100;
                    count++;
                }
            });
            return { ...col, avg: count > 0 ? sum / count : null };
        });

        // Class average
        const validStudents = studentAvgs.filter(s => s.avg !== null);
        const classAvg = validStudents.length > 0
            ? validStudents.reduce((s, st) => s + st.avg, 0) / validStudents.length : 0;

        // Distribution
        const distribution = GRADE_BANDS.map(b => ({ ...b, count: 0 }));
        validStudents.forEach(s => {
            const band = getBand(s.avg);
            const d = distribution.find(x => x.label === band.label);
            if (d) d.count++;
        });

        // At-risk students (below 60%)
        const atRisk = studentAvgs.filter(s => s.avg !== null && s.avg < 60);

        // Top performers (above 90%)
        const topPerformers = studentAvgs
            .filter(s => s.avg !== null && s.avg >= 90)
            .sort((a, b) => b.avg - a.avg);

        // Missing grades count
        let totalCells = students.length * columns.length;
        let filledCells = 0;
        students.forEach(s => {
            columns.forEach(c => {
                const val = getGrade(s._id, c._id);
                if (val !== undefined && val !== '') filledCells++;
            });
        });

        return {
            studentAvgs,
            columnAvgs,
            classAvg,
            distribution,
            atRisk,
            topPerformers,
            completionRate: totalCells > 0 ? (filledCells / totalCells * 100) : 0,
            totalStudents: students.length,
            totalAssessments: columns.length
        };
    }, [students, columns, grades]);

    if (!analytics) {
        return (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                <HiOutlineChartBar size={48} style={{ margin: '0 auto 12px' }} />
                <p>Load spreadsheet data to view analytics</p>
            </div>
        );
    }

    const maxDist = Math.max(...analytics.distribution.map(d => d.count), 1);

    return (
        <div>
            <h3 style={{ margin: '0 0 16px' }}>
                <HiOutlineChartBar size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Grade Analytics
            </h3>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <SummaryCard label="Class Average" value={`${analytics.classAvg.toFixed(1)}%`}
                    color={getBand(analytics.classAvg).color} icon={<HiOutlineAcademicCap size={20} />} />
                <SummaryCard label="Students" value={analytics.totalStudents} color="#3b82f6"
                    icon={<HiOutlineTrendingUp size={20} />} />
                <SummaryCard label="Assessments" value={analytics.totalAssessments} color="#8b5cf6"
                    icon={<HiOutlineChartBar size={20} />} />
                <SummaryCard label="Completion" value={`${analytics.completionRate.toFixed(0)}%`}
                    color={analytics.completionRate >= 80 ? '#10b981' : '#f59e0b'}
                    icon={<HiOutlineExclamation size={20} />} />
            </div>

            {/* Grade Distribution (Bar chart via CSS) */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 12px' }}>Grade Distribution</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                    {analytics.distribution.map(d => (
                        <div key={d.label} style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{d.count}</div>
                            <div style={{
                                height: Math.max(4, (d.count / maxDist) * 100),
                                background: d.color,
                                borderRadius: '4px 4px 0 0',
                                transition: 'height 0.3s'
                            }} />
                            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{d.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* Assessment Averages */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                    <h4 style={{ margin: '0 0 12px' }}>Assessment Averages</h4>
                    <div style={{ maxHeight: 200, overflow: 'auto' }}>
                        {analytics.columnAvgs.map(col => (
                            <div key={col._id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 0', borderBottom: '1px solid #f3f4f6'
                            }}>
                                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                                    {col.name}
                                </span>
                                <span style={{
                                    fontWeight: 600, fontSize: 13,
                                    color: col.avg !== null ? getBand(col.avg).color : '#9ca3af'
                                }}>
                                    {col.avg !== null ? `${col.avg.toFixed(1)}%` : '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Performers */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                    <h4 style={{ margin: '0 0 12px' }}>
                        <HiOutlineTrendingUp size={16} style={{ verticalAlign: 'middle', marginRight: 4, color: '#10b981' }} />
                        Top Performers
                    </h4>
                    <div style={{ maxHeight: 200, overflow: 'auto' }}>
                        {analytics.topPerformers.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 13 }}>No students above 90%</p>
                        ) : analytics.topPerformers.slice(0, 10).map((s, i) => (
                            <div key={s._id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 0', borderBottom: '1px solid #f3f4f6'
                            }}>
                                <span style={{ fontSize: 13 }}>
                                    <strong style={{ color: '#6b7280', marginRight: 6 }}>#{i + 1}</strong>
                                    {s.name}
                                </span>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#10b981' }}>
                                    {s.avg.toFixed(1)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* At-Risk Students */}
            {analytics.atRisk.length > 0 && (
                <div style={{ border: '1px solid #fecaca', borderRadius: 8, padding: 16, background: '#fef2f2' }}>
                    <h4 style={{ margin: '0 0 12px', color: '#dc2626' }}>
                        <HiOutlineExclamation size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        At-Risk Students ({analytics.atRisk.length})
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                        {analytics.atRisk.sort((a, b) => a.avg - b.avg).map(s => (
                            <div key={s._id} style={{
                                display: 'flex', justifyContent: 'space-between',
                                background: '#fff', borderRadius: 6, padding: '6px 10px'
                            }}>
                                <span style={{ fontSize: 13 }}>{s.name}</span>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#ef4444' }}>
                                    {s.avg.toFixed(1)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const SummaryCard = ({ label, value, color, icon }) => (
    <div style={{
        border: '1px solid #e5e7eb', borderRadius: 8, padding: 14,
        display: 'flex', alignItems: 'center', gap: 12
    }}>
        <div style={{ color, flexShrink: 0 }}>{icon}</div>
        <div>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
        </div>
    </div>
);

export default GradeAnalyticsDashboard;
