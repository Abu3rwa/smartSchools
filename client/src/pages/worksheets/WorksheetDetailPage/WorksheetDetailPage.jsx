import { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlineArrowLeft,
    HiOutlineCloudArrowUp,
    HiOutlineCpuChip,
    HiOutlineCheckCircle,
    HiOutlinePencilSquare,
    HiOutlineArrowPath,
    HiOutlineBookOpen,
    HiOutlineDocumentArrowDown,
    HiOutlineTrash,
    HiOutlineDocumentArrowUp
} from 'react-icons/hi2';
import {
    fetchWorksheet,
    fetchSubmissions,
    uploadSubmission,
    uploadBatchSubmissions,
    processSubmission,
    processAllSubmissions,
    applyOverride,
    publishResults,
    extractAnswerKey,
    deleteSubmission,
    replaceSubmission,
    clearCurrent,
    selectCurrentWorksheet,
    selectSubmissions,
    selectWorksheetLoading,
    selectWorksheetProcessing,
    selectWorksheetUploading,
    selectWorksheetError
} from '../../../store/slices/worksheetSlice';
import { fetchStudentsByClass, selectClassStudents } from '../../../store/slices/studentSlice';
import worksheetService from '../../../services/worksheetService';
import './WorksheetDetailPage.css';

const WorksheetDetailPage = () => {
    const { t } = useTranslation(['worksheet', 'common']);
    const { id } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const worksheet = useSelector(selectCurrentWorksheet);
    const submissions = useSelector(selectSubmissions);
    const loading = useSelector(selectWorksheetLoading);
    const processing = useSelector(selectWorksheetProcessing);
    const uploading = useSelector(selectWorksheetUploading);
    const error = useSelector(selectWorksheetError);
    const classStudents = useSelector(selectClassStudents);

    const [reviewingSubmission, setReviewingSubmission] = useState(null);
    const [overrides, setOverrides] = useState({});
    const singleFileRef = useRef(null);
    const batchFileRef = useRef(null);
    const replaceFileRef = useRef(null);
    const [selectedStudent, setSelectedStudent] = useState('');
    const [replacingSubmissionId, setReplacingSubmissionId] = useState(null);

    useEffect(() => {
        if (id) {
            dispatch(fetchWorksheet(id));
            dispatch(fetchSubmissions(id));
        }
        return () => { dispatch(clearCurrent()); };
    }, [dispatch, id]);

    // Fetch class students when worksheet loads
    useEffect(() => {
        const classId = worksheet?.class?._id || worksheet?.class;
        if (classId) {
            dispatch(fetchStudentsByClass(classId));
        }
    }, [dispatch, worksheet?.class]);

    // ─── Upload handlers ────────────────────────────────────────────────
    const handleSingleUpload = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedStudent) {
            toast.error(t('worksheet:submissions.assignStudentPrompt'));
            return;
        }
        const formData = new FormData();
        formData.append('image', file);
        formData.append('studentId', selectedStudent);
        const res = await dispatch(uploadSubmission({ worksheetId: id, formData }));
        if (!res.error) toast.success(t('worksheet:notifications.submissionsUploaded'));
        else toast.error(res.payload || t('worksheet:errors.uploadFailed'));
        e.target.value = '';
    }, [dispatch, id, selectedStudent, t]);

    const handleBatchUpload = useCallback(async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const formData = new FormData();
        files.forEach(f => formData.append('images', f));
        const res = await dispatch(uploadBatchSubmissions({ worksheetId: id, formData }));
        if (!res.error) toast.success(t('worksheet:notifications.submissionsUploaded'));
        else toast.error(res.payload || t('worksheet:errors.uploadFailed'));
        e.target.value = '';
    }, [dispatch, id, t]);

    // ─── Processing ─────────────────────────────────────────────────────
    const handleProcessOne = useCallback(async (submissionId) => {
        const res = await dispatch(processSubmission({ worksheetId: id, submissionId }));
        if (!res.error) {
            toast.success(t('worksheet:notifications.processingComplete'));
            dispatch(fetchSubmissions(id));
        } else toast.error(res.payload || t('worksheet:errors.processingFailed'));
    }, [dispatch, id, t]);

    const handleProcessAll = useCallback(async () => {
        const res = await dispatch(processAllSubmissions(id));
        if (!res.error) {
            toast.success(t('worksheet:notifications.processingComplete'));
            dispatch(fetchSubmissions(id));
        } else toast.error(res.payload || t('worksheet:errors.processingFailed'));
    }, [dispatch, id, t]);

    // ─── Extract Answer Key ─────────────────────────────────────────────
    const handleExtractKey = useCallback(async () => {
        const res = await dispatch(extractAnswerKey(id));
        if (!res.error) toast.success('Answer key extracted');
        else toast.error(res.payload || 'Extraction failed');
    }, [dispatch, id]);

    // ─── Publish ────────────────────────────────────────────────────────
    const handlePublish = useCallback(async () => {
        const res = await dispatch(publishResults(id));
        if (!res.error) toast.success(t('worksheet:notifications.published'));
        else toast.error(res.payload || 'Publish failed');
    }, [dispatch, id, t]);

    // ─── Gradebook sync ─────────────────────────────────────────────────
    const handleGradebookSync = useCallback(async () => {
        try {
            await worksheetService.syncToGradebook(id);
            toast.success(t('worksheet:notifications.gradebookSynced'));
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Gradebook sync failed');
        }
    }, [id, t]);

    // ─── Delete submission ──────────────────────────────────────────────
    const handleDeleteSubmission = useCallback(async (submissionId) => {
        if (!window.confirm(t('worksheet:submissions.confirmDelete', 'Are you sure you want to delete this submission? This cannot be undone.'))) return;
        const res = await dispatch(deleteSubmission({ worksheetId: id, submissionId }));
        if (!res.error) {
            toast.success(t('worksheet:notifications.submissionDeleted', 'Submission deleted'));
            if (reviewingSubmission?._id === submissionId) setReviewingSubmission(null);
        } else toast.error(res.payload || 'Delete failed');
    }, [dispatch, id, t, reviewingSubmission]);

    // ─── Replace submission ─────────────────────────────────────────────
    const handleReplaceSubmission = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || !replacingSubmissionId) return;
        const formData = new FormData();
        formData.append('image', file);
        const res = await dispatch(replaceSubmission({ worksheetId: id, submissionId: replacingSubmissionId, formData }));
        if (!res.error) {
            toast.success(t('worksheet:notifications.submissionReplaced', 'Submission image replaced — ready to reprocess'));
            setReplacingSubmissionId(null);
            if (reviewingSubmission?._id === replacingSubmissionId) setReviewingSubmission(null);
        } else toast.error(res.payload || 'Replace failed');
        e.target.value = '';
    }, [dispatch, id, replacingSubmissionId, t, reviewingSubmission]);

    // ─── Override ───────────────────────────────────────────────────────
    const handleOverrideChange = (qNum, field, value) => {
        setOverrides(prev => ({
            ...prev,
            [qNum]: { ...prev[qNum], questionNumber: qNum, [field]: value }
        }));
    };

    const handleSaveOverrides = useCallback(async () => {
        const overrideList = Object.values(overrides).filter(o => o.questionNumber);
        if (!overrideList.length || !reviewingSubmission) return;
        const res = await dispatch(applyOverride({ submissionId: reviewingSubmission._id, overrides: overrideList }));
        if (!res.error) {
            toast.success(t('worksheet:notifications.overrideSaved'));
            setOverrides({});
            dispatch(fetchSubmissions(id));
        } else toast.error(res.payload || 'Override failed');
    }, [dispatch, overrides, reviewingSubmission, id, t]);

    // ─── Status helpers ─────────────────────────────────────────────────
    const statusLabel = (status) => t(`worksheet:submissions.status${status.charAt(0).toUpperCase() + status.slice(1)}`);
    const statusColor = { pending: '#ff9800', processing: '#2196f3', marked: '#9c27b0', reviewed: '#4caf50', published: '#2563eb', failed: '#f44336' };

    if (loading && !worksheet) return <div className="worksheet-loading"><HiOutlineArrowPath className="spinning" size={24} /></div>;
    if (!worksheet) return <div className="worksheet-empty">{t('common:notFound', 'Not found')}</div>;

    return (
        <div className="worksheet-detail-page">
            {/* Header */}
            <div className="worksheet-detail-header">
                <button className="worksheet-back-btn" onClick={() => navigate('/portal/worksheets')}>
                    <HiOutlineArrowLeft size={20} />
                    {t('worksheet:actions.back')}
                </button>
                <div className="worksheet-detail-title">
                    <h1>{worksheet.title}</h1>
                    <span className="worksheet-status-badge" style={{ backgroundColor: statusColor[worksheet.status] || '#9e9e9e' }}>
                        {t(`worksheet:worksheetList.status${worksheet.status?.charAt(0).toUpperCase() + worksheet.status?.slice(1)}`)}
                    </span>
                </div>
                <div className="worksheet-detail-meta">
                    <span>{worksheet.class?.name}</span>
                    <span>{worksheet.subject?.name}</span>
                    <span>{worksheet.language?.toUpperCase()}</span>
                    <span>{worksheet.markingMode}</span>
                </div>
            </div>

            {error && <div className="worksheet-error">{error}</div>}

            {/* Action Bar */}
            <div className="worksheet-action-bar">
                {worksheet.answerKeyImage && !worksheet.modelAnswers?.length && (
                    <button className="worksheet-btn-secondary" onClick={handleExtractKey} disabled={processing}>
                        <HiOutlineBookOpen size={18} /> {t('worksheet:actions.extractAnswerKey')}
                    </button>
                )}

                <select
                    className="worksheet-student-select"
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                >
                    <option value="">{t('worksheet:submissions.assignStudentPrompt', 'Select student for this submission')}</option>
                    {(Array.isArray(classStudents) ? classStudents : []).map((s) => (
                        <option key={s._id} value={s._id}>
                            {s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || s._id}
                        </option>
                    ))}
                </select>

                <button className="worksheet-btn-secondary" onClick={() => singleFileRef.current?.click()} disabled={uploading || !selectedStudent}>
                    <HiOutlineCloudArrowUp size={18} /> {t('worksheet:submissions.uploadSingle')}
                </button>
                <input ref={singleFileRef} type="file" accept="image/*,.pdf" hidden onChange={handleSingleUpload} />

                <button className="worksheet-btn-secondary" onClick={() => batchFileRef.current?.click()} disabled={uploading}>
                    <HiOutlineCloudArrowUp size={18} /> {t('worksheet:submissions.uploadBatch')}
                </button>
                <input ref={batchFileRef} type="file" accept="image/*,.pdf" multiple hidden onChange={handleBatchUpload} />
                <input ref={replaceFileRef} type="file" accept="image/*,.pdf" hidden onChange={handleReplaceSubmission} />

                {submissions.some(s => s.status === 'pending') && (
                    <button className="worksheet-btn-primary" onClick={handleProcessAll} disabled={processing}>
                        <HiOutlineCpuChip size={18} /> {processing ? t('worksheet:submissions.statusProcessing') : t('worksheet:actions.processAll')}
                    </button>
                )}

                {worksheet.status !== 'published' && submissions.some(s => ['marked', 'reviewed'].includes(s.status)) && (
                    <button className="worksheet-btn-primary" onClick={handlePublish}>
                        <HiOutlineCheckCircle size={18} /> {t('worksheet:actions.publish')}
                    </button>
                )}

                {worksheet.status === 'published' && (
                    <button className="worksheet-btn-secondary" onClick={handleGradebookSync}>
                        <HiOutlineDocumentArrowDown size={18} /> {t('worksheet:actions.syncGradebook')}
                    </button>
                )}
            </div>

            {/* Submissions table */}
            <div className="worksheet-submissions-section">
                <h2>{t('worksheet:submissions.title')} ({submissions.length})</h2>

                {submissions.length === 0 && <p className="worksheet-empty-text">{t('worksheet:submissions.empty')}</p>}

                <div className="worksheet-submissions-list">
                    {submissions.map(sub => (
                        <div key={sub._id} className="worksheet-submission-row">
                            <div className="submission-student">
                                {sub.student
                                    ? `${sub.student.firstName || ''} ${sub.student.lastName || ''}`
                                    : t('worksheet:submissions.unidentified')
                                }
                            </div>
                            <div className="submission-status">
                                <span style={{ color: statusColor[sub.status] || '#999' }}>{statusLabel(sub.status)}</span>
                            </div>
                            <div className="submission-score">
                                {sub.status !== 'pending' && sub.totalScore != null
                                    ? t('worksheet:submissions.score', { earned: sub.totalScore, total: sub.maxScore, percentage: sub.percentage })
                                    : '—'
                                }
                            </div>
                            <div className="submission-actions">
                                {sub.status === 'pending' && (
                                    <button className="worksheet-icon-btn" title={t('worksheet:actions.process', 'Process')} onClick={() => handleProcessOne(sub._id)} disabled={processing}>
                                        <HiOutlineCpuChip size={16} />
                                    </button>
                                )}
                                {['marked', 'reviewed', 'failed'].includes(sub.status) && (
                                    <button className="worksheet-icon-btn" title={t('worksheet:actions.reprocess', 'Reprocess')} onClick={() => handleProcessOne(sub._id)} disabled={processing}>
                                        <HiOutlineArrowPath size={16} />
                                    </button>
                                )}
                                {['marked', 'reviewed'].includes(sub.status) && (
                                    <button className="worksheet-icon-btn" title={t('worksheet:review.title', 'Review')} onClick={() => { setReviewingSubmission(sub); setOverrides({}); }}>
                                        <HiOutlinePencilSquare size={16} />
                                    </button>
                                )}
                                {sub.status !== 'published' && (
                                    <button
                                        className="worksheet-icon-btn"
                                        title={t('worksheet:actions.replace', 'Replace image')}
                                        disabled={uploading}
                                        onClick={() => { setReplacingSubmissionId(sub._id); replaceFileRef.current?.click(); }}
                                    >
                                        <HiOutlineDocumentArrowUp size={16} />
                                    </button>
                                )}
                                {sub.status !== 'published' && (
                                    <button className="worksheet-icon-btn worksheet-icon-btn-danger" title={t('worksheet:actions.delete', 'Delete')} onClick={() => handleDeleteSubmission(sub._id)}>
                                        <HiOutlineTrash size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Review panel */}
            {reviewingSubmission && (
                <div className="worksheet-review-panel">
                    <div className="worksheet-review-header">
                        <h2>{t('worksheet:review.title')}</h2>
                        <button onClick={() => setReviewingSubmission(null)}>&times;</button>
                    </div>

                    {reviewingSubmission.originalImage && (
                        <div className="worksheet-review-images">
                            <div>
                                <h4>{t('worksheet:review.originalImage')}</h4>
                                <img src={reviewingSubmission.originalImage} alt="Original" className="worksheet-review-img" />
                            </div>
                            {reviewingSubmission.annotatedImage && (
                                <div>
                                    <h4>{t('worksheet:review.annotatedImage')}</h4>
                                    <img src={reviewingSubmission.annotatedImage} alt="Annotated" className="worksheet-review-img" />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="worksheet-questions-list">
                        {(reviewingSubmission.questionResults || []).map(qr => (
                            <div key={qr.questionNumber} className={`worksheet-question-row ${qr.isCorrect ? 'correct' : 'incorrect'}`}>
                                <div className="question-header">
                                    <strong>{t('worksheet:review.question', { number: qr.questionNumber })}</strong>
                                    <span className={`question-badge ${qr.isCorrect ? 'correct' : qr.partialCredit > 0 ? 'partial' : 'incorrect'}`}>
                                        {qr.isCorrect ? t('worksheet:review.correct') : qr.partialCredit > 0 ? t('worksheet:review.partial') : t('worksheet:review.incorrect')}
                                    </span>
                                </div>
                                <div className="question-details">
                                    <div><span className="label">{t('worksheet:review.studentAnswer')}:</span> {qr.studentAnswer || '—'}</div>
                                    <div><span className="label">{t('worksheet:review.correctAnswer')}:</span> {qr.correctAnswer || '—'}</div>
                                    <div><span className="label">{t('worksheet:review.pointsEarned')}:</span> {qr.pointsEarned}/{qr.pointsTotal || 1}</div>
                                    {qr.feedback && <div><span className="label">{t('worksheet:review.feedback')}:</span> {qr.feedback}</div>}
                                    {qr.confidence && <div><span className="label">{t('worksheet:review.confidence')}:</span> {Math.round(qr.confidence * 100)}%</div>}
                                    {qr.override && <div className="override-notice">{t('worksheet:review.overrideApplied')}</div>}
                                </div>
                                <div className="question-override">
                                    <input
                                        type="number"
                                        min={0}
                                        max={qr.pointsTotal || 1}
                                        step={0.5}
                                        placeholder={t('worksheet:review.overridePoints')}
                                        value={overrides[qr.questionNumber]?.pointsEarned ?? ''}
                                        onChange={(e) => handleOverrideChange(qr.questionNumber, 'pointsEarned', parseFloat(e.target.value) || 0)}
                                    />
                                    <input
                                        type="text"
                                        placeholder={t('worksheet:review.overrideReason')}
                                        value={overrides[qr.questionNumber]?.reason ?? ''}
                                        onChange={(e) => handleOverrideChange(qr.questionNumber, 'reason', e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {Object.keys(overrides).length > 0 && (
                        <button className="worksheet-btn-primary" onClick={handleSaveOverrides}>
                            {t('worksheet:actions.saveOverride')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default WorksheetDetailPage;
