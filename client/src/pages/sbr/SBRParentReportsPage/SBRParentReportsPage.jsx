import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import sbrService from '../../../services/sbrService';
import './SBRParentReportsPage.css';

const PERIOD_OPTIONS = [
    { value: '', label: 'All periods' },
    { value: 'semester_1', label: 'Semester 1' },
    { value: 'semester_2', label: 'Semester 2' },
    { value: 'full_year', label: 'Full Year' }
];

const SBRParentReportsPage = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);
    const [filters, setFilters] = useState({
        period: '',
        academicYear: ''
    });

    const loadReports = useCallback(async () => {
        try {
            setLoading(true);
            const result = await sbrService.getReportCards({
                period: filters.period || undefined,
                academicYear: filters.academicYear || undefined,
                limit: 100
            });
            setReports(result.items || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load report cards');
            setReports([]);
        } finally {
            setLoading(false);
        }
    }, [filters.period, filters.academicYear]);

    useEffect(() => {
        loadReports();
    }, [loadReports]);

    const openDetails = async (reportId) => {
        try {
            const fullReport = await sbrService.getReportCard(reportId);
            setSelectedReport(fullReport);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load report details');
        }
    };

    return (
        <div className="sbr-parent-page">
            <div className="sbr-parent-header">
                <h2>Standards-Based Report Cards</h2>
                <p>View, read, and download your child report cards.</p>
            </div>

            <section className="card sbr-parent-filters">
                <div className="sbr-parent-filter-grid">
                    <div className="form-group">
                        <label htmlFor="periodFilter">Period</label>
                        <select
                            id="periodFilter"
                            value={filters.period}
                            onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))}
                        >
                            {PERIOD_OPTIONS.map((option) => (
                                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="yearFilter">Academic Year</label>
                        <input
                            id="yearFilter"
                            placeholder="Example: 2025-2026"
                            value={filters.academicYear}
                            onChange={(event) => setFilters((prev) => ({ ...prev, academicYear: event.target.value }))}
                        />
                    </div>
                </div>
            </section>

            <section className="card">
                <h3>Available Reports</h3>
                {loading ? (
                    <div className="sbr-muted">Loading report cards...</div>
                ) : reports.length === 0 ? (
                    <div className="sbr-muted">No report cards found.</div>
                ) : (
                    <div className="sbr-parent-report-grid">
                        {reports.map((report) => (
                            <article className="sbr-parent-report-card" key={report.id}>
                                <div className="report-main">
                                    <h4>{report.reportCardId}</h4>
                                    <p>
                                        {[report.student?.firstName, report.student?.lastName].filter(Boolean).join(' ') || 'Student'}
                                    </p>
                                    <span>
                                        {report.period?.label || report.period?.type || 'Period'} - {report.academicYear || 'N/A'}
                                    </span>
                                </div>
                                <div className="report-actions">
                                    <button type="button" className="btn-secondary" onClick={() => openDetails(report.id)}>
                                        View Details
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={() => sbrService.downloadReportCardPdf(report.id, `${report.reportCardId}.pdf`)}
                                    >
                                        Download PDF
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {selectedReport && (
                <section className="card sbr-report-details">
                    <div className="sbr-details-header">
                        <h3>{selectedReport.reportCardId}</h3>
                        <button type="button" className="btn-secondary" onClick={() => setSelectedReport(null)}>
                            Close
                        </button>
                    </div>

                    <div className="sbr-details-meta">
                        <span>
                            Student: {[selectedReport.student?.firstName, selectedReport.student?.lastName].filter(Boolean).join(' ')}
                        </span>
                        <span>Class: {selectedReport.class?.name || '-'}</span>
                        <span>Year: {selectedReport.academicYear || '-'}</span>
                    </div>

                    {(selectedReport.subjects || []).map((subject) => (
                        <div className="sbr-subject-block" key={subject.subjectId || subject.subjectName}>
                            <h4>{subject.subjectName || 'Subject'}</h4>
                            {(subject.categories || []).map((category) => (
                                <div className="sbr-category-block" key={`${subject.subjectId || subject.subjectName}-${category.categoryName}`}>
                                    <h5>{category.categoryName}</h5>
                                    <ul>
                                        {(category.standards || []).map((standard) => (
                                            <li key={standard.standardId || standard.standardCode}>
                                                <strong>{standard.standardCode}</strong> - {standard.standardDescription || 'No description'}
                                                <span className="sbr-level-inline">
                                                    {standard.levelLabel || standard.levelValue || standard.specialCode || 'N/A'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
};

export default SBRParentReportsPage;
