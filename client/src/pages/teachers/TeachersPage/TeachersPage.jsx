import { useEffect } from 'react';
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

    return (
        <div className="teachers-page">
            <TeachersHeader
                canManageTeachers={canManageTeachers}
                onCreateTeacher={() => setShowModal(true)}
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
