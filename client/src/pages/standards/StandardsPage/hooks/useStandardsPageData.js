import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    createStandard,
    deleteStandard,
    fetchStandards,
    importStandards,
    selectImportResult,
    selectStandards,
    selectStandardsLoading,
    updateStandard
} from '../../../../store/slices/standardSlice';
import { selectSubjects } from '../../../../store/slices/subjectSlice';
import { selectUser } from '../../../../store/slices/authSlice';
import { STANDARDS_PAGE_TABS } from '../constants';
import {
    buildStandardFormDataFromStandard,
    createInitialStandardFormData,
    filterStandardsList,
    getSubjectsForStandardsFilter,
    parseStandardsImportText
} from '../utils/standardsPagePresentation';
import importTemplateService from '../../../../services/importTemplateService';
import { selectClasses } from '../../../../store/slices/classSlice';

const useStandardsPageData = () => {
    const { t } = useTranslation(['standards']);
    const dispatch = useDispatch();
    const standards = useSelector(selectStandards);
    const loading = useSelector(selectStandardsLoading);
    const importResult = useSelector(selectImportResult);
    const subjects = useSelector(selectSubjects);
    const classes = useSelector(selectClasses);
    const user = useSelector(selectUser);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const isTeacher = user?.role === 'teacher';

    const [activeTab, setActiveTab] = useState(STANDARDS_PAGE_TABS.list);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [filterSubject, setFilterSubject] = useState('');
    const [filterGrade, setFilterGrade] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [importText, setImportText] = useState('');
    const [importSubjectId, setImportSubjectId] = useState('');
    const [importFileName, setImportFileName] = useState('');
    const [formData, setFormData] = useState(createInitialStandardFormData());
    const [templateMeta, setTemplateMeta] = useState(null);

    useEffect(() => {
        dispatch(fetchStandards());
    }, [dispatch]);

    useEffect(() => {
        if (activeTab !== STANDARDS_PAGE_TABS.import || templateMeta) return;

        let mounted = true;
        importTemplateService.getEntityTemplate('standards')
            .then((meta) => {
                if (mounted) setTemplateMeta(meta);
            })
            .catch(() => {
                if (mounted) setTemplateMeta(null);
            });
        return () => {
            mounted = false;
        };
    }, [activeTab, templateMeta]);

    const classOptions = useMemo(() => {
        const list = Array.isArray(classes) ? classes : [];
        return [...list].sort((left, right) => {
            const leftGrade = Number(left?.grade || 0);
            const rightGrade = Number(right?.grade || 0);
            if (leftGrade !== rightGrade) return leftGrade - rightGrade;
            const leftName = String(left?.name || left?.section || '');
            const rightName = String(right?.name || right?.section || '');
            return leftName.localeCompare(rightName);
        });
    }, [classes]);

    const scopedSubjects = useMemo(() => (
        getSubjectsForStandardsFilter({
            classes: classOptions,
            subjects,
            filterClass,
            isTeacher,
            userId: user?._id || user?.id
        })
    ), [classOptions, subjects, filterClass, isTeacher, user?._id, user?.id]);

    useEffect(() => {
        if (!filterSubject) return;
        const isStillAvailable = scopedSubjects.some((subject) => String(subject?._id) === String(filterSubject));
        if (!isStillAvailable) {
            setFilterSubject('');
        }
    }, [filterSubject, scopedSubjects]);

    const filteredStandards = filterStandardsList(
        standards,
        searchTerm,
        filterSubject,
        filterGrade,
        filterClass,
        classOptions,
        {
            isTeacher,
            userId: user?._id || user?.id
        }
    );

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingId(null);
        setFormData(createInitialStandardFormData());
    };

    const handleOpenCreateModal = () => {
        setShowModal(true);
    };

    const handleEdit = (standard) => {
        setEditingId(standard._id);
        setFormData(buildStandardFormDataFromStandard(standard));
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('standards:toasts.confirmDelete'))) return;

        const result = await dispatch(deleteStandard(id));
        if (deleteStandard.fulfilled.match(result)) {
            toast.success(t('standards:toasts.deleted'));
        } else {
            toast.error(result.payload || t('standards:toasts.deleteFailed'));
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            let result;
            if (editingId) {
                result = await dispatch(updateStandard({ id: editingId, data: formData }));
            } else {
                result = await dispatch(createStandard(formData));
            }

            if (createStandard.fulfilled.match(result) || updateStandard.fulfilled.match(result)) {
                toast.success(t(editingId ? 'standards:toasts.updated' : 'standards:toasts.created'));
                handleCloseModal();
                dispatch(fetchStandards());
            } else {
                toast.error(result.payload || t('standards:toasts.saveFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleImport = async () => {
        if (!importSubjectId) {
            toast.error(t('standards:toasts.selectImportSubject'));
            return;
        }
        if (!importText.trim()) {
            toast.error(t('standards:toasts.pasteImportData'));
            return;
        }

        try {
            const parsed = parseStandardsImportText(importText.trim(), filterGrade, importSubjectId);

            if (parsed.length === 0) {
                toast.error(t('standards:toasts.noValidRows'));
                return;
            }

            const result = await dispatch(importStandards(parsed));
            if (importStandards.fulfilled.match(result)) {
                toast.success(result.payload.message);
                dispatch(fetchStandards());
                setImportText('');
                setImportFileName('');
            } else {
                toast.error(result.payload || t('standards:toasts.importFailed'));
            }
        } catch {
            toast.error(t('standards:toasts.parseFailed'));
        }
    };

    const handleImportFile = (file) => {
        if (!file) return;
        setImportFileName(file.name);
        const reader = new FileReader();
        reader.onload = () => {
            setImportText(String(reader.result || ''));
        };
        reader.onerror = () => {
            toast.error(t('standards:toasts.fileReadFailed'));
        };
        reader.readAsText(file);
    };

    const handleDownloadTemplate = async () => {
        try {
            await importTemplateService.downloadEntityTemplate('standards');
        } catch (error) {
            toast.error(error?.response?.data?.message || t('standards:toasts.importFailed'));
        }
    };

    return {
        activeTab,
        setActiveTab,
        searchTerm,
        setSearchTerm,
        filterClass,
        setFilterClass,
        filterSubject,
        setFilterSubject,
        filterGrade,
        setFilterGrade,
        showModal,
        editingId,
        submitting,
        importText,
        setImportText,
        importSubjectId,
        setImportSubjectId,
        importFileName,
        formData,
        setFormData,
        loading,
        importResult,
        templateMeta,
        subjects: scopedSubjects,
        classes: classOptions,
        isAdmin,
        filteredStandards,
        handleOpenCreateModal,
        handleCloseModal,
        handleEdit,
        handleDelete,
        handleSubmit,
        handleImport,
        handleImportFile,
        handleDownloadTemplate
    };
};

export default useStandardsPageData;
