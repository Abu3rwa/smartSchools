import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlinePlus,
    HiOutlineDocumentText,
    HiOutlineTrash,
    HiOutlineEye,
    HiOutlineArrowPath
} from 'react-icons/hi2';
import {
    fetchWorksheets,
    deleteWorksheet,
    selectWorksheets,
    selectWorksheetLoading,
    selectWorksheetPagination,
    selectWorksheetError
} from '../../../store/slices/worksheetSlice';
import './WorksheetListPage.css';

const STATUS_COLORS = {
    draft: '#ff9800',
    processing: '#2196f3',
    review: '#9c27b0',
    published: '#4caf50',
    archived: '#9e9e9e'
};

const WorksheetListPage = () => {
    const { t } = useTranslation(['worksheet', 'common']);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const worksheets = useSelector(selectWorksheets);
    const loading = useSelector(selectWorksheetLoading);
    const pagination = useSelector(selectWorksheetPagination);
    const error = useSelector(selectWorksheetError);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');

    useEffect(() => {
        dispatch(fetchWorksheets({ page, status: statusFilter || undefined, limit: 20 }));
    }, [dispatch, page, statusFilter]);

    const handleDelete = useCallback(async (id, title) => {
        if (!window.confirm(`Delete "${title}"?`)) return;
        const res = await dispatch(deleteWorksheet(id));
        if (!res.error) {
            toast.success(t('worksheet:notifications.deleted'));
        } else {
            toast.error(res.payload || t('worksheet:errors.loadFailed'));
        }
    }, [dispatch, t]);

    const statusLabel = (status) => t(`worksheet:worksheetList.status${status.charAt(0).toUpperCase() + status.slice(1)}`);

    return (
        <div className="worksheet-list-page">
            <div className="worksheet-list-header">
                <div className="worksheet-list-header-left">
                    <HiOutlineDocumentText size={28} />
                    <h1>{t('worksheet:worksheetList.title')}</h1>
                </div>
                <button
                    className="worksheet-btn-primary"
                    onClick={() => navigate('/portal/worksheets/new')}
                >
                    <HiOutlinePlus size={18} />
                    {t('worksheet:actions.create')}
                </button>
            </div>

            <div className="worksheet-list-filters">
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="worksheet-filter-select"
                >
                    <option value="">{t('common:all', 'All')}</option>
                    <option value="draft">{t('worksheet:worksheetList.statusDraft')}</option>
                    <option value="processing">{t('worksheet:worksheetList.statusProcessing')}</option>
                    <option value="review">{t('worksheet:worksheetList.statusReview')}</option>
                    <option value="published">{t('worksheet:worksheetList.statusPublished')}</option>
                    <option value="archived">{t('worksheet:worksheetList.statusArchived')}</option>
                </select>
            </div>

            {loading && <div className="worksheet-loading"><HiOutlineArrowPath className="spinning" size={24} /> {t('common:loading', 'Loading...')}</div>}
            {error && <div className="worksheet-error">{error}</div>}

            {!loading && worksheets.length === 0 && (
                <div className="worksheet-empty">
                    <HiOutlineDocumentText size={48} />
                    <p>{t('worksheet:worksheetList.empty')}</p>
                </div>
            )}

            <div className="worksheet-grid">
                {worksheets.map((ws) => (
                    <div key={ws._id} className="worksheet-card" onClick={() => navigate(`/portal/worksheets/${ws._id}`)}>
                        <div className="worksheet-card-header">
                            <h3>{ws.title}</h3>
                            <span
                                className="worksheet-status-badge"
                                style={{ backgroundColor: STATUS_COLORS[ws.status] || '#9e9e9e' }}
                            >
                                {statusLabel(ws.status)}
                            </span>
                        </div>
                        <div className="worksheet-card-meta">
                            <span>{ws.class?.name || ''}</span>
                            <span>{ws.subject?.name || ''}</span>
                        </div>
                        <div className="worksheet-card-stats">
                            <span>{t('worksheet:worksheetList.submissions', { count: ws.submissionCount || 0 })}</span>
                            <span>{t('worksheet:worksheetList.marked', { count: ws.markedCount || 0 })}</span>
                        </div>
                        <div className="worksheet-card-actions">
                            <button className="worksheet-icon-btn" title={t('common:view', 'View')} onClick={(e) => { e.stopPropagation(); navigate(`/portal/worksheets/${ws._id}`); }}>
                                <HiOutlineEye size={18} />
                            </button>
                            <button className="worksheet-icon-btn danger" title={t('worksheet:actions.delete')} onClick={(e) => { e.stopPropagation(); handleDelete(ws._id, ws.title); }}>
                                <HiOutlineTrash size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {pagination && pagination.pages > 1 && (
                <div className="worksheet-pagination">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common:previous', 'Previous')}</button>
                    <span>{page} / {pagination.pages}</span>
                    <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>{t('common:next', 'Next')}</button>
                </div>
            )}
        </div>
    );
};

export default WorksheetListPage;
