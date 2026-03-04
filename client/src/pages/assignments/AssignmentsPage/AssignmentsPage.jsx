import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import assignmentService from '../../../services/assignmentService';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchStudentsByClass, selectClassStudents } from '../../../store/slices/studentSlice';
import { fetchMyClasses, selectMyClasses } from '../../../store/slices/teacherSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectUser } from '../../../store/slices/authSlice';
import AssignmentsHeader from './components/AssignmentsHeader';
import AssignmentsFilters from './components/AssignmentsFilters';
import CreateAssignmentForm from './components/CreateAssignmentForm';
import AssignmentsTable from './components/AssignmentsTable';
import AssignmentGradePanel from './components/AssignmentGradePanel';
import useAssignmentsPageState from './hooks/useAssignmentsPageState';
import { normalizeGradeStudentsFromClassStudents } from './utils/assignmentPresentation';
import './AssignmentsPage.css';

const AssignmentsPage = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const classStudents = useSelector(selectClassStudents);
    const myClasses = useSelector(selectMyClasses);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);

    const {
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
        editingAssignment,
        setEditingAssignment,
        gradeRows,
        setGradeRows,
        gradeStudents,
        setGradeStudents,
        form,
        setForm,
        resetForm,
        canCreateAssignments,
        availableClasses,
        availableSubjects
    } = useAssignmentsPageState({ user, classes, subjects, myClasses });

    const fetchAssignmentTypes = async () => {
        try {
            const response = await assignmentService.getAssignmentTypes();
            const items = response?.data?.items || [];
            setAssignmentTypes(items);
            setForm((prev) => ({
                ...prev,
                assignmentTypeId: prev.assignmentTypeId || items[0]?.id || ''
            }));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load assignment types');
        }
    };

    const fetchAssignments = async () => {
        if (!selectedClass) {
            setAssignments([]);
            return;
        }

        setLoading(true);
        try {
            const response = await assignmentService.getAssignments({
                classId: selectedClass,
                subjectId: selectedSubject || undefined,
                status: selectedStatus === 'all' ? undefined : selectedStatus,
                academicYear
            });
            setAssignments(response?.data?.items || []);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load assignments');
            setAssignments([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchSubjects());
        if (user?.role === 'teacher') dispatch(fetchMyClasses());
        fetchAssignmentTypes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [academicYear, dispatch, user?.role]);

    useEffect(() => {
        if (!selectedClass && availableClasses.length > 0) {
            setSelectedClass(availableClasses[0]._id);
        }
    }, [availableClasses, selectedClass, setSelectedClass]);

    useEffect(() => {
        const subjectIds = availableSubjects.map((subject) => (subject._id || subject).toString());
        if (selectedSubject && !subjectIds.includes(selectedSubject)) {
            setSelectedSubject('');
        }
    }, [availableSubjects, selectedSubject, setSelectedSubject]);

    useEffect(() => {
        fetchAssignments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClass, selectedSubject, selectedStatus, academicYear]);

    const onCreateAssignment = async (event) => {
        event.preventDefault();
        if (!selectedClass || !selectedSubject) {
            toast.error('Select class and subject first');
            return;
        }
        if (!form.assignmentTypeId || !form.title.trim()) {
            toast.error('Assignment type and title are required');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                classId: selectedClass,
                subjectId: selectedSubject,
                assignmentTypeId: form.assignmentTypeId,
                title: form.title.trim(),
                instructions: form.instructions.trim(),
                dueDate: form.dueDate || undefined,
                maxMarks: Number(form.maxMarks || 10),
                publishNow: form.publishNow,
                notifyOnAssign: form.notifyOnAssign,
                notifyOnGrade: form.notifyOnGrade,
                academicYear
            };

            if (editingAssignment?.id) {
                await assignmentService.updateAssignment(editingAssignment.id, payload);
                toast.success('Assignment updated');
            } else {
                await assignmentService.createAssignment(payload);
                toast.success('Assignment created');
            }

            setEditingAssignment(null);
            resetForm();
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || (editingAssignment?.id ? 'Failed to update assignment' : 'Failed to create assignment'));
        } finally {
            setSubmitting(false);
        }
    };

    const onEditAssignment = (assignment) => {
        setEditingAssignment(assignment);
        setForm((prev) => ({
            ...prev,
            assignmentTypeId: assignment.assignmentType?.id || prev.assignmentTypeId,
            title: assignment.title || '',
            instructions: assignment.instructions || '',
            dueDate: assignment.dueDate ? new Date(assignment.dueDate).toISOString().slice(0, 10) : '',
            maxMarks: assignment.maxMarks || 10,
            publishNow: assignment.status === 'published',
            notifyOnAssign: assignment.notifyOnAssign !== false,
            notifyOnGrade: assignment.notifyOnGrade !== false
        }));
    };

    const onCancelEdit = () => {
        setEditingAssignment(null);
        resetForm();
    };

    const onDeleteAssignment = async (assignment) => {
        const confirmed = window.confirm(
            `Delete "${assignment.title}"?\n\nThis will permanently delete the assignment and all grades entered for it.`
        );
        if (!confirmed) return;

        try {
            const response = await assignmentService.deleteAssignment(assignment.id);
            const deletedGrades = response?.data?.deletedGradesCount || 0;
            toast.success(
                deletedGrades > 0
                    ? `Assignment deleted. ${deletedGrades} linked grade(s) were also deleted.`
                    : 'Assignment deleted'
            );
            if (editingAssignment?.id === assignment.id) {
                onCancelEdit();
            }
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete assignment');
        }
    };

    const onPublishAssignment = async (assignmentId) => {
        try {
            await assignmentService.publishAssignment(assignmentId, { notifyOnAssign: true });
            toast.success('Assignment published');
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to publish assignment');
        }
    };

    const openGradePanel = async (assignment) => {
        setGradingAssignment(assignment);
        setGradeRows({});
        setGradeStudents([]);

        dispatch(fetchStudentsByClass(assignment.class?.id || selectedClass));

        try {
            const response = await assignmentService.getAssignmentGradebook(assignment.id);
            const rows = response?.data?.rows || [];
            const nextRows = {};
            const nextStudents = [];

            rows.forEach((row) => {
                nextStudents.push(row.student);
                nextRows[row.student.id] = {
                    marks: row.grade?.marks ?? '',
                    remarks: row.grade?.remarks || '',
                    maxMarks: row.grade?.maxMarks ?? assignment.maxMarks
                };
            });

            setGradeRows(nextRows);
            setGradeStudents(nextStudents);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load assignment grades');
        }
    };

    const onGradeChange = (studentId, field, value) => {
        setGradeRows((prev) => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [field]: value
            }
        }));
    };

    const onSubmitGrades = async () => {
        if (!gradingAssignment) return;

        const rows = Object.entries(gradeRows)
            .filter(([, row]) => row.marks !== '' && row.marks !== null && row.marks !== undefined)
            .map(([studentId, row]) => ({
                studentId,
                marks: Number(row.marks),
                maxMarks: Number(row.maxMarks || gradingAssignment.maxMarks || 10),
                remarks: String(row.remarks || '').trim()
            }));

        if (rows.length === 0) {
            toast.error('Enter at least one grade');
            return;
        }

        try {
            await assignmentService.gradeAssignment(gradingAssignment.id, {
                rows,
                sendNotifications: true
            });
            toast.success('Grades saved');
            setGradingAssignment(null);
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save grades');
        }
    };

    useEffect(() => {
        if (!gradingAssignment || gradeStudents.length > 0) return;
        if (!Array.isArray(classStudents) || classStudents.length === 0) return;
        setGradeStudents(normalizeGradeStudentsFromClassStudents(classStudents));
    }, [classStudents, gradeStudents.length, gradingAssignment, setGradeStudents]);

    return (
        <div className="assignments-page">
            <AssignmentsHeader />

            <AssignmentsFilters
                selectedClass={selectedClass}
                onClassChange={setSelectedClass}
                selectedSubject={selectedSubject}
                onSubjectChange={setSelectedSubject}
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                availableClasses={availableClasses}
                availableSubjects={availableSubjects}
            />

            <CreateAssignmentForm
                open={canCreateAssignments}
                submitting={submitting}
                form={form}
                setForm={setForm}
                assignmentTypes={assignmentTypes}
                isEditing={Boolean(editingAssignment)}
                onCancelEdit={onCancelEdit}
                onSubmit={onCreateAssignment}
            />

            <AssignmentsTable
                loading={loading}
                assignments={assignments}
                canCreateAssignments={canCreateAssignments}
                onPublishAssignment={onPublishAssignment}
                onOpenGradePanel={openGradePanel}
                onEditAssignment={onEditAssignment}
                onDeleteAssignment={onDeleteAssignment}
            />

            <AssignmentGradePanel
                gradingAssignment={gradingAssignment}
                gradeStudents={gradeStudents}
                gradeRows={gradeRows}
                onGradeChange={onGradeChange}
                onClose={() => setGradingAssignment(null)}
                onSubmitGrades={onSubmitGrades}
            />
        </div>
    );
};

export default AssignmentsPage;
