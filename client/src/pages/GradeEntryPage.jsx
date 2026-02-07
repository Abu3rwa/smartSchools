import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { fetchStudentsByClass, selectClassStudents } from '../store/slices/studentSlice';
import { bulkAddGrades, selectGradesSubmitting } from '../store/slices/gradeSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { fetchMyClasses, selectMyClasses } from '../store/slices/teacherSlice';
import { selectIsTeacher } from '../store/slices/authSlice';
import { HiOutlineCheckCircle, HiOutlineSave, HiOutlineBell } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './GradeEntryPage.css';

const GradeEntryPage = () => {
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();

    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const classStudents = useSelector(selectClassStudents);
    const submitting = useSelector(selectGradesSubmitting);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isTeacher = useSelector(selectIsTeacher);
    const myClasses = useSelector(selectMyClasses);

    const [selectedClass, setSelectedClass] = useState(searchParams.get('class') || '');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Classwork');
    const [customCategory, setCustomCategory] = useState('');
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [maxMarks, setMaxMarks] = useState(10);
    const [grades, setGrades] = useState({});
    const [sendNotifications, setSendNotifications] = useState(false);

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchSubjects());
        if (isTeacher) {
            dispatch(fetchMyClasses());
        }
    }, [dispatch, academicYear, isTeacher]);

    useEffect(() => {
        if (selectedClass) {
            dispatch(fetchStudentsByClass(selectedClass));
            // Reset grades when class changes
            setGrades({});
        }
    }, [dispatch, selectedClass]);

    // Initialize grades when students load
    useEffect(() => {
        const initialGrades = {};
        classStudents.forEach(student => {
            initialGrades[student._id] = { marks: '', remarks: '' };
        });
        setGrades(initialGrades);
    }, [classStudents]);

    const handleGradeChange = (studentId, field, value) => {
        setGrades(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [field]: value
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Filter out students with no marks entered
        const gradesToSubmit = Object.entries(grades)
            .filter(([_, data]) => data.marks !== '' && data.marks !== null)
            .map(([studentId, data]) => ({
                student: studentId,
                marks: parseFloat(data.marks),
                remarks: data.remarks
            }));

        if (gradesToSubmit.length === 0) {
            toast.error('Please enter at least one grade');
            return;
        }

        const result = await dispatch(bulkAddGrades({
            classId: selectedClass,
            subject: selectedSubject,
            category: selectedCategory === 'Custom' ? customCategory : selectedCategory,
            date: selectedDate,
            maxMarks,
            academicYear,
            grades: gradesToSubmit,
            sendNotifications
        }));

        if (bulkAddGrades.fulfilled.match(result)) {
            toast.success(`${gradesToSubmit.length} grades saved successfully!`);
            // Reset form
            const resetGrades = {};
            classStudents.forEach(student => {
                resetGrades[student._id] = { marks: '', remarks: '' };
            });
            setGrades(resetGrades);
        } else {
            toast.error(result.payload || 'Failed to save grades');
        }
    };

    const availableClasses = isTeacher && myClasses.length > 0
        ? myClasses.map(mc => mc.class)
        : classes;

    const getAvailableSubjects = () => {
        if (!selectedClass) return subjects;
        const selectedClassData = classes.find(c => c._id === selectedClass);
        if (selectedClassData?.subjects) {
            return selectedClassData.subjects.map(s => s.subject).filter(Boolean);
        }
        return subjects;
    };

    return (
        <div className="grade-entry-page">
            <div className="page-header">
                <div>
                    <h1>Grade Entry</h1>
                    <p className="text-muted">Enter daily classwork grades for your students</p>
                </div>
            </div>

            {/* Selection Form */}
            <div className="card selection-card">
                <div className="selection-grid">
                    <div className="form-group">
                        <label>Select Class *</label>
                        <select
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            required
                        >
                            <option value="">Choose a class</option>
                            {availableClasses.map(cls => (
                                <option key={cls._id} value={cls._id}>{cls.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Select Subject *</label>
                        <select
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            required
                            disabled={!selectedClass}
                        >
                            <option value="">Choose a subject</option>
                            {getAvailableSubjects().map(subject => (
                                <option key={subject._id} value={subject._id}>
                                    {subject.name} ({subject.code})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Category *</label>
                        <div className="category-selection">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                required
                            >
                                <option value="Classwork">Classwork</option>
                                <option value="Homework">Homework</option>
                                <option value="Test">Test</option>
                                <option value="Quiz">Quiz</option>
                                <option value="Project">Project</option>
                                <option value="Custom">Custom...</option>
                            </select>
                            {selectedCategory === 'Custom' && (
                                <input
                                    type="text"
                                    placeholder="Enter category name"
                                    value={customCategory}
                                    onChange={(e) => setCustomCategory(e.target.value)}
                                    className="mt-sm"
                                    required
                                />
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={format(new Date(), 'yyyy-MM-dd')}
                        />
                    </div>

                    <div className="form-group">
                        <label>Max Marks</label>
                        <input
                            type="number"
                            value={maxMarks}
                            onChange={(e) => setMaxMarks(parseInt(e.target.value))}
                            min={1}
                            max={100}
                        />
                    </div>
                </div>
            </div>

            {/* Grade Entry Table */}
            {selectedClass && selectedSubject && classStudents.length > 0 && (
                <form onSubmit={handleSubmit}>
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">
                                Enter Grades ({classStudents.length} students)
                            </h3>
                            <div className="header-actions">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={sendNotifications}
                                        onChange={(e) => setSendNotifications(e.target.checked)}
                                    />
                                    <HiOutlineBell />
                                    Send parent notifications
                                </label>
                            </div>
                        </div>

                        <div className="table-container">
                            <table className="grade-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Student</th>
                                        <th>ID</th>
                                        <th>Marks (/{maxMarks})</th>
                                        <th>Remarks</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classStudents.map((student, index) => (
                                        <tr key={student._id}>
                                            <td className="row-number">{index + 1}</td>
                                            <td>
                                                <div className="student-cell">
                                                    <div className="avatar-sm">
                                                        {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                                                    </div>
                                                    <span>{student.firstName} {student.lastName}</span>
                                                </div>
                                            </td>
                                            <td className="text-muted font-mono">{student.studentId}</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    className="marks-input"
                                                    value={grades[student._id]?.marks || ''}
                                                    onChange={(e) => handleGradeChange(student._id, 'marks', e.target.value)}
                                                    min={0}
                                                    max={maxMarks}
                                                    step={0.5}
                                                    placeholder="-"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="remarks-input"
                                                    value={grades[student._id]?.remarks || ''}
                                                    onChange={(e) => handleGradeChange(student._id, 'remarks', e.target.value)}
                                                    placeholder="Optional"
                                                />
                                            </td>
                                            <td>
                                                {grades[student._id]?.marks && (
                                                    <HiOutlineCheckCircle className="status-icon success" size={20} />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="card-footer">
                            <div className="entry-summary">
                                <span>
                                    {Object.values(grades).filter(g => g.marks !== '' && g.marks !== null).length} of {classStudents.length} grades entered
                                </span>
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary btn-lg"
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <>
                                        <span className="spinner" style={{ width: 20, height: 20 }}></span>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <HiOutlineSave size={20} />
                                        Save Grades
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* Empty State */}
            {selectedClass && selectedSubject && classStudents.length === 0 && (
                <div className="empty-state card">
                    <p>No students found in this class</p>
                </div>
            )}

            {(!selectedClass || !selectedSubject) && (
                <div className="empty-state card">
                    <p>Select a class and subject to start entering grades</p>
                </div>
            )}
        </div>
    );
};

export default GradeEntryPage;
