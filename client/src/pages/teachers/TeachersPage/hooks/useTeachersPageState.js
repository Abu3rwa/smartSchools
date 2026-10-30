import { useMemo, useState } from 'react';
import { createDefaultTeacherFormData } from '../constants';
import { matchesTeacherSearch } from '../utils/teacherPresentation';

const useTeachersPageState = (teachers = []) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [editingTeacher, setEditingTeacher] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState(createDefaultTeacherFormData);

    const filteredTeachers = useMemo(() => {
        return teachers.filter((teacher) => matchesTeacherSearch(teacher, searchTerm));
    }, [teachers, searchTerm]);

    const resetFormData = () => setFormData(createDefaultTeacherFormData());

    return {
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
        filteredTeachers,
        resetFormData
    };
};

export default useTeachersPageState;
