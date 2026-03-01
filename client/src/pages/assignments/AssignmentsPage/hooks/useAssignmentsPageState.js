import { useMemo, useState } from 'react';
import { createDefaultAssignmentForm } from '../constants';
import {
    canCreateAssignmentsForUser,
    getAvailableClasses,
    getAvailableSubjects
} from '../utils/assignmentPresentation';

const useAssignmentsPageState = ({ user, classes, subjects, myClasses }) => {
    const [assignmentTypes, setAssignmentTypes] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [gradingAssignment, setGradingAssignment] = useState(null);
    const [gradeRows, setGradeRows] = useState({});
    const [gradeStudents, setGradeStudents] = useState([]);
    const [form, setForm] = useState(createDefaultAssignmentForm);

    const canCreateAssignments = useMemo(
        () => canCreateAssignmentsForUser(user),
        [user]
    );

    const availableClasses = useMemo(() => {
        return getAvailableClasses({ userRole: user?.role, myClasses, classes });
    }, [classes, myClasses, user?.role]);

    const availableSubjects = useMemo(() => {
        return getAvailableSubjects({
            userRole: user?.role,
            selectedClass,
            myClasses,
            classes,
            subjects
        });
    }, [classes, selectedClass, subjects, user?.role, myClasses]);

    const resetForm = () => setForm(createDefaultAssignmentForm());

    return {
        assignmentTypes,
        setAssignmentTypes,
        assignments,
        setAssignments,
        loading,
        setLoading,
        submitting,
        setSubmitting,
        selectedClass,
        setSelectedClass,
        selectedSubject,
        setSelectedSubject,
        selectedStatus,
        setSelectedStatus,
        gradingAssignment,
        setGradingAssignment,
        gradeRows,
        setGradeRows,
        gradeStudents,
        setGradeStudents,
        form,
        setForm,
        canCreateAssignments,
        availableClasses,
        availableSubjects,
        resetForm
    };
};

export default useAssignmentsPageState;
