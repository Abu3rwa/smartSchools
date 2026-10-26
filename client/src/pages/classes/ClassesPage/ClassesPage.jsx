import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchClasses, selectClasses, selectClassesPagination, selectClassesLoading, selectClassesError, createClass, updateClass, deleteClass } from '../../../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectIsAdmin } from '../../../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineUserGroup, HiOutlineBookOpen, HiOutlineTrash, HiOutlineUpload, HiOutlineDownload, HiOutlineOfficeBuilding, HiOutlineX } from 'react-icons/hi';
import toast from 'react-hot-toast';
import classService from '../../../services/classService';
import importTemplateService from '../../../services/importTemplateService';
import { parseCsvFile } from '../../../utils/csvImport';
import TablePagination from '../../../components/common/TablePagination';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import './ClassesPage.css';

const DEFAULT_PAGE_SIZE = 10;

const ClassesPage = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['classes', 'common']);
    const classes = useSelector(selectClasses);
    const pagination = useSelector(selectClassesPagination);
    const departments = useSelector(selectDepartments);
    const loading = useSelector(selectClassesLoading);
    const error = useSelector(selectClassesError);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = useSelector(selectIsAdmin);
    const importInputRef = useRef(null);
    const [templateMeta, setTemplateMeta] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteMode, setDeleteMode] = useState('class_only');
    const [deleting, setDeleting] = useState(false);
    const [formData, setFormData] = useState({
        grade: '',
        section: '',
        academicYear: academicYear,
        room: '',
        capacity: 40,
        department: ''
    });

    const debouncedSearchTerm = useDebouncedValue(searchTerm);
    const classQueryParams = useMemo(() => ({
        academicYear,
        page: currentPage,
        limit: pageSize,
        search: debouncedSearchTerm.trim() || undefined
    }), [academicYear, currentPage, pageSize, debouncedSearchTerm]);

    useEffect(() => {
        dispatch(fetchDepartments());
    }, [dispatch]);

    useEffect(() => {
        dispatch(fetchClasses(classQueryParams));
    }, [dispatch, classQueryParams]);

    useEffect(() => {
        let mounted = true;
        importTemplateService.getEntityTemplate('classes')
            .then((meta) => {
                if (mounted) setTemplateMeta(meta);
            })
            .catch(() => {
                if (mounted) setTemplateMeta(null);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const totalItems = Number.isFinite(Number(pagination?.total))
        ? Number(pagination.total)
        : classes.length;
    const totalPages = Math.max(1, Number(pagination?.totalPages ?? pagination?.pages) || 1);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, academicYear]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await dispatch(createClass(formData));
            if (createClass.fulfilled.match(result)) {
                toast.success(t('classes:toast.created'));
                setShowModal(false);
                setFormData({ grade: '', section: '', academicYear, room: '', capacity: 40, department: '' });
                dispatch(fetchClasses(classQueryParams));
            } else {
                toast.error(result.payload || t('classes:toast.createFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleActive = async (cls) => {
        const willActivate = cls.isActive === false;
        if (!window.confirm(t('classes:confirm.toggleActive', { className: cls.name, action: willActivate ? t('classes:actions.activate').toLowerCase() : t('classes:actions.deactivate').toLowerCase() }))) {
            return;
        }

        const result = await dispatch(updateClass({
            id: cls._id,
            data: { isActive: willActivate }
        }));

        if (updateClass.fulfilled.match(result)) {
            toast.success(t('classes:toast.toggled', { state: willActivate ? t('classes:actions.activated') : t('classes:actions.deactivated') }));
            dispatch(fetchClasses(classQueryParams));
        } else {
            toast.error(result.payload || t('classes:toast.toggleFailed'));
        }
    };

    const openDeleteDialog = (cls) => {
        setDeleteTarget(cls);
        setDeleteMode('class_only');
    };

    const closeDeleteDialog = () => {
        if (deleting) return;
        setDeleteTarget(null);
    };

    const confirmDeleteClass = async () => {
        if (!deleteTarget) return;

        setDeleting(true);
        const result = await dispatch(deleteClass({ id: deleteTarget._id, deleteMode }));
        setDeleting(false);

        if (deleteClass.fulfilled.match(result)) {
            toast.success(t(
                deleteMode === 'with_related_data'
                    ? 'classes:toast.deletedWithData'
                    : 'classes:toast.deletedClassOnly'
            ));
            setDeleteTarget(null);
            dispatch(fetchClasses(classQueryParams));
        } else {
            toast.error(result.payload || t('classes:toast.deleteFailed'));
        }
    };

    const handleTriggerImport = () => {
        importInputRef.current?.click();
    };

    const handleDownloadSample = async () => {
        try {
            await importTemplateService.downloadEntityTemplate('classes');
        } catch (error) {
            toast.error(error?.response?.data?.message || t('classes:toast.importFailed'));
        }
    };

    const handleClassImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error(t('classes:toast.selectCsv'));
            return;
        }

        const { rows, errors } = await parseCsvFile(file, {
            requiredColumns: ['grade']
        });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error(t('classes:toast.noValidRows'));
            return;
        }

        try {
            const response = await classService.importClasses(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            const skipped = response?.summary?.skippedRows ?? response?.data?.skipped ?? 0;
            if (imported > 0) {
                toast.success(response?.message || t('classes:toast.imported', { total: imported }));
            }
            if (failed > 0) {
                const issues = response?.errors || response?.data?.errors || [];
                const details = issues.slice(0, 2).map((issue) => (
                    `Row ${issue.row}${issue.field ? ` (${issue.field})` : ''}: ${issue.message}`
                ));
                const failureSummary = t('classes:toast.importFailedRows', { total: failed });
                toast.error(details.length ? `${failureSummary} ${details.join('; ')}` : failureSummary, {
                    duration: 10000
                });
            } else if (skipped > 0) {
                toast(t('classes:toast.importSkippedRows', { total: skipped }));
            }
            dispatch(fetchClasses(classQueryParams));
        } catch (importError) {
            const responseData = importError?.response?.data;
            const issues = responseData?.data?.errors || responseData?.errors || [];
            const details = issues.slice(0, 2).map((issue) => (
                `Row ${issue.row}${issue.field ? ` (${issue.field})` : ''}: ${issue.message}`
            ));
            const message = responseData?.message || t('classes:toast.importFailed');
            toast.error(details.length ? `${message} ${details.join('; ')}` : message, {
                duration: 10000
            });
        }
    };

    const templateNote = templateMeta
        ? (templateMeta.hasActiveTemplate
            ? t('classes:template.active', {
                version: templateMeta.activeTemplate?.version || 'v1',
                date: templateMeta.activeTemplate?.updatedAt
                    ? new Date(templateMeta.activeTemplate.updatedAt).toLocaleDateString()
                    : t('classes:template.unknownDate')
            })
            : t('classes:template.fallback'))
        : null;

    return (
        <div className="classes-page">
            <input
                ref={importInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleClassImportFileChange}
            />
            <div className="page-header classes-hero">
                <div className="classes-hero-text">
                    <h1>{t('classes:page.title')}</h1>
                    <p className="text-muted">{t('classes:page.subtitle')}</p>
                    {templateNote && (
                        <div className="classes-template-pill">
                            <HiOutlineDownload size={14} />
                            <span>{templateNote}</span>
                        </div>
                    )}
                </div>
                {isAdmin && (
                    <div className="header-actions">
                        <button type="button" className="btn btn-ghost" onClick={handleDownloadSample}>
                            <HiOutlineDownload size={18} />
                            {t('classes:actions.downloadSample')}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={handleTriggerImport}>
                            <HiOutlineUpload size={18} />
                            {t('classes:actions.importCsv')}
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <HiOutlinePlus size={18} />
                            {t('classes:actions.addClass')}
                        </button>
                    </div>
                )}
            </div>

            <div className="classes-toolbar">
                <div className="search-bar classes-search">
                    <HiOutlineSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder={t('classes:filters.searchPlaceholder')}
                        aria-label={t('classes:filters.searchAria')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            className="search-clear"
                            onClick={() => setSearchTerm('')}
                            aria-label={t('classes:filters.clearSearch')}
                        >
                            <HiOutlineX size={16} />
                        </button>
                    )}
                </div>
                {searchTerm.trim() && totalItems > 0 && (
                    <span className="classes-result-count">
                        {t('classes:filters.matches', { total: totalItems })}
                    </span>
                )}
            </div>

            {/* Classes Table */}
            {loading ? (
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            ) : error ? (
                <div className="error-container">
                    <p className="error-message">{error}</p>
                    <button className="btn btn-primary" onClick={() => dispatch(fetchClasses(classQueryParams))}>
                        {t('common:actions.retry')}
                    </button>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('classes:table.columns.className')}</th>
                                <th>{t('classes:table.columns.section')}</th>
                                <th>{t('classes:table.columns.department')}</th>
                                <th>{t('classes:table.columns.academicYear')}</th>
                                <th>{t('classes:table.columns.students')}</th>
                                <th>{t('classes:table.columns.subjects')}</th>
                                <th className="classes-th-actions">{t('classes:table.columns.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {classes.map((cls, index) => (
                                <tr key={cls._id} className="animate-fadeIn" style={{ animationDelay: `${index * 0.05}s` }}>
                                    <td>
                                        <div className="class-identity">
                                            <span className="grade-badge">{cls.grade}</span>
                                            <div className="class-identity-text">
                                                <Link to={`/portal/classes/${cls._id}`} className="class-link">
                                                    {cls.name}
                                                </Link>
                                                {cls.room && (
                                                    <span className="class-room">
                                                        <HiOutlineOfficeBuilding size={13} />
                                                        {cls.room}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="class-section">{cls.section || t('classes:table.mainSection')}</span>
                                    </td>
                                    <td>{cls.department?.name ?? '—'}</td>
                                    <td>
                                        <span className="class-year">{cls.academicYear}</span>
                                        {cls.isActive === false && (
                                            <span className="badge badge-secondary class-inactive-badge">
                                                {t('classes:status.inactive')}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="stat-cell">
                                            <HiOutlineUserGroup />
                                            <span>
                                                {cls.studentCount || 0}
                                                {cls.capacity ? ` / ${cls.capacity}` : ''}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="stat-cell">
                                            <HiOutlineBookOpen />
                                            <span>{cls.subjects?.length || 0}</span>
                                        </div>
                                    </td>
                                    <td className="classes-td-actions">
                                        <div className="actions-cell">
                                            <Link to={`/portal/classes/${cls._id}`} className="btn btn-sm btn-ghost">
                                                {t('common:actions.view')}
                                            </Link>
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleToggleActive(cls)}
                                                    >
                                                        {cls.isActive === false ? t('classes:actions.activate') : t('classes:actions.deactivate')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-icon btn-icon-danger"
                                                        onClick={() => openDeleteDialog(cls)}
                                                        title={t('common:actions.delete')}
                                                        aria-label={t('common:actions.delete')}
                                                    >
                                                        <HiOutlineTrash size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {classes.length === 0 && (
                        <div className="empty-state classes-empty-state">
                            <span className="classes-empty-icon">
                                <HiOutlineSearch size={26} />
                            </span>
                            <h3>{searchTerm.trim() ? t('classes:empty.noMatches') : t('classes:empty.title')}</h3>
                            <p>{searchTerm.trim() ? t('classes:empty.noMatchesDescription') : t('classes:empty.description')}</p>
                            {searchTerm.trim() ? (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearchTerm('')}>
                                    {t('classes:filters.clearSearch')}
                                </button>
                            ) : (isAdmin && (
                                <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
                                    <HiOutlinePlus size={20} />
                                    <span>{t('classes:actions.createClass')}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <TablePagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={totalItems}
                totalPages={totalPages}
                onPageChange={(nextPage) => setCurrentPage(Math.max(1, Math.min(nextPage, totalPages)))}
                onPageSizeChange={(nextSize) => {
                    setPageSize(Math.max(Number(nextSize) || DEFAULT_PAGE_SIZE, 1));
                    setCurrentPage(1);
                }}
            />

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t('classes:modal.createTitle')}</h3>
                            <button type="button" className="modal-close" onClick={() => setShowModal(false)} aria-label={t('common:actions.close')}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>{t('classes:form.gradeLevel')}</label>
                                        <select
                                            value={formData.grade}
                                            onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                            required
                                        >
                                            <option value="">{t('classes:form.selectGrade')}</option>
                                            {[...Array(12)].map((_, i) => (
                                                <option key={i + 1} value={i + 1}>{t('classes:form.gradeOption', { grade: i + 1 })}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('classes:form.section')}</label>
                                        <input
                                            type="text"
                                            placeholder={t('classes:form.sectionPlaceholder')}
                                            value={formData.section}
                                            onChange={(e) => setFormData({ ...formData, section: e.target.value.toUpperCase() })}
                                            maxLength={10}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>{t('classes:form.department')}</label>
                                        <select
                                            value={formData.department}
                                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        >
                                            <option value="">{t('classes:form.noDepartment')}</option>
                                            {departments.map((d) => (
                                                <option key={d._id} value={d._id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('classes:form.room')}</label>
                                        <input
                                            type="text"
                                            placeholder={t('classes:form.roomPlaceholder')}
                                            value={formData.room}
                                            onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>{t('classes:form.capacity')}</label>
                                        <input
                                            type="number"
                                            value={formData.capacity}
                                            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                                            min={1}
                                            max={100}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    {t('common:actions.cancel')}
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? t('classes:actions.creating') : t('classes:actions.createClass')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="modal-overlay" onClick={closeDeleteDialog}>
                    <div
                        className="modal classes-delete-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="classes-delete-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h3 id="classes-delete-title">{t('classes:delete.title')}</h3>
                            <button type="button" className="modal-close" onClick={closeDeleteDialog} aria-label={t('common:actions.close')}>
                                &times;
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="classes-delete-target">{deleteTarget.name}</p>
                            <div className="classes-delete-options">
                                <label className={`classes-delete-option${deleteMode === 'class_only' ? ' is-selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="class-delete-mode"
                                        value="class_only"
                                        checked={deleteMode === 'class_only'}
                                        onChange={() => setDeleteMode('class_only')}
                                    />
                                    <span className="classes-delete-option-text">
                                        <strong>{t('classes:delete.classOnlyTitle')}</strong>
                                        <span>{t('classes:confirm.deleteClassOnly')}</span>
                                    </span>
                                </label>
                                <label className={`classes-delete-option classes-delete-option--danger${deleteMode === 'with_related_data' ? ' is-selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="class-delete-mode"
                                        value="with_related_data"
                                        checked={deleteMode === 'with_related_data'}
                                        onChange={() => setDeleteMode('with_related_data')}
                                    />
                                    <span className="classes-delete-option-text">
                                        <strong>{t('classes:delete.withDataTitle')}</strong>
                                        <span>{t('classes:confirm.deleteWithData')}</span>
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={closeDeleteDialog} disabled={deleting}>
                                {t('common:actions.cancel')}
                            </button>
                            <button type="button" className="btn btn-danger" onClick={confirmDeleteClass} disabled={deleting}>
                                {deleting ? t('classes:delete.deleting') : t('classes:delete.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClassesPage;
