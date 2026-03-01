import { useMemo, useState } from 'react';
import {
    createDefaultAssignments,
    createDefaultAssignmentRow,
    createDefaultTeacherFormData
} from '../constants';
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
    const [assignments, setAssignments] = useState(createDefaultAssignments);

    const filteredTeachers = useMemo(() => {
        return teachers.filter((teacher) => matchesTeacherSearch(teacher, searchTerm));
    }, [teachers, searchTerm]);

    const resetFormData = () => setFormData(createDefaultTeacherFormData());
    const resetAssignments = () => setAssignments(createDefaultAssignments());

    const addAssignmentRow = () => {
        setAssignments((prevAssignments) => [...prevAssignments, createDefaultAssignmentRow()]);
    };

    const removeAssignmentRow = (index) => {
        setAssignments((prevAssignments) => prevAssignments.filter((_, assignmentIndex) => assignmentIndex !== index));
    };

    const updateAssignmentField = (index, field, value) => {
        setAssignments((prevAssignments) => {
            const nextAssignments = [...prevAssignments];
            nextAssignments[index][field] = value;
            return nextAssignments;
        });
    };

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
        assignments,
        setAssignments,
        filteredTeachers,
        resetFormData,
        resetAssignments,
        addAssignmentRow,
        removeAssignmentRow,
        updateAssignmentField
    };
};

export default useTeachersPageState;
