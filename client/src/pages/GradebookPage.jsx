import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchClass, selectCurrentClass, selectClassStudents } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { sendDailyClassworkUpdate, selectNotificationSending } from '../store/slices/notificationSlice';
import api from '../config/api';
import DOMPurify from 'dompurify';
import {
    HiOutlineArrowLeft,
    HiOutlinePlus,
    HiOutlineClipboardList,
    HiOutlineBookOpen,
    HiOutlineHome,
    HiOutlinePuzzle,
    HiOutlineQuestionMarkCircle,
    HiOutlineStar,
    HiOutlineDotsHorizontal,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineX,
    HiOutlineDocumentText,
    HiOutlineCalendar,
    HiOutlineMail,
    HiOutlineSparkles
} from 'react-icons/hi';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import './GradebookPage.css';

const MONTHS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
];

const CATEGORY_FILTER_OPTIONS = [
    'Classwork',
    'Homework',
    'Test',
    'Quiz',
    'Project'
];

const GradebookPage = () => {
    const { classId } = useParams();
    const dispatch = useDispatch();
    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const subjects = useSelector(selectSubjects);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const notificationSending = useSelector(selectNotificationSending);

    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [grades, setGrades] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');

    // AI Report State
    const [showAIModal, setShowAIModal] = useState(false);
    const [selectedStudentForAI, setSelectedStudentForAI] = useState(null);
    const [aiReportContent, setAiReportContent] = useState('');
    const [generatingAI, setGeneratingAI] = useState(false);
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [editedReportContent, setEditedReportContent] = useState('');
    // Advanced AI Report State
    const [aiLanguage, setAiLanguage] = useState('english');
    const [aiRecipients, setAiRecipients] = useState({
        mother: true,
        father: true,
        student: false,
        teacher: true
    });
    const [aiSendEmail, setAiSendEmail] = useState(false);

    // Form state for adding grades
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        title: '',
        category: 'Classwork',
        customCategory: '',
        maxMarks: 10,
        studentGrades: {}
    });

    useEffect(() => {
        dispatch(fetchClass(classId));
        dispatch(fetchSubjects());
    }, [dispatch, classId]);

    // Set default subject when class loads
    useEffect(() => {
        if (currentClass?.subjects?.length > 0 && !selectedSubject) {
            setSelectedSubject(currentClass.subjects[0].subject?._id || '');
        }
    }, [currentClass, selectedSubject]);

    // Fetch grades when filters change
    useEffect(() => {
        if (classId && selectedSubject && selectedMonth) {
            fetchGrades();
        }
    }, [classId, selectedSubject, selectedMonth, academicYear]);

    const fetchGrades = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/grades/gradebook/${classId}`, {
                params: {
                    subject: selectedSubject,
                    month: selectedMonth,
                    academicYear
                }
            });
            setGrades(response.data.data.grades || []);
        } catch (error) {
            console.error('Failed to fetch grades:', error);
            setGrades([]);
        } finally {
            setLoading(false);
        }
    };

    const handleAddGrades = async (e) => {
        e.preventDefault();

        const gradesToSubmit = Object.entries(formData.studentGrades)
            .filter(([_, data]) => data.marks !== '' && data.marks !== null)
            .map(([studentId, data]) => ({
                student: studentId,
                marks: parseFloat(data.marks),
                notes: data.notes || ''
            }));

        if (gradesToSubmit.length === 0) {
            toast.error('Please enter at least one grade');
            return;
        }

        try {
            await api.post('/grades/bulk', {
                classId,
                subject: selectedSubject,
                date: formData.date,
                maxMarks: formData.maxMarks,
                title: formData.title,
                category: formData.category === 'Custom' ? formData.customCategory : formData.category,
                academicYear,
                grades: gradesToSubmit
            });

            toast.success(`${gradesToSubmit.length} grades added successfully!`);
            setShowAddModal(false);
            resetForm();
            fetchGrades();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add grades');
        }
    };

    const resetForm = () => {
        const initialGrades = {};
        students.forEach(student => {
            initialGrades[student._id] = { marks: '', notes: '' };
        });
        setFormData({
            date: format(new Date(), 'yyyy-MM-dd'),
            title: '',
            category: 'Classwork',
            customCategory: '',
            maxMarks: 10,
            studentGrades: initialGrades
        });
        // Reset AI state
        setAiReportContent('');
        setAiLanguage('english');
        setAiRecipients({
            mother: true,
            father: true,
            student: false,
            teacher: true
        });
        setAiSendEmail(false);
    };

    const handleGradeChange = (studentId, field, value) => {
        setFormData(prev => ({
            ...prev,
            studentGrades: {
                ...prev.studentGrades,
                [studentId]: {
                    ...prev.studentGrades[studentId],
                    [field]: value
                }
            }
        }));
    };

    // Send daily classwork update to all parents in the class
    const handleSendClassworkUpdate = async () => {
        if (!students.length) {
            toast.error('No students in this class');
            return;
        }

        const confirmed = window.confirm(
            `Send daily classwork update to all ${students.length} students' parents?\n\n` +
            `This will email them a summary of all classwork grades for this month.`
        );

        if (!confirmed) return;

        let successCount = 0;
        let failCount = 0;

        // Calculate the report date based on selected filters
        let reportDate = new Date();
        if (academicYear) {
            const [startYear, endYear] = academicYear.split('-').map(Number);
            const currentMonth = new Date().getMonth() + 1;

            // If selected month is the current month, use today's date to show "up to now"
            // efficiently. BUT if years match.
            // Simplified: Construct the target date.

            let targetYear = (selectedMonth >= 8) ? startYear : endYear;

            // If it's the current real-world month and year, use today.
            if (selectedMonth === currentMonth && targetYear === new Date().getFullYear()) {
                reportDate = new Date();
            } else {
                // Otherwise, use the last day of the selected month
                // new Date(year, monthIndex, 0) gets the last day of the previous month index
                // So new Date(year, selectedMonth, 0) works because selectedMonth is 1-12
                reportDate = new Date(targetYear, selectedMonth, 0);
                reportDate.setHours(23, 59, 59, 999);
            }
        }

        // Iterate and send individually since bulk endpoint was removed
        // We use Promise.all to send them in parallel
        const promises = students.map(student =>
            dispatch(sendDailyClassworkUpdate({
                studentId: student._id,
                date: reportDate.toISOString(),
                subject: selectedSubject || undefined,
                category: selectedCategoryFilter === 'All' ? undefined : selectedCategoryFilter
            })).then(result => {
                if (sendDailyClassworkUpdate.fulfilled.match(result)) successCount++;
                else failCount++;
            })
        );

        await Promise.all(promises);

        if (successCount > 0) {
            toast.success(`✅ Sent updates to ${successCount} parents!${failCount > 0 ? ` (${failCount} failed)` : ''}`);
        } else {
            toast.error('Failed to send notifications');
        }
    };

    // Process grades for dynamic columns (Categories) and calculate averages
    const processGradebookData = () => {
        const categories = new Set();
        const studentData = {};

        // Initialize student data structure
        students.forEach(student => {
            studentData[student._id] = {
                info: student,
                categories: {},
                overallTotal: 0,
                overallCount: 0
            };
        });

        grades.forEach(grade => {
            // Standardize category and format for display/filtering
            let rawCategory = grade.category || grade.gradeType || 'Other';
            // Capitalize first letter for consistency (classwork -> Classwork)
            const category = rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).toLowerCase();

            // Filter based on selection
            if (selectedCategoryFilter !== 'All' && category !== selectedCategoryFilter) {
                return;
            }

            categories.add(category);

            if (studentData[grade.student?._id]) {
                if (!studentData[grade.student._id].categories[category]) {
                    studentData[grade.student._id].categories[category] = { total: 0, count: 0, percentageTotal: 0 };
                }

                // Calculate percentage for this grade (marks / maxMarks * 100)
                const percentage = (grade.marks / grade.maxMarks) * 100;

                studentData[grade.student._id].categories[category].total += grade.marks;
                studentData[grade.student._id].categories[category].count += 1;
                studentData[grade.student._id].categories[category].percentageTotal += percentage;

                studentData[grade.student._id].overallTotal += percentage;
                studentData[grade.student._id].overallCount += 1;
            }
        });

        return {
            categories: Array.from(categories).sort(),
            data: studentData
        };
    };

    const { categories: dynamicCategories, data: processedData } = processGradebookData();

    const getAvailableSubjects = () => {
        if (currentClass?.subjects) {
            return currentClass.subjects.map(s => s.subject).filter(Boolean);
        }
        return subjects;
    };

    return (
        <div className="gradebook-page">
            {/* Back Link */}
            <Link to={`/portal/classes/${classId}`} className="back-link">
                <HiOutlineArrowLeft />
                Back to Class
            </Link>

            {/* Header */}
            <div className="gradebook-header">
                <div>
                    <h1>
                        <HiOutlineBookOpen />
                        Gradebook
                    </h1>
                    <p className="text-muted">{currentClass?.name} • {academicYear}</p>
                </div>
                <div className="header-actions">
                    <div className="category-filter-inline">
                        {/* <label>Category to send</label> */}
                        <select
                            value={selectedCategoryFilter}
                            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                        >
                            <option value="All">All Categories</option>
                            {CATEGORY_FILTER_OPTIONS.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <Link to="/portal/reports/generator" className="btn btn-outline">
                        <HiOutlineSparkles size={20} />
                        Advanced Reports
                    </Link>
                    <button
                        className="btn btn-success"
                        onClick={handleSendClassworkUpdate}
                        disabled={notificationSending || !students.length}
                    >
                        <HiOutlineMail size={20} />
                        {notificationSending ? 'Sending...' : 'Send Reports'}
                    </button>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setShowAddModal(true); }}>
                        <HiOutlinePlus size={20} />
                        Add Grades
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="gradebook-filters">
                <div className="form-group">
                    <label>Subject</label>
                    <select
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                    >
                        <option value="">Select Subject</option>
                        {getAvailableSubjects().map(subject => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>Month</label>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    >
                        {MONTHS.map(month => (
                            <option key={month.value} value={month.value}>
                                {month.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Grades Content */}
            <div className="grades-content">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <div className="card">
                        <div className="table-container">
                            <table className="gradebook-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        {dynamicCategories.map(cat => (
                                            <th key={cat} className="text-center">{cat} (Avg %)</th>
                                        ))}
                                        <th className="text-center">Overall (Avg %)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map(student => {
                                        const sData = processedData[student._id];
                                        const overallAvg = sData.overallCount > 0
                                            ? (sData.overallTotal / sData.overallCount).toFixed(1)
                                            : '-';

                                        return (
                                            <tr key={student._id}>
                                                <td>
                                                    <div className="student-cell" style={{ justifyContent: 'space-between' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div className="avatar-sm">
                                                                {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                                                            </div>
                                                            <span>{student.firstName} {student.lastName}</span>
                                                        </div>
                                                        <button
                                                            className="btn-icon"
                                                            title="Generate Progress Report"
                                                            onClick={() => {
                                                                setSelectedStudentForAI(student);
                                                                setAiReportContent('');
                                                                setShowAIModal(true);
                                                            }}
                                                            style={{ color: '#8b5cf6' }} // Violet color for AI
                                                        >
                                                            <HiOutlineSparkles size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                                {dynamicCategories.map(cat => {
                                                    const catData = sData.categories[cat];
                                                    const avg = catData
                                                        ? (catData.percentageTotal / catData.count).toFixed(1)
                                                        : '-';
                                                    return (
                                                        <td key={cat} className="text-center font-mono">
                                                            {avg}%
                                                        </td>
                                                    );
                                                })}
                                                <td className="text-center font-bold font-mono">
                                                    {overallAvg}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {students.length === 0 && (
                                        <tr>
                                            <td colSpan={dynamicCategories.length + 2} className="empty-row">
                                                No students in this class
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="class-average-row" style={{ fontWeight: 'bold' }}>
                                        <td style={{ padding: '12px' }}>Class Average</td>
                                        {dynamicCategories.map(cat => {
                                            const validStudents = students.filter(s => processedData[s._id]?.categories[cat]);
                                            const total = validStudents.reduce((sum, s) => {
                                                const catData = processedData[s._id].categories[cat];
                                                return sum + (catData.percentageTotal / catData.count);
                                            }, 0);
                                            const avg = validStudents.length > 0 ? (total / validStudents.length).toFixed(1) : '-';

                                            return (
                                                <td key={cat} className="text-center">
                                                    {avg}%
                                                </td>
                                            );
                                        })}
                                        <td className="text-center">
                                            {(() => {
                                                const validStudents = students.filter(s => processedData[s._id]?.overallCount > 0);
                                                const total = validStudents.reduce((sum, s) => {
                                                    const sData = processedData[s._id];
                                                    return sum + (sData.overallTotal / sData.overallCount);
                                                }, 0);
                                                return validStudents.length > 0 ? (total / validStudents.length).toFixed(1) + '%' : '-';
                                            })()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {grades.length === 0 && (
                            <div className="empty-state">
                                <p>No grades found for this month.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add Grades Modal */}
            {
                showAddModal && (
                    <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                        <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>Add Grades</h3>
                                <button className="modal-close" onClick={() => setShowAddModal(false)}>
                                    <HiOutlineX />
                                </button>
                            </div>
                            <form onSubmit={handleAddGrades}>
                                <div className="modal-body">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Date *</label>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                max={format(new Date(), 'yyyy-MM-dd')}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Category *</label>
                                            <select
                                                value={formData.category}
                                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                                required
                                            >
                                                <option value="Classwork">Classwork</option>
                                                <option value="Homework">Homework</option>
                                                <option value="Test">Test</option>
                                                <option value="Quiz">Quiz</option>
                                                <option value="Project">Project</option>
                                                <option value="Custom">Custom...</option>
                                            </select>
                                            {formData.category === 'Custom' && (
                                                <input
                                                    type="text"
                                                    placeholder="Enter category name"
                                                    value={formData.customCategory}
                                                    onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                                                    className="mt-sm"
                                                    required
                                                />
                                            )}
                                        </div>
                                        <div className="form-group">
                                            <label>Max Marks</label>
                                            <input
                                                type="number"
                                                value={formData.maxMarks}
                                                onChange={(e) => setFormData({ ...formData, maxMarks: parseInt(e.target.value) })}
                                                min={1}
                                                max={100}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Title (Optional)</label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="e.g., Chapter 5 Quiz"
                                        />
                                    </div>

                                    <div className="grades-table-container">
                                        <table className="grades-entry-table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Student</th>
                                                    <th>Marks (/{formData.maxMarks})</th>
                                                    <th>Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {students.map((student, index) => (
                                                    <tr key={student._id}>
                                                        <td>{index + 1}</td>
                                                        <td>
                                                            <div className="student-cell">
                                                                <div className="avatar-sm">
                                                                    {student.firstName?.charAt(0)}
                                                                    {student.lastName?.charAt(0)}
                                                                </div>
                                                                <span>{student.firstName} {student.lastName}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="marks-input"
                                                                value={formData.studentGrades[student._id]?.marks || ''}
                                                                onChange={(e) => handleGradeChange(student._id, 'marks', e.target.value)}
                                                                min={0}
                                                                max={formData.maxMarks}
                                                                step={0.5}
                                                                placeholder="-"
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="notes-input"
                                                                value={formData.studentGrades[student._id]?.notes || ''}
                                                                onChange={(e) => handleGradeChange(student._id, 'notes', e.target.value)}
                                                                placeholder="Add note..."
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        Save Grades
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* AI Report Modal */}
            {showAIModal && selectedStudentForAI && (
                <div className="modal-overlay" onClick={() => setShowAIModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: '#f3e8ff', padding: '8px', borderRadius: '50%', color: '#7c3aed' }}>
                                    <HiOutlineSparkles size={24} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0 }}>AIProgress Report</h3>
                                    <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                                        for {selectedStudentForAI.firstName} {selectedStudentForAI.lastName}
                                    </p>
                                </div>
                            </div>
                            <button className="modal-close" onClick={() => setShowAIModal(false)}>
                                <HiOutlineX />
                            </button>
                        </div>
                        <div className="modal-body">
                            {!aiReportContent ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                    <p className="mb-md text-muted">
                                        Generate a personalized progress report based on recent grades, behavior notes, and improvement trends.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            setGeneratingAI(true);
                                            try {
                                                // Calculate period string based on selected month
                                                const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label;
                                                const periodStr = `${monthLabel} ${academicYear.split('-')[1]}`; // e.g. February 2026

                                                // Use advanced report generation
                                                const response = await api.post('/reports/generate-advanced', {
                                                    studentId: selectedStudentForAI._id,
                                                    reportType: 'monthly',
                                                    language: aiLanguage,
                                                    sendEmail: aiSendEmail,
                                                    recipients: aiRecipients
                                                });
                                                
                                                if (response.data.success) {
                                                    setAiReportContent(response.data.data.report);
                                                }
                                            } catch (error) {
                                                console.error(error);
                                                toast.error('Failed to generate report');
                                            } finally {
                                                setGeneratingAI(false);
                                            }
                                        }}
                                        disabled={generatingAI}
                                    >
                                        {generatingAI ? (
                                            <>
                                                <div className="spinner-sm"></div> Generating...
                                            </>
                                        ) : (
                                            <>
                                                <HiOutlineSparkles /> Generate
                                            </>
                                        )}
                                    </button>
                                    {/* Language Selection */}
                                    <div style={{ marginTop: '20px' }}>
                                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>
                                            Report Language
                                        </label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            {['english', 'arabic', 'bilingual'].map(lang => (
                                                <button
                                                    key={lang}
                                                    type="button"
                                                    className={`btn btn-sm ${aiLanguage === lang ? 'btn-primary' : 'btn-outline'}`}
                                                    onClick={() => setAiLanguage(lang)}
                                                    style={{ textTransform: 'capitalize' }}
                                                >
                                                    {lang}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Email Options */}
                                    <div style={{ marginTop: '16px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={aiSendEmail}
                                                onChange={(e) => setAiSendEmail(e.target.checked)}
                                            />
                                            Send report via email after generation
                                        </label>
                                    </div>
                                    {aiSendEmail && (
                                        <div style={{ marginTop: '12px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                                            <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', fontSize: '13px' }}>
                                                Email Recipients
                                            </label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                                {['mother', 'father', 'student', 'teacher'].map(recipient => (
                                                    <label key={recipient} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={aiRecipients[recipient]}
                                                            onChange={(e) => setAiRecipients(prev => ({
                                                                ...prev,
                                                                [recipient]: e.target.checked
                                                            }))}
                                                        />
                                                        <span style={{ textTransform: 'capitalize' }}>{recipient}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="ai-report-preview">
                                    {/* Email Template Preview */}
                                    <div style={{
                                        background: '#ffffff',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        maxHeight: '500px',
                                        overflowY: 'auto'
                                    }}>
                                        {/* Email Header */}
                                        <div style={{
                                            background: 'var(--brand-gradient)',
                                            padding: '20px',
                                            borderRadius: '8px 8px 0 0',
                                            color: 'white',
                                            textAlign: 'center'
                                        }}>
                                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Student Progress Report</h3>
                                        </div>

                                        {/* Email Body */}
                                        <div style={{
                                            padding: '30px',
                                            background: '#ffffff',
                                            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                                            lineHeight: '1.6',
                                            color: '#333'
                                        }}>
                                            <div
                                                contentEditable={isEditingReport}
                                                suppressContentEditableWarning={true}
                                                onBlur={(e) => {
                                                    if (isEditingReport) {
                                                        setEditedReportContent(e.currentTarget.innerHTML);
                                                    }
                                                }}
                                                style={{
                                                    outline: isEditingReport ? '2px solid #667eea' : 'none',
                                                    padding: isEditingReport ? '15px' : '0',
                                                    borderRadius: isEditingReport ? '8px' : '0',
                                                    minHeight: '200px',
                                                    cursor: isEditingReport ? 'text' : 'default',
                                                    background: isEditingReport ? '#fffbeb' : 'transparent'
                                                }}
                                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editedReportContent || aiReportContent) }}
                                            />
                                        </div>

                                         
                                    </div>

                                    {/* Editing Instructions */}
                                    {isEditingReport && (
                                        <div style={{
                                            marginTop: '15px',
                                            padding: '12px 16px',
                                            background: '#eff6ff',
                                            border: '1px solid #3b82f6',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            color: '#1e40af'
                                        }}>
                                            <strong>✏️ Edit Mode Active:</strong> Click directly in the text above to edit. 
                                            You can modify text, add paragraphs, or change formatting. 
                                            Click "Save Edits" when done to preview your changes.
                                        </div>
                                    )}

                                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={() => {
                                                    setAiReportContent('');
                                                    setEditedReportContent('');
                                                    setIsEditingReport(false);
                                                }}
                                            >
                                                Regenerate
                                            </button>
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => {
                                                    if (isEditingReport) {
                                                        // Save edits
                                                        setIsEditingReport(false);
                                                    } else {
                                                        // Start editing
                                                        if (!editedReportContent) {
                                                            setEditedReportContent(aiReportContent);
                                                        }
                                                        setIsEditingReport(true);
                                                    }
                                                }}
                                            >
                                                <HiOutlinePencil /> {isEditingReport ? 'Save Edits' : 'Edit Report'}
                                            </button>
                                        </div>
                                        {!aiSendEmail && (
                                            <button
                                                className="btn btn-success"
                                                disabled={isEditingReport}
                                                onClick={async () => {
                                                        try {
                                                            // Send the AI report to parent
                                                            const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label;
                                                            const periodStr = `${monthLabel} ${academicYear.split('-')[1]}`;
                                                            
                                                            const response = await api.post(`/notifications/send-ai-report/${selectedStudentForAI._id}`, {
                                                                reportContent: editedReportContent || aiReportContent,
                                                                period: periodStr
                                                            });
                                                            
                                                            if (response.data.success) {
                                                                toast.success('AI report sent to parent successfully!');
                                                                setShowAIModal(false);
                                                            } else {
                                                                toast.error(response.data.message || 'Failed to send report');
                                                            }
                                                        } catch (error) {
                                                            console.error('Error sending AI report:', error);
                                                            toast.error(error.response?.data?.message || 'Failed to send report');
                                                        }
                                                    }}
                                                >
                                                    <HiOutlineMail /> Send to Parents
                                                </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GradebookPage;
