import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlineDocumentText,
    HiOutlineRefresh,
    HiOutlineEye,
    HiOutlinePaperAirplane,
    HiOutlineUserGroup,
    HiOutlinePrinter
} from 'react-icons/hi';
import {
    fetchReportCards,
    generateReportCard,
    generateBulkReportCards,
    publishReportCard,
    updateReportCardComments,
    selectReportCards,
    selectReportCardsLoading,
    selectReportCardGenerating,
    selectCurrentReportCard,
    selectBulkResult,
    clearBulkResult,
    clearCurrentReportCard
} from '../../store/slices/reportCardSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';

const STATUS_COLORS = {
    draft: '#f59e0b',
    generated: '#3b82f6',
    published: '#10b981',
    emailed: '#8b5cf6'
};

const ReportCardManagerPage = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['gradebook']);
    const reportCards = useSelector(selectReportCards);
    const loading = useSelector(selectReportCardsLoading);
    const generating = useSelector(selectReportCardGenerating);
    const currentReportCard = useSelector(selectCurrentReportCard);
    const bulkResult = useSelector(selectBulkResult);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const [filters, setFilters] = useState({ classId: '', semester: 1, status: '' });
    const [showGenerate, setShowGenerate] = useState(false);
    const [generateForm, setGenerateForm] = useState({
        studentId: '',
        classId: '',
        semester: 1,
        template: 'classic',
        includeComments: true,
        includeAttendance: true
    });
    const [showBulk, setShowBulk] = useState(false);
    const [bulkForm, setBulkForm] = useState({
        classId: '',
        semester: 1,
        template: 'classic'
    });
    const [viewingId, setViewingId] = useState(null);
    const [commentForm, setCommentForm] = useState({ teacherComment: '', principalComment: '' });

    useEffect(() => {
        dispatch(fetchReportCards({ academicYear, ...filters }));
    }, [dispatch, academicYear, filters]);

    const handleGenerate = useCallback(async () => {
        if (!generateForm.studentId || !generateForm.classId) {
            toast.error('Select a student and class');
            return;
        }
        try {
            await dispatch(generateReportCard({ ...generateForm, academicYear })).unwrap();
            toast.success('Report card generated');
            setShowGenerate(false);
            dispatch(fetchReportCards({ academicYear, ...filters }));
        } catch (err) {
            toast.error(err || 'Generation failed');
        }
    }, [dispatch, generateForm, academicYear, filters]);

    const handleBulkGenerate = useCallback(async () => {
        if (!bulkForm.classId) {
            toast.error('Select a class');
            return;
        }
        try {
            await dispatch(generateBulkReportCards({ ...bulkForm, academicYear })).unwrap();
            toast.success('Bulk generation completed');
            dispatch(fetchReportCards({ academicYear, ...filters }));
        } catch (err) {
            toast.error(err || 'Bulk generation failed');
        }
    }, [dispatch, bulkForm, academicYear, filters]);

    const handlePublish = useCallback(async (id) => {
        try {
            await dispatch(publishReportCard(id)).unwrap();
            toast.success('Report card published');
        } catch (err) {
            toast.error(err || 'Publish failed');
        }
    }, [dispatch]);

    const handleSaveComments = useCallback(async () => {
        if (!viewingId) return;
        try {
            await dispatch(updateReportCardComments({ id: viewingId, data: commentForm })).unwrap();
            toast.success('Comments saved');
        } catch (err) {
            toast.error(err || 'Failed to save comments');
        }
    }, [dispatch, viewingId, commentForm]);

    const handlePrint = useCallback((id) => {
        window.open(`/api/report-cards/${id}/pdf`, '_blank');
    }, []);

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Report Cards</h2>
                    <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
                        Generate, review, and publish traditional report cards
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline-primary" onClick={() => setShowGenerate(true)}>
                        <HiOutlineDocumentText size={16} style={{ marginRight: 4 }} />Generate Single
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowBulk(true)}>
                        <HiOutlineUserGroup size={16} style={{ marginRight: 4 }} />Bulk Generate
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <select value={filters.semester} onChange={e => setFilters(p => ({ ...p, semester: Number(e.target.value) }))}
                    style={{ minWidth: 130 }}>
                    <option value={1}>Semester 1</option>
                    <option value={2}>Semester 2</option>
                </select>
                <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
                    style={{ minWidth: 130 }}>
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="generated">Generated</option>
                    <option value="published">Published</option>
                    <option value="emailed">Emailed</option>
                </select>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => dispatch(fetchReportCards({ academicYear, ...filters }))}>
                    <HiOutlineRefresh size={14} />
                </button>
            </div>

            {/* Report Cards List */}
            {loading ? (
                <p className="text-muted">Loading report cards...</p>
            ) : reportCards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                    <HiOutlineDocumentText size={48} style={{ margin: '0 auto 12px' }} />
                    <p>No report cards found. Generate one to get started.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {reportCards.map(rc => (
                        <div key={rc._id} style={{
                            border: '1px solid #e5e7eb', borderRadius: 8, padding: 14,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>
                                    {rc.studentName || rc.student?.name || 'Student'}
                                </div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>
                                    {rc.className || rc.class?.name} — Semester {rc.semester} — {rc.template}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                    padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                    background: `${STATUS_COLORS[rc.status]}15`,
                                    color: STATUS_COLORS[rc.status] || '#6b7280'
                                }}>
                                    {rc.status}
                                </span>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => {
                                    setViewingId(rc._id);
                                    setCommentForm({
                                        teacherComment: rc.teacherComment || '',
                                        principalComment: rc.principalComment || ''
                                    });
                                }} title="View & Edit">
                                    <HiOutlineEye size={14} />
                                </button>
                                {rc.status === 'generated' && (
                                    <button className="btn btn-outline-primary btn-sm" onClick={() => handlePublish(rc._id)} title="Publish">
                                        <HiOutlinePaperAirplane size={14} />
                                    </button>
                                )}
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => handlePrint(rc._id)} title="Print/PDF">
                                    <HiOutlinePrinter size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Generate Single Modal */}
            {showGenerate && (
                <div className="modal-overlay" onClick={() => setShowGenerate(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3>Generate Report Card</h3>
                            <button className="modal-close-btn" onClick={() => setShowGenerate(false)}>&times;</button>
                        </div>
                        <div className="form-group">
                            <label>Student ID</label>
                            <input type="text" value={generateForm.studentId}
                                onChange={e => setGenerateForm(p => ({ ...p, studentId: e.target.value }))}
                                placeholder="Enter student ID" />
                        </div>
                        <div className="form-group">
                            <label>Class ID</label>
                            <input type="text" value={generateForm.classId}
                                onChange={e => setGenerateForm(p => ({ ...p, classId: e.target.value }))}
                                placeholder="Enter class ID" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Semester</label>
                                <select value={generateForm.semester}
                                    onChange={e => setGenerateForm(p => ({ ...p, semester: Number(e.target.value) }))}>
                                    <option value={1}>Semester 1</option>
                                    <option value={2}>Semester 2</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Template</label>
                                <select value={generateForm.template}
                                    onChange={e => setGenerateForm(p => ({ ...p, template: e.target.value }))}>
                                    <option value="classic">Classic</option>
                                    <option value="detailed">Detailed</option>
                                    <option value="bilingual">Bilingual</option>
                                    <option value="minimal">Minimal</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={generateForm.includeComments}
                                    onChange={e => setGenerateForm(p => ({ ...p, includeComments: e.target.checked }))} />
                                Include Comments
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={generateForm.includeAttendance}
                                    onChange={e => setGenerateForm(p => ({ ...p, includeAttendance: e.target.checked }))} />
                                Include Attendance
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline-secondary" onClick={() => setShowGenerate(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
                                {generating ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Generate Modal */}
            {showBulk && (
                <div className="modal-overlay" onClick={() => setShowBulk(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3>Bulk Generate Report Cards</h3>
                            <button className="modal-close-btn" onClick={() => { dispatch(clearBulkResult()); setShowBulk(false); }}>&times;</button>
                        </div>
                        <div className="form-group">
                            <label>Class ID</label>
                            <input type="text" value={bulkForm.classId}
                                onChange={e => setBulkForm(p => ({ ...p, classId: e.target.value }))}
                                placeholder="Enter class ID" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Semester</label>
                                <select value={bulkForm.semester}
                                    onChange={e => setBulkForm(p => ({ ...p, semester: Number(e.target.value) }))}>
                                    <option value={1}>Semester 1</option>
                                    <option value={2}>Semester 2</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Template</label>
                                <select value={bulkForm.template}
                                    onChange={e => setBulkForm(p => ({ ...p, template: e.target.value }))}>
                                    <option value="classic">Classic</option>
                                    <option value="detailed">Detailed</option>
                                    <option value="bilingual">Bilingual</option>
                                    <option value="minimal">Minimal</option>
                                </select>
                            </div>
                        </div>
                        {bulkResult && (
                            <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                                <strong>Results:</strong> {bulkResult.generated || 0} generated, {bulkResult.failed || 0} failed
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline-secondary" onClick={() => { dispatch(clearBulkResult()); setShowBulk(false); }}>
                                Close
                            </button>
                            <button className="btn btn-primary" onClick={handleBulkGenerate} disabled={generating}>
                                {generating ? 'Generating...' : 'Generate All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View/Comment Modal */}
            {viewingId && (
                <div className="modal-overlay" onClick={() => { setViewingId(null); dispatch(clearCurrentReportCard()); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h3>Report Card Details</h3>
                            <button className="modal-close-btn" onClick={() => { setViewingId(null); dispatch(clearCurrentReportCard()); }}>&times;</button>
                        </div>
                        <div className="form-group">
                            <label>Teacher Comment</label>
                            <textarea rows={3} value={commentForm.teacherComment}
                                onChange={e => setCommentForm(p => ({ ...p, teacherComment: e.target.value }))}
                                placeholder="Add teacher comment..." />
                        </div>
                        <div className="form-group">
                            <label>Principal Comment</label>
                            <textarea rows={3} value={commentForm.principalComment}
                                onChange={e => setCommentForm(p => ({ ...p, principalComment: e.target.value }))}
                                placeholder="Add principal comment..." />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline-secondary" onClick={() => { setViewingId(null); dispatch(clearCurrentReportCard()); }}>
                                Close
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveComments}>
                                Save Comments
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportCardManagerPage;
