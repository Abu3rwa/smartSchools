import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
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
import { fetchSubjects, selectSubjects } from '../../../../store/slices/subjectSlice';
import { selectUser } from '../../../../store/slices/authSlice';
import { STANDARDS_PAGE_TABS } from '../constants';
import {
    buildStandardFormDataFromStandard,
    createInitialStandardFormData,
    filterStandardsList,
    parseStandardsImportText
} from '../utils/standardsPagePresentation';

const useStandardsPageData = () => {
    const dispatch = useDispatch();
    const standards = useSelector(selectStandards);
    const loading = useSelector(selectStandardsLoading);
    const importResult = useSelector(selectImportResult);
    const subjects = useSelector(selectSubjects);
    const user = useSelector(selectUser);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const [activeTab, setActiveTab] = useState(STANDARDS_PAGE_TABS.list);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSubject, setFilterSubject] = useState('');
    const [filterGrade, setFilterGrade] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [importText, setImportText] = useState('');
    const [importSubjectId, setImportSubjectId] = useState('');
    const [importFileName, setImportFileName] = useState('');
    const [formData, setFormData] = useState(createInitialStandardFormData());

    useEffect(() => {
        dispatch(fetchStandards());
        dispatch(fetchSubjects());
    }, [dispatch]);

    const filteredStandards = filterStandardsList(
        standards,
        searchTerm,
        filterSubject,
        filterGrade
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
        if (!window.confirm('Are you sure you want to delete this standard?')) return;

        const result = await dispatch(deleteStandard(id));
        if (deleteStandard.fulfilled.match(result)) {
            toast.success('Standard deleted successfully');
        } else {
            toast.error(result.payload || 'Failed to delete');
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
                toast.success(`Standard ${editingId ? 'updated' : 'created'} successfully!`);
                handleCloseModal();
                dispatch(fetchStandards());
            } else {
                toast.error(result.payload || 'Failed to save standard');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleImport = async () => {
        if (!importSubjectId) {
            toast.error('Please select a subject for the import');
            return;
        }
        if (!importText.trim()) {
            toast.error('Please paste standard data to import');
            return;
        }

        try {
            const parsed = parseStandardsImportText(importText.trim(), filterGrade, importSubjectId);

            if (parsed.length === 0) {
                toast.error('No valid rows found. Format: Code, Name, Description, Grade, Category');
                return;
            }

            const result = await dispatch(importStandards(parsed));
            if (importStandards.fulfilled.match(result)) {
                toast.success(result.payload.message);
                dispatch(fetchStandards());
                setImportText('');
                setImportFileName('');
            } else {
                toast.error(result.payload || 'Import failed');
            }
        } catch {
            toast.error('Failed to parse import data');
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
            toast.error('Failed to read file');
        };
        reader.readAsText(file);
    };

    return {
        activeTab,
        setActiveTab,
        searchTerm,
        setSearchTerm,
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
        subjects,
        isAdmin,
        filteredStandards,
        handleOpenCreateModal,
        handleCloseModal,
        handleEdit,
        handleDelete,
        handleSubmit,
        handleImport,
        handleImportFile
    };
};

export default useStandardsPageData;
