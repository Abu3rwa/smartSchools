import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { HiOutlineCheckCircle, HiOutlineClipboardList, HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import assignmentService from '../services/assignmentService';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { fetchStudentsByClass, selectClassStudents } from '../store/slices/studentSlice';
import { fetchMyClasses, selectMyClasses } from '../store/slices/teacherSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { selectUser } from '../store/slices/authSlice';
import './AssignmentsPage.css';

const STATUS_OPTIONS = ['all', 'draft', 'published', 'closed', 'archived'];

const AssignmentsPage = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const classStudents = useSelector(selectClassStudents);
    const myClasses = useSelector(selectMyClasses);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);

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

    const [form, setForm] = useState({
        assignmentTypeId: '',
        title: '',
        instructions: '',
        dueDate: '',
        maxMarks: 10,
        publishNow: false,
        notifyOnAssign: true,
        notifyOnGrade: true
    });

    const canCreateAssignments = useMemo(() => {
        if (!user) return false;
        if (user.role === 'admin' || user.role === 'teacher') return true;
        return Array.isArray(user.permissions) && user.permissions.includes('create_assignments');
    }, [user]);

    const availableClasses = useMemo(() => {
        if (user?.role === 'teacher' && Array.isArray(myClasses) && myClasses.length > 0) {
            return myClasses.map((item) => item.class).filter(Boolean);
        }
        return classes;
    }, [classes, myClasses, user?.role]);

    const availableSubjects = useMemo(() => {
        if (!selectedClass) return subjects;
        const classDoc = classes.find((item) => item._id === selectedClass);
        if (!classDoc?.subjects) return subjects;
        return classDoc.subjects.map((item) => item.subject).filter(Boolean);
    }, [classes, selectedClass, subjects]);

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
    }, [academicYear, dispatch, user?.role]);

    useEffect(() => {
        if (!selectedClass && availableClasses.length > 0) {
            setSelectedClass(availableClasses[0]._id);
        }
    }, [availableClasses, selectedClass]);

    useEffect(() => {
        fetchAssignments();
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
            await assignmentService.createAssignment({
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
            });

            toast.success('Assignment created');
            setForm((prev) => ({
                ...prev,
                title: '',
                instructions: '',
                dueDate: '',
                publishNow: false
            }));
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create assignment');
        } finally {
            setSubmitting(false);
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
        setGradeStudents(classStudents.map((student) => ({
            id: student._id,
            studentId: student.studentId || '',
            firstName: student.firstName || '',
            lastName: student.lastName || '',
            fullName: `${student.firstName || ''} ${student.lastName || ''}`.trim()
        })));
    }, [classStudents, gradeStudents.length, gradingAssignment]);

    return (
        <div className="assignments-page">
            <div className="page-header">
                <div>
                    <h1>Assignments</h1>
                    <p className="text-muted">Assignment-first workflow for all new grades</p>
                </div>
            </div>

            <div className="filters card">
                <div className="filters-grid">
                    <div className="form-group">
                        <label>Class</label>
                        <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                            <option value="">Select class</option>
                            {availableClasses.map((item) => (
                                <option key={item._id} value={item._id}>{item.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Subject</label>
                        <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
                            <option value="">All subjects</option>
                            {availableSubjects.map((item) => (
                                <option key={item._id} value={item._id}>{item.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Status</label>
                        <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                            {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {canCreateAssignments && (
                <form className="create-form card" onSubmit={onCreateAssignment}>
                    <div className="card-header">
                        <h3 className="card-title">
                            <HiOutlinePlus />
                            Create Assignment
                        </h3>
                    </div>

                    <div className="create-grid">
                        <div className="form-group">
                            <label>Type</label>
                            <select
                                value={form.assignmentTypeId}
                                onChange={(e) => setForm((prev) => ({ ...prev, assignmentTypeId: e.target.value }))}
                            >
                                {assignmentTypes.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Title</label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                                placeholder="Assignment title"
                            />
                        </div>
                        <div className="form-group">
                            <label>Due Date</label>
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Max Marks</label>
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={form.maxMarks}
                                onChange={(e) => setForm((prev) => ({ ...prev, maxMarks: e.target.value }))}
                            />
                        </div>
                        <div className="form-group full">
                            <label>Instructions</label>
                            <textarea
                                rows={3}
                                value={form.instructions}
                                onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                                placeholder="Assignment instructions"
                            />
                        </div>
                    </div>

                    <div className="create-options">
                        <label><input type="checkbox" checked={form.publishNow} onChange={(e) => setForm((prev) => ({ ...prev, publishNow: e.target.checked }))} /> Publish now</label>
                        <label><input type="checkbox" checked={form.notifyOnAssign} onChange={(e) => setForm((prev) => ({ ...prev, notifyOnAssign: e.target.checked }))} /> Notify on assign</label>
                        <label><input type="checkbox" checked={form.notifyOnGrade} onChange={(e) => setForm((prev) => ({ ...prev, notifyOnGrade: e.target.checked }))} /> Notify on grade</label>
                    </div>

                    <div className="card-footer">
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            <HiOutlineUpload />
                            {submitting ? 'Saving...' : 'Create Assignment'}
                        </button>
                    </div>
                </form>
            )}

            <div className="card assignments-list">
                <div className="card-header">
                    <h3 className="card-title">
                        <HiOutlineClipboardList />
                        Assignments
                    </h3>
                </div>

                {loading ? (
                    <div className="loading-state">Loading assignments...</div>
                ) : assignments.length === 0 ? (
                    <div className="empty-state">No assignments found for current filters.</div>
                ) : (
                    <div className="table-container">
                        <table className="assignment-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Due</th>
                                    <th>Max</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assignments.map((assignment) => (
                                    <tr key={assignment.id}>
                                        <td>{assignment.title}</td>
                                        <td>{assignment.assignmentType?.name || assignment.assignmentType?.key || '-'}</td>
                                        <td><span className={`status-badge ${assignment.status}`}>{assignment.status}</span></td>
                                        <td>{assignment.dueDate ? format(new Date(assignment.dueDate), 'yyyy-MM-dd') : '-'}</td>
                                        <td>{assignment.maxMarks}</td>
                                        <td className="action-cell">
                                            {assignment.status === 'draft' && canCreateAssignments && (
                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => onPublishAssignment(assignment.id)}>
                                                    Publish
                                                </button>
                                            )}
                                            {(assignment.status === 'published' || assignment.status === 'closed') && canCreateAssignments && (
                                                <button type="button" className="btn btn-primary btn-sm" onClick={() => openGradePanel(assignment)}>
                                                    Grade
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {gradingAssignment && (
                <div className="grade-panel card">
                    <div className="card-header">
                        <h3 className="card-title">Grade: {gradingAssignment.title}</h3>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setGradingAssignment(null)}>Close</button>
                    </div>

                    <div className="table-container">
                        <table className="assignment-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Marks</th>
                                    <th>Remarks</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gradeStudents.map((student) => (
                                    <tr key={student.id}>
                                        <td>{student.fullName || `${student.firstName} ${student.lastName}`}</td>
                                        <td>
                                            <input
                                                type="number"
                                                min={0}
                                                max={gradingAssignment.maxMarks}
                                                value={gradeRows[student.id]?.marks ?? ''}
                                                onChange={(e) => onGradeChange(student.id, 'marks', e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                value={gradeRows[student.id]?.remarks ?? ''}
                                                onChange={(e) => onGradeChange(student.id, 'remarks', e.target.value)}
                                                placeholder="Optional"
                                            />
                                        </td>
                                        <td>
                                            {gradeRows[student.id]?.marks !== '' && gradeRows[student.id]?.marks !== undefined && (
                                                <HiOutlineCheckCircle className="status-icon success" />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="card-footer">
                        <button type="button" className="btn btn-primary" onClick={onSubmitGrades}>
                            Save Assignment Grades
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AssignmentsPage;
