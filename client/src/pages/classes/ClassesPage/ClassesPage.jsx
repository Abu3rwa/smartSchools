import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchClasses, selectClasses, selectClassesLoading, selectClassesError, createClass, updateClass, deleteClass } from '../../../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectIsAdmin } from '../../../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineUserGroup, HiOutlineBookOpen, HiOutlineAcademicCap, HiOutlineTrash, HiOutlineUpload, HiOutlineDownload } from 'react-icons/hi';
import toast from 'react-hot-toast';
import classService from '../../../services/classService';
import importTemplateService from '../../../services/importTemplateService';
import { parseCsvFile } from '../../../utils/csvImport';
import TablePagination from '../../../components/common/TablePagination';
import './ClassesPage.css';

const DEFAULT_PAGE_SIZE = 10;

const ClassesPage = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['classes', 'common']);
    const classes = useSelector(selectClasses);
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
    const [formData, setFormData] = useState({
        grade: '',
        section: '',
        academicYear: academicYear,
        room: '',
        capacity: 40,
        department: ''
    });

    useEffect(() => {
        dispatch(fetchClasses({ academicYear, limit: 0 }));
        dispatch(fetchDepartments());
    }, [dispatch, academicYear]);

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

    const filteredClasses = useMemo(() => (
        classes.filter((cls) =>
            cls.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cls.grade?.toString().includes(searchTerm)
        )
    ), [classes, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(filteredClasses.length / pageSize));
    const paginatedClasses = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredClasses.slice(startIndex, startIndex + pageSize);
    }, [filteredClasses, currentPage, pageSize]);

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
        } else {
            toast.error(result.payload || t('classes:toast.toggleFailed'));
        }
    };

    const handleDeleteClass = async (cls) => {
        const deleteChoice = window.prompt(
            t('classes:confirm.deleteModePrompt', {
                defaultValue:
                    'Choose delete option for {{className}}:\n1 = Delete class only (keep students and historical data)\n2 = Delete class with students detached and related class data removed\n\nType 1 or 2.',
                className: cls.name
            }),
            '1'
        );

        if (deleteChoice === null) {
            return;
        }

        const normalizedChoice = String(deleteChoice).trim();
        if (normalizedChoice !== '1' && normalizedChoice !== '2') {
            toast.error(
                t('classes:toast.deleteChoiceInvalid', {
                    defaultValue: 'Invalid choice. Please type 1 or 2.'
                })
            );
            return;
        }

        const deleteMode = normalizedChoice === '2' ? 'with_related_data' : 'class_only';
        const confirmationKey =
            deleteMode === 'with_related_data'
                ? 'classes:confirm.deleteWithData'
                : 'classes:confirm.deleteClassOnly';

        if (!window.confirm(t(confirmationKey, {
            defaultValue:
                deleteMode === 'with_related_data'
                    ? 'Delete {{className}} with related class data and detach enrolled students? This cannot be undone.'
                    : 'Delete {{className}} only? Students and historical data will be kept.',
            className: cls.name
        }))) {
            return;
        }

        const result = await dispatch(deleteClass({ id: cls._id, deleteMode }));
        if (deleteClass.fulfilled.match(result)) {
            toast.success(
                t(
                    deleteMode === 'with_related_data'
                        ? 'classes:toast.deletedWithData'
                        : 'classes:toast.deletedClassOnly',
                    {
                        defaultValue:
                            deleteMode === 'with_related_data'
                                ? 'Class deleted with related data cleanup'
                                : 'Class deleted (class only)'
                    }
                )
            );
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
            toast.success(response?.message || t('classes:toast.imported', { count: imported }));
            if (failed > 0) {
                toast.error(t('classes:toast.importFailedRows', { count: failed }));
            } else if (skipped > 0) {
                toast(t('classes:toast.importSkippedRows', { count: skipped }));
            }
            dispatch(fetchClasses({ academicYear, limit: 0 }));
        } catch (importError) {
            toast.error(importError?.response?.data?.message || t('classes:toast.importFailed'));
        }
    };

    return (
        <div className="classes-page">
            <input
                ref={importInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleClassImportFileChange}
            />
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>{t('classes:page.title')}</h1>
                    <p className="text-muted">{t('classes:page.subtitle')}</p>
                    {templateMeta && (
                        <p className="text-muted" style={{ marginTop: 6, fontSize: '0.82rem' }}>
                            {templateMeta.hasActiveTemplate
                                ? `Sample template ${templateMeta.activeTemplate?.version || 'v1'} updated ${templateMeta.activeTemplate?.updatedAt ? new Date(templateMeta.activeTemplate.updatedAt).toLocaleDateString() : 'N/A'}`
                                : 'Sample template uses fallback from import schema'}
                        </p>
                    )}
                </div>
                {isAdmin && (
                    <div className="header-actions">
                        <button className="btn btn-outline" onClick={handleTriggerImport}>
                            <HiOutlineUpload size={20} />
                            {t('classes:actions.importCsv')}
                        </button>
                        <button className="btn btn-outline" onClick={handleDownloadSample}>
                            <HiOutlineDownload size={20} />
                            Download Sample CSV
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <HiOutlinePlus size={20} />
                            {t('classes:actions.addClass')}
                        </button>
                    </div>
                )}
            </div>

            {/* Search */}
            <div className="search-bar">
                <HiOutlineSearch className="search-icon" />
                <input
                    type="text"
                    placeholder={t('classes:filters.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Classes Table */}
            {loading ? (
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            ) : error ? (
                <div className="error-container">
                    <p className="error-message">{error}</p>
                    <button className="btn btn-primary" onClick={() => dispatch(fetchClasses({ academicYear, limit: 0 }))}>
                        {t('common:actions.retry')}
                    </button>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('classes:table.columns.grade')}</th>
                                <th>{t('classes:table.columns.section')}</th>
                                <th>{t('classes:table.columns.className')}</th>
                                <th>{t('classes:table.columns.department')}</th>
                                <th>{t('classes:table.columns.academicYear')}</th>
                                <th>{t('classes:table.columns.students')}</th>
                                <th>{t('classes:table.columns.subjects')}</th>
                                <th>{t('classes:table.columns.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedClasses.map((cls, index) => (
                                <tr key={cls._id} className="animate-fadeIn" style={{ animationDelay: `${index * 0.05}s` }}>
                                    <td>
                                        <span className="grade-badge">{cls.grade}</span>
                                    </td>
                                    <td>{cls.section || t('classes:table.mainSection')}</td>
                                    <td>
                                        <Link to={`/portal/classes/${cls._id}`} className="class-link">
                                            {cls.name}
                                        </Link>
                                    </td>
                                    <td>{cls.department?.name ?? '—'}</td>
                                    <td>
                                        {cls.academicYear}
                                        {cls.isActive === false && (
                                            <span className="badge badge-secondary" style={{ marginInlineStart: 6 }}>
                                                {t('classes:status.inactive')}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="stat-cell">
                                            <HiOutlineUserGroup />
                                            <span>{cls.studentCount || 0}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="stat-cell">
                                            <HiOutlineBookOpen />
                                            <span>{cls.subjects?.length || 0}</span>
                                        </div>
                                    </td>
                                    <td>
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
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDeleteClass(cls)}
                                                    >
                                                        <HiOutlineTrash size={14} />
                                                        {t('common:actions.delete')}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredClasses.length === 0 && (
                        <div className="empty-state">
                            <HiOutlineAcademicCap size={48} />
                            <h3>{t('classes:empty.title')}</h3>
                            <p>{t('classes:empty.description')}</p>
                            {isAdmin && (
                                <button className="btn btn-primary mt-4" onClick={() => setShowModal(true)}>
                                    <HiOutlinePlus size={20} />
                                    <span>{t('classes:actions.createClass')}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
            <TablePagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={filteredClasses.length}
                totalPages={totalPages}
                onPageChange={(nextPage) => setCurrentPage(Math.max(1, Math.min(nextPage, totalPages)))}
                onPageSizeChange={(nextSize) => {
                    setPageSize(nextSize);
                    setCurrentPage(1);
                }}
            />

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t('classes:modal.createTitle')}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
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
                                            maxLength={2}
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
        </div>
    );
};

export default ClassesPage;
