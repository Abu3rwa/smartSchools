import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import classService from '../../../services/classService';
import studentService from '../../../services/studentService';
import sbrService from '../../../services/sbrService';
import './SBRGenerationPage.css';

const PERIODS = [
    { value: 'semester_1', label: 'Semester 1' },
    { value: 'semester_2', label: 'Semester 2' },
    { value: 'full_year', label: 'Full Year' }
];

const getStudentList = (responsePayload) => {
    if (Array.isArray(responsePayload)) return responsePayload;
    if (Array.isArray(responsePayload?.data)) return responsePayload.data;
    if (Array.isArray(responsePayload?.students)) return responsePayload.students;
    if (Array.isArray(responsePayload?.data?.students)) return responsePayload.data.students;
    return [];
};

const getClassList = (responsePayload) => {
    if (Array.isArray(responsePayload)) return responsePayload;
    if (Array.isArray(responsePayload?.data)) return responsePayload.data;
    if (Array.isArray(responsePayload?.classes)) return responsePayload.classes;
    if (Array.isArray(responsePayload?.data?.classes)) return responsePayload.data.classes;
    return [];
};

const SBRGenerationPage = () => {
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [working, setWorking] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const [previewLoadedAt, setPreviewLoadedAt] = useState(null);
    const [pendingAction, setPendingAction] = useState(null);
    const previewFrameRef = useRef(null);
    const [form, setForm] = useState({
        classId: '',
        period: 'semester_1',
        academicYear: new Date().getMonth() >= 7
            ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
            : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`
    });

    const selectedClass = useMemo(
        () => classes.find((item) => item._id === form.classId),
        [classes, form.classId]
    );

    const loadClasses = async () => {
        setLoading(true);
        try {
            const response = await classService.getClasses();
            setClasses(getClassList(response));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load classes');
        } finally {
            setLoading(false);
        }
    };

    const loadStudents = async (classId) => {
        if (!classId) {
            setStudents([]);
            return;
        }

        setStudentsLoading(true);
        try {
            const response = await studentService.getStudentsByClass(classId);
            setStudents(getStudentList(response));
        } catch (error) {
            setStudents([]);
            toast.error(error?.response?.data?.message || 'Unable to load students for class');
        } finally {
            setStudentsLoading(false);
        }
    };

    const loadReports = useCallback(async () => {
        if (!form.classId) {
            setReports([]);
            return;
        }

        try {
            const result = await sbrService.getReportCards({
                classId: form.classId,
                period: form.period,
                academicYear: form.academicYear,
                limit: 100
            });
            setReports(result.items || []);
        } catch (error) {
            setReports([]);
            toast.error(error?.response?.data?.message || 'Unable to load reports');
        }
    }, [form.classId, form.period, form.academicYear]);

    useEffect(() => {
        loadClasses();
    }, []);

    useEffect(() => {
        loadStudents(form.classId);
    }, [form.classId]);

    useEffect(() => {
        loadReports();
    }, [loadReports]);

    const generateForStudent = async (studentId) => {
        if (!form.classId) {
            toast.error('Choose a class first');
            return;
        }

        try {
            setWorking(true);
            await sbrService.generateReport({
                studentId,
                classId: form.classId,
                period: form.period,
                academicYear: form.academicYear
            });
            toast.success('Report generated');
            await loadReports();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to generate report');
        } finally {
            setWorking(false);
        }
    };

    const fetchPreview = async ({ studentId, mode, reportId = null }) => {
        if (!form.classId) {
            toast.error('Choose a class first');
            return;
        }

        try {
            setPreviewLoading(true);
            const html = await sbrService.previewReport({
                studentId,
                classId: form.classId,
                period: form.period,
                academicYear: form.academicYear
            });
            setPreviewHtml(html || '<p>Preview not available.</p>');
            setPreviewLoadedAt(new Date());
            setPendingAction({ mode, studentId, reportId });
            setPreviewOpen(true);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const closePreview = () => {
        setPreviewOpen(false);
        setPreviewHtml('');
        setPreviewLoadedAt(null);
        setPendingAction(null);
    };

    const handlePrintPreview = () => {
        const frameWindow = previewFrameRef.current?.contentWindow;
        if (!frameWindow) {
            toast.error('Preview is not ready for printing yet');
            return;
        }

        frameWindow.focus();
        frameWindow.print();
    };

    const confirmPreviewAction = async () => {
        if (!pendingAction) return;

        if (pendingAction.mode === 'generate' && pendingAction.studentId) {
            closePreview();
            await generateForStudent(pendingAction.studentId);
            return;
        }

        if (pendingAction.mode === 'publish' && pendingAction.reportId) {
            closePreview();
            await handlePublish(pendingAction.reportId);
        }
    };

    const generateBulk = async () => {
        if (!form.classId) {
            toast.error('Choose a class first');
            return;
        }

        try {
            setWorking(true);
            const result = await sbrService.generateBulkReports({
                classId: form.classId,
                period: form.period,
                academicYear: form.academicYear
            });
            toast.success(`Generated ${result?.reportCards?.length || 0} report cards`);
            if (result?.bulkPdfUrl) {
                window.open(result.bulkPdfUrl, '_blank', 'noopener,noreferrer');
            }
            await loadReports();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Bulk generation failed');
        } finally {
            setWorking(false);
        }
    };

    const handlePublish = async (reportId) => {
        try {
            setWorking(true);
            await sbrService.publishReportCard(reportId);
            toast.success('Report published');
            await loadReports();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to publish report');
        } finally {
            setWorking(false);
        }
    };

    const handleEmail = async (report) => {
        const input = window.prompt('Optional recipient emails (comma-separated). Leave blank to use parent emails only.');
        const emails = String(input || '')
            .split(',')
            .map((email) => email.trim())
            .filter(Boolean);

        try {
            setWorking(true);
            await sbrService.emailReportCard(report.id, emails);
            toast.success('Report emailed');
            await loadReports();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to email report');
        } finally {
            setWorking(false);
        }
    };

    return (
        <div className="sbr-generation-page">
            <div className="sbr-generation-header">
                <h2>SBR Generation</h2>
                <p>Generate report cards per student or in bulk, then publish and email from one place.</p>
            </div>

            <section className="card sbr-filter-card">
                <div className="sbr-filter-grid">
                    <div className="form-group">
                        <label htmlFor="sbrClass">Class</label>
                        <select
                            id="sbrClass"
                            value={form.classId}
                            onChange={(event) => setForm((prev) => ({ ...prev, classId: event.target.value }))}
                        >
                            <option value="">Select class</option>
                            {classes.map((item) => (
                                <option key={item._id} value={item._id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="sbrPeriod">Period</label>
                        <select
                            id="sbrPeriod"
                            value={form.period}
                            onChange={(event) => setForm((prev) => ({ ...prev, period: event.target.value }))}
                        >
                            {PERIODS.map((period) => (
                                <option key={period.value} value={period.value}>{period.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="sbrYear">Academic Year</label>
                        <input
                            id="sbrYear"
                            value={form.academicYear}
                            onChange={(event) => setForm((prev) => ({ ...prev, academicYear: event.target.value }))}
                            placeholder="2025-2026"
                        />
                    </div>
                </div>

                <div className="sbr-filter-actions">
                    <button type="button" className="btn-primary" onClick={generateBulk} disabled={!form.classId || working}>
                        {working ? 'Working...' : 'Generate Bulk'}
                    </button>
                </div>
            </section>

            <section className="card">
                <h3>Students {selectedClass ? `- ${selectedClass.name}` : ''}</h3>
                {loading || studentsLoading ? (
                    <div className="sbr-muted">Loading students...</div>
                ) : !form.classId ? (
                    <div className="sbr-muted">Select a class to start generating reports.</div>
                ) : students.length === 0 ? (
                    <div className="sbr-muted">No students found for this class.</div>
                ) : (
                    <div className="sbr-table-wrap">
                        <table className="sbr-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Student ID</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student) => (
                                    <tr key={student._id || student.id}>
                                        <td>{[student.firstName, student.lastName].filter(Boolean).join(' ') || 'Student'}</td>
                                        <td>{student.studentId || '-'}</td>
                                        <td>
                                            <div className="sbr-action-cell">
                                                <button
                                                    type="button"
                                                    className="btn-primary"
                                                    onClick={() => fetchPreview({ studentId: student._id || student.id, mode: 'generate' })}
                                                    disabled={working || previewLoading}
                                                >
                                                    Preview & Generate
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="card">
                <h3>Generated Reports</h3>
                {reports.length === 0 ? (
                    <div className="sbr-muted">No generated reports for selected filters yet.</div>
                ) : (
                    <div className="sbr-table-wrap">
                        <table className="sbr-table">
                            <thead>
                                <tr>
                                    <th>Report ID</th>
                                    <th>Student</th>
                                    <th>Status</th>
                                    <th>Generated</th>
                                    <th>Emailed</th>
                                    <th>Recipients</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map((report) => (
                                    <tr key={report.id}>
                                        <td>{report.reportCardId}</td>
                                        <td>{[report.student?.firstName, report.student?.lastName].filter(Boolean).join(' ') || '-'}</td>
                                        <td>{report.status || 'draft'}</td>
                                        <td>{report.generatedAt ? new Date(report.generatedAt).toLocaleString() : '-'}</td>
                                        <td>{report.emailedAt ? new Date(report.emailedAt).toLocaleString() : 'Not emailed'}</td>
                                        <td>
                                            {(report.emailedTo || []).length > 0
                                                ? `${report.emailedTo.length} recipient(s)`
                                                : '-'}
                                        </td>
                                        <td className="sbr-action-cell">
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => sbrService.downloadReportCardPdf(report.id, `${report.reportCardId}.pdf`)}
                                            >
                                                Download
                                            </button>
                                            {(report.status || 'draft') !== 'published' && (
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    onClick={() => fetchPreview({
                                                        studentId: report.student?._id || report.student?.id,
                                                        mode: 'publish',
                                                        reportId: report.id
                                                    })}
                                                    disabled={working || previewLoading}
                                                >
                                                    Preview & Publish
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => handleEmail(report)}
                                                disabled={working}
                                            >
                                                Email
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {previewOpen && (
                <div className="sbr-preview-overlay" role="dialog" aria-modal="true" aria-label="SBR preview dialog">
                    <div className="sbr-preview-modal">
                        <div className="sbr-preview-header">
                            <div>
                                <h3>SBR Preview</h3>
                                <div className="sbr-preview-meta">
                                    {previewLoadedAt ? `Loaded ${previewLoadedAt.toLocaleString()}` : ''}
                                </div>
                            </div>
                            <div className="sbr-preview-header-actions">
                                <button type="button" className="btn-secondary" onClick={handlePrintPreview}>Print</button>
                                <button type="button" className="btn-secondary" onClick={closePreview}>Close</button>
                            </div>
                        </div>
                        {previewLoading ? (
                            <div className="sbr-muted">Loading preview...</div>
                        ) : (
                            <iframe
                                ref={previewFrameRef}
                                className="sbr-preview-frame"
                                title="SBR preview"
                                srcDoc={previewHtml}
                            />
                        )}
                        <div className="sbr-preview-actions">
                            <button type="button" className="btn-secondary" onClick={closePreview}>Cancel</button>
                            <button type="button" className="btn-primary" onClick={confirmPreviewAction} disabled={working}>
                                {pendingAction?.mode === 'publish' ? 'Publish Report' : 'Generate Report'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SBRGenerationPage;
