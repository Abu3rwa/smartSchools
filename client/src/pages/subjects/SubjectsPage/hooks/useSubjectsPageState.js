import { useMemo, useState } from 'react';
import { createDefaultSubjectForm } from '../constants';
import { filterSubjects } from '../utils/subjectPresentation';

const useSubjectsPageState = (subjects = []) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState(createDefaultSubjectForm);

    const filteredSubjects = useMemo(() => {
        return filterSubjects(subjects, searchTerm);
    }, [subjects, searchTerm]);

    const resetForm = () => setFormData(createDefaultSubjectForm());

    return {
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
    };
};

export default useSubjectsPageState;
