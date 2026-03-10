import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    fetchSubjects,
    selectSubjects,
    selectSubjectsLoading,
    selectSubjectsError,
    createSubject,
    updateSubject,
    deleteSubject
} from '../../../store/slices/subjectSlice';
import { selectIsAdmin } from '../../../store/slices/authSlice';
import toast from 'react-hot-toast';
import SubjectsHeader from './components/SubjectsHeader';
import SubjectsFilters from './components/SubjectsFilters';
import SubjectsTable from './components/SubjectsTable';
import SubjectFormModal from './components/SubjectFormModal';
import useSubjectsPageState from './hooks/useSubjectsPageState';
import { createDefaultSubjectForm } from './constants';
import { mapSubjectToFormData } from './utils/subjectPresentation';
import subjectService from '../../../services/subjectService';
import { parseCsvFile } from '../../../utils/csvImport';
import './SubjectsPage.css';

const SubjectsPage = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['subjects']);
    const subjects = useSelector(selectSubjects);
    const loading = useSelector(selectSubjectsLoading);
    const error = useSelector(selectSubjectsError);
    const isAdmin = useSelector(selectIsAdmin);
    const importInputRef = useRef(null);

    const {
        searchTerm,
        setSearchTerm,
        showModal,
        setShowModal,
        editingId,
        setEditingId,
        submitting,
        setSubmitting,
        formData,
        setFormData,
        filteredSubjects,
        resetForm
    } = useSubjectsPageState(subjects);

    useEffect(() => {
        dispatch(fetchSubjects());
    }, [dispatch]);

    if (isAdmin) {
        return <Navigate to="/portal/timetable#subjects" replace />;
    }

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingId(null);
        resetForm();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            let result;
            if (editingId) {
                result = await dispatch(updateSubject({ id: editingId, data: formData }));
            } else {
                result = await dispatch(createSubject(formData));
            }

            if (createSubject.fulfilled.match(result) || updateSubject.fulfilled.match(result)) {
                toast.success(editingId ? t('subjects:toast.updated') : t('subjects:toast.created'));
                handleCloseModal();
            } else {
                toast.error(result.payload || (editingId ? t('subjects:toast.updateFailed') : t('subjects:toast.createFailed')));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (subject) => {
        setEditingId(subject._id);
        setFormData(mapSubjectToFormData(subject));
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('subjects:confirm.delete'))) return;

        const result = await dispatch(deleteSubject(id));
        if (deleteSubject.fulfilled.match(result)) {
            toast.success(t('subjects:toast.deleted'));
        } else {
            toast.error(result.payload || t('subjects:toast.deleteFailed'));
        }
    };

    const handleOpenCreate = () => {
        setEditingId(null);
        setFormData(createDefaultSubjectForm());
        setShowModal(true);
    };

    const handleTriggerImport = () => {
        importInputRef.current?.click();
    };

    const handleImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error(t('subjects:toast.selectCsv'));
            return;
        }

        const { rows, errors } = await parseCsvFile(file, { requiredColumns: ['name', 'code'] });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error(t('subjects:toast.noValidRows'));
            return;
        }

        try {
            const response = await subjectService.importSubjects(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            const skipped = response?.summary?.skippedRows ?? response?.data?.skipped ?? 0;
            toast.success(response?.message || t('subjects:toast.imported', { count: imported }));
            if (failed > 0) {
                toast.error(t('subjects:toast.importFailedRows', { count: failed }));
            } else if (skipped > 0) {
                toast(t('subjects:toast.importSkippedRows', { count: skipped }));
            }
            dispatch(fetchSubjects());
        } catch (importError) {
            toast.error(importError?.response?.data?.message || t('subjects:toast.importFailed'));
        }
    };

    return (
        <div className="subjects-page">
            <input
                ref={importInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleImportFileChange}
            />
            <SubjectsHeader
                isAdmin={isAdmin}
                onCreate={handleOpenCreate}
                onImport={handleTriggerImport}
            />

            <SubjectsFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} />

            <SubjectsTable
                loading={loading}
                error={error}
                subjects={filteredSubjects}
                isAdmin={isAdmin}
                onRetry={() => dispatch(fetchSubjects())}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            <SubjectFormModal
                open={showModal}
                editingId={editingId}
                formData={formData}
                setFormData={setFormData}
                submitting={submitting}
                onClose={handleCloseModal}
                onSubmit={handleSubmit}
            />
        </div>
    );
};

export default SubjectsPage;
