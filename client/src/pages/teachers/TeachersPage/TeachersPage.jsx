import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    fetchTeachers,
    selectTeachers,
    selectTeachersLoading,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    assignMultipleClassesToTeacher
} from '../../../store/slices/teacherSlice';
import { fetchSubjects, selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import { selectIsAdmin, selectUser } from '../../../store/slices/authSlice';
import toast from 'react-hot-toast';
import TeachersHeader from './components/TeachersHeader';
import TeachersFilters from './components/TeachersFilters';
import TeachersTable from './components/TeachersTable';
import TeacherFormModal from './components/TeacherFormModal';
import TeacherAssignmentsModal from './components/TeacherAssignmentsModal';
import useTeachersPageState from './hooks/useTeachersPageState';
import { mapTeacherToFormData } from './utils/teacherPresentation';
import teacherService from '../../../services/teacherService';
import { parseCsvFile } from '../../../utils/csvImport';
import './TeachersPage.css';

const TeachersPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const teachers = useSelector(selectTeachers);
    const subjects = useSelector(selectSubjects);
    const classes = useSelector(selectClasses);
    const departments = useSelector(selectDepartments);
    const loading = useSelector(selectTeachersLoading);
    const isAdmin = useSelector(selectIsAdmin);
    const user = useSelector(selectUser);
    const canManageTeachers = isAdmin || user?.role === 'department_principal';
    const importInputRef = useRef(null);

    const {
        searchTerm,
        setSearchTerm,
        showModal,
        setShowModal,
        showEditModal,
        setShowEditModal,
        showAssignModal,
        setShowAssignModal,
        selectedTeacher,
        setSelectedTeacher,
        editingTeacher,
        setEditingTeacher,
        submitting,
        setSubmitting,
        formData,
        setFormData,
        assignments,
        filteredTeachers,
        resetFormData,
        resetAssignments,
        addAssignmentRow,
        removeAssignmentRow,
        updateAssignmentField
    } = useTeachersPageState(teachers);

    useEffect(() => {
        dispatch(fetchTeachers());
        dispatch(fetchSubjects());
        dispatch(fetchClasses());
        dispatch(fetchDepartments());
    }, [dispatch]);

    const handleCreateTeacher = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            const result = await dispatch(createTeacher({
                ...formData,
                department: formData.department || null
            }));
            if (createTeacher.fulfilled.match(result)) {
                toast.success('Teacher created successfully!');
                setShowModal(false);
                resetFormData();
            } else {
                toast.error(result.payload || 'Failed to create teacher');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditTeacher = (teacher) => {
        setEditingTeacher(teacher);
        setFormData(mapTeacherToFormData(teacher));
        setShowEditModal(true);
    };

    const handleUpdateTeacher = async (event) => {
        event.preventDefault();
        if (!editingTeacher?._id) return;

        setSubmitting(true);
        try {
            const result = await dispatch(updateTeacher({
                id: editingTeacher._id,
                teacherData: { ...formData, department: formData.department || null }
            }));

            if (updateTeacher.fulfilled.match(result)) {
                toast.success('Teacher updated successfully!');
                setShowEditModal(false);
                setEditingTeacher(null);
                resetFormData();
            } else {
                toast.error(result.payload || 'Failed to update teacher');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTeacher = async (teacher) => {
        if (!window.confirm(`Are you sure you want to delete ${teacher.user?.firstName} ${teacher.user?.lastName}?`)) {
            return;
        }

        try {
            const result = await dispatch(deleteTeacher(teacher._id));
            if (deleteTeacher.fulfilled.match(result)) {
                toast.success('Teacher deleted successfully!');
            } else {
                toast.error(result.payload || 'Failed to delete teacher');
            }
        } catch (error) {
            toast.error('Failed to delete teacher');
        }
    };

    const handleOpenAssignModal = (teacher) => {
        setSelectedTeacher(teacher);
        resetAssignments();
        setShowAssignModal(true);
    };

    const handleAssignClasses = async (event) => {
        event.preventDefault();

        const validAssignments = assignments.filter((assignment) => assignment.classId && assignment.subjectId);
        if (validAssignments.length === 0) {
            toast.error('Please select at least one class and subject');
            return;
        }

        if (!selectedTeacher?._id) return;

        setSubmitting(true);
        try {
            const result = await dispatch(assignMultipleClassesToTeacher({
                teacherId: selectedTeacher._id,
                assignments: validAssignments
            }));

            if (assignMultipleClassesToTeacher.fulfilled.match(result)) {
                toast.success('Classes assigned successfully!');
                setShowAssignModal(false);
                setSelectedTeacher(null);
                resetAssignments();
            } else {
                toast.error(result.payload || 'Failed to assign classes');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleTriggerTeacherImport = () => {
        importInputRef.current?.click();
    };

    const handleTeacherImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error('Please select a CSV file');
            return;
        }

        const { rows, errors } = await parseCsvFile(file, {
            requiredColumns: ['firstName', 'lastName', 'email']
        });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error('No valid rows found in CSV');
            return;
        }

        try {
            const response = await teacherService.importTeachers(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            const skipped = response?.summary?.skippedRows ?? response?.data?.skipped ?? 0;
            toast.success(response?.message || `Imported ${imported} teachers`);
            if (failed > 0) {
                toast.error(`${failed} teacher rows failed`);
            } else if (skipped > 0) {
                toast(`${skipped} teacher rows skipped`);
            }
            dispatch(fetchTeachers());
        } catch (importError) {
            const responseData = importError?.response?.data || {};
            const failed = responseData?.summary?.failedRows ?? responseData?.data?.failed ?? 0;
            const skipped = responseData?.summary?.skippedRows ?? responseData?.data?.skipped ?? 0;
            const rowErrors = responseData?.errors || responseData?.data?.errors || [];

            toast.error(responseData?.message || 'Failed to import teachers');

            if (failed > 0 && rowErrors.length > 0) {
                const firstError = rowErrors[0];
                const field = firstError?.field ? `${firstError.field}: ` : '';
                toast.error(`Row ${firstError?.row || '?'} ${field}${firstError?.message || 'Import validation failed'}`);
            } else if (failed === 0 && skipped > 0) {
                toast(`${skipped} teacher rows skipped`);
            }
        }
    };

    return (
        <div className="teachers-page">
            <input
                ref={importInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleTeacherImportFileChange}
            />
            <TeachersHeader
                canManageTeachers={canManageTeachers}
                onCreateTeacher={() => setShowModal(true)}
                onImportTeachers={handleTriggerTeacherImport}
            />

            <TeachersFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
            />

            <TeachersTable
                loading={loading}
                teachers={filteredTeachers}
                canManageTeachers={canManageTeachers}
                onView={(teacher) => navigate(`/portal/teachers/${teacher._id}`)}
                onEdit={handleEditTeacher}
                onAssign={handleOpenAssignModal}
                onDelete={handleDeleteTeacher}
            />

            <TeacherFormModal
                open={showModal}
                mode="create"
                formData={formData}
                setFormData={setFormData}
                departments={departments}
                subjects={subjects}
                submitting={submitting}
                onClose={() => setShowModal(false)}
                onSubmit={handleCreateTeacher}
            />

            <TeacherFormModal
                open={showEditModal && !!editingTeacher}
                mode="edit"
                formData={formData}
                setFormData={setFormData}
                departments={departments}
                subjects={subjects}
                submitting={submitting}
                onClose={() => setShowEditModal(false)}
                onSubmit={handleUpdateTeacher}
            />

            <TeacherAssignmentsModal
                open={showAssignModal && !!selectedTeacher}
                selectedTeacher={selectedTeacher}
                assignments={assignments}
                classes={classes}
                subjects={subjects}
                submitting={submitting}
                onClose={() => setShowAssignModal(false)}
                onSubmit={handleAssignClasses}
                onAddAssignmentRow={addAssignmentRow}
                onRemoveAssignmentRow={removeAssignmentRow}
                onAssignmentChange={updateAssignmentField}
            />
        </div>
    );
};

export default TeachersPage;
