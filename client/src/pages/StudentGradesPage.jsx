import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../config/api';
import { HiOutlineClipboardList } from 'react-icons/hi';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { selectUser } from '../store/slices/authSlice';
import { selectClasses } from '../store/slices/classSlice';
import { fetchStudentsByClass, selectClassStudents as selectStudentsBySelectedClass } from '../store/slices/studentSlice';
import { fetchMyClasses, selectMyClasses } from '../store/slices/teacherSlice';
import LessonPlanLinkSelector from '../components/grades/LessonPlanLinkSelector';
import './StudentGradesPage.css';

const MONTHS = [
    { value: '' },
    ...Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1)
    }))
];

const normalizeClassId = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value._id || value.id || '';
};

const normalizeCategory = (grade = {}) => {
    return String(grade.category || grade.gradeType || 'other').trim().toLowerCase();
};

const formatDisplayText = (value, fallback = 'Other') => {
    const normalized = String(value || '').replace(/_/g, ' ').trim();
    if (!normalized) return fallback;
    return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
};

const formatStudentOptionLabel = (student, fallback = 'Unnamed student') => {
    const fullName = [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim();
    if (student?.studentId) {
        return fullName ? `${fullName} (${student.studentId})` : student.studentId;
    }
    return fullName || fallback;
};

const summarizeBySubject = (grades = []) => {
    const subjectMap = new Map();

    grades.forEach((grade) => {
        const subject = grade.subject;
        const subjectId = subject?._id;
        if (!subjectId) return;

        const current = subjectMap.get(subjectId) || {
            subject,
            total: 0,
            count: 0
        };

        const maxMarks = Number(grade.maxMarks || 0);
        const marks = Number(grade.marks || 0);
        if (maxMarks > 0) {
            current.total += (marks / maxMarks) * 100;
            current.count += 1;
        }

        subjectMap.set(subjectId, current);
    });

    return Array.from(subjectMap.values()).map((item) => ({
        subject: item.subject,
        average: item.count > 0 ? Math.round(item.total / item.count) : 0
    }));
};

const StudentGradesPage = () => {
    const { t } = useTranslation(['studentGrades']);
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { studentId } = useParams();
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);
    const classes = useSelector(selectClasses);
    const myClasses = useSelector(selectMyClasses);
    const classStudents = useSelector(selectStudentsBySelectedClass);
    const isStudentView = user?.role === 'student' && !studentId;
    const canEditGrades = ['teacher', 'admin'].includes(user?.role || '');
    const canSwitchStudents = ['teacher', 'admin', 'department_principal'].includes(user?.role || '') && Boolean(studentId);

    const [studentName, setStudentName] = useState('');
    const [grades, setGrades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [subjectId, setSubjectId] = useState('');
    const [category, setCategory] = useState('');
    const [month, setMonth] = useState('');
    const [semester, setSemester] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [savingGradeId, setSavingGradeId] = useState('');
    const [editingGradeId, setEditingGradeId] = useState('');
    const [editForm, setEditForm] = useState({ marks: '', maxMarks: '', remarks: '', lessonPlanIds: [] });
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState(studentId || '');

    const pageTitle = useMemo(() => {
        if (isStudentView) {
            return t('studentGrades:title.myGrades');
        }
        return t('studentGrades:title.studentGradebook');
    }, [isStudentView, t]);

    useEffect(() => {
        if (!canSwitchStudents) {
            return;
        }

        if (user?.role === 'teacher') {
            dispatch(fetchMyClasses());
        }
    }, [academicYear, canSwitchStudents, dispatch, user?.role]);

    const availableClasses = useMemo(() => {
        if (!canSwitchStudents) {
            return [];
        }

        if (user?.role !== 'teacher') {
            return classes || [];
        }

        const seen = new Set();
        return (myClasses || [])
            .map((item) => item.class)
            .filter((classItem) => classItem && !seen.has(classItem._id) && (seen.add(classItem._id), true));
    }, [canSwitchStudents, classes, myClasses, user?.role]);

    const availableStudents = useMemo(() => {
        return [...(classStudents || [])].sort((left, right) => {
            const leftName = formatStudentOptionLabel(left, t('studentGrades:switcher.unnamedStudent')).toLowerCase();
            const rightName = formatStudentOptionLabel(right, t('studentGrades:switcher.unnamedStudent')).toLowerCase();
            return leftName.localeCompare(rightName);
        });
    }, [classStudents, t]);

    useEffect(() => {
        if (!studentId) {
            setStudentName('');
            setSelectedStudentId('');
            setSelectedClassId('');
            return;
        }

        api.get(`/students/${studentId}`)
            .then((res) => {
                const student = res.data?.data?.student;
                if (student?.firstName || student?.lastName) {
                    setStudentName(`${student.firstName || ''} ${student.lastName || ''}`.trim());
                } else {
                    setStudentName('');
                }

                if (canSwitchStudents) {
                    setSelectedStudentId(studentId);
                    setSelectedClassId(normalizeClassId(student?.currentClass));
                }
            })
            .catch(() => setStudentName(''));
    }, [canSwitchStudents, studentId]);

    useEffect(() => {
        if (!canSwitchStudents || !selectedClassId) {
            return;
        }

        dispatch(fetchStudentsByClass(selectedClassId));
    }, [canSwitchStudents, dispatch, selectedClassId]);

    useEffect(() => {
        if (!canSwitchStudents || selectedClassId || availableClasses.length === 0) {
            return;
        }

        setSelectedClassId(availableClasses[0]._id);
    }, [availableClasses, canSwitchStudents, selectedClassId]);

    useEffect(() => {
        if (!canSwitchStudents || !selectedClassId || selectedStudentId || availableStudents.length === 0) {
            return;
        }

        const firstStudentId = availableStudents[0]._id;
        if (!firstStudentId) {
            return;
        }

        setSelectedStudentId(firstStudentId);
        if (firstStudentId !== studentId) {
            navigate(`/portal/grades/student/${firstStudentId}`);
        }
    }, [availableStudents, canSwitchStudents, navigate, selectedClassId, selectedStudentId, studentId]);

    const fetchGrades = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (subjectId) {
            params.set('subjectId', subjectId);
            params.set('subject', subjectId);
        }
        if (month) params.set('month', month);
        if (semester) params.set('semester', semester);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (academicYear) params.set('academicYear', academicYear);

        const endpoint = studentId
            ? `/grades/student/${studentId}`
            : '/grades/my-grades';

        api.get(`${endpoint}?${params.toString()}`)
            .then((res) => {
                const data = res.data?.data || {};
                setGrades(data.grades || []);
            })
            .catch(() => {
                setGrades([]);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchGrades();
    }, [studentId, subjectId, month, semester, academicYear, startDate, endDate]);

    const monthOptions = useMemo(() => {
        return MONTHS.map((monthItem) => ({
            value: monthItem.value,
            label: monthItem.value
                ? t(`studentGrades:months.${monthItem.value}`)
                : t('studentGrades:filters.allMonths')
        }));
    }, [t]);

    const subjects = useMemo(() => {
        const subjectMap = new Map();

        grades.forEach((grade) => {
            if (grade.subject?._id && !subjectMap.has(grade.subject._id)) {
                subjectMap.set(grade.subject._id, grade.subject);
            }
        });

        return Array.from(subjectMap.values());
    }, [grades]);

    const categoryOptions = useMemo(() => {
        const seen = new Set();

        return grades
            .map((grade) => normalizeCategory(grade))
            .filter((value) => {
                if (!value || seen.has(value)) {
                    return false;
                }

                seen.add(value);
                return true;
            })
            .sort((left, right) => left.localeCompare(right));
    }, [grades]);

    const filteredGrades = useMemo(() => {
        if (!category) {
            return grades;
        }

        return grades.filter((grade) => normalizeCategory(grade) === category);
    }, [category, grades]);

    const bySubject = useMemo(() => summarizeBySubject(filteredGrades), [filteredGrades]);

    useEffect(() => {
        if (category && !categoryOptions.includes(category)) {
            setCategory('');
        }
    }, [category, categoryOptions]);

    const formatDate = (d) =>
        d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : t('studentGrades:common.dash');

    const formatGradeType = (value) => {
        const key = String(value || '').trim().toLowerCase();
        if (!key) {
            return t('studentGrades:common.notAvailable');
        }

        return t(`studentGrades:types.${key}`, {
            defaultValue: formatDisplayText(key, t('studentGrades:common.notAvailable'))
        });
    };

    const formatCategoryLabel = (value) => {
        const key = String(value || '').trim().toLowerCase();
        return t(`studentGrades:categories.${key}`, {
            defaultValue: formatDisplayText(key, t('studentGrades:categories.other'))
        });
    };

    const handleEditStart = (grade) => {
        const linkedLessonPlanIds = Array.isArray(grade.lessonPlanIds)
            ? grade.lessonPlanIds
                .map((lesson) => (typeof lesson === 'string' ? lesson : lesson?._id))
                .filter(Boolean)
            : [];
        setEditingGradeId(grade._id);
        setEditForm({
            marks: grade.marks,
            maxMarks: grade.maxMarks,
            remarks: grade.remarks || '',
            lessonPlanIds: linkedLessonPlanIds
        });
    };

    const handleEditCancel = () => {
        setEditingGradeId('');
        setEditForm({ marks: '', maxMarks: '', remarks: '', lessonPlanIds: [] });
    };

    const handleEditSave = async (gradeId) => {
        const marks = Number(editForm.marks);
        const maxMarks = Number(editForm.maxMarks);

        if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0 || marks < 0 || marks > maxMarks) {
            window.alert(t('studentGrades:alerts.invalidMarks'));
            return;
        }

        setSavingGradeId(gradeId);
        try {
            await api.put(`/grades/${gradeId}`, {
                marks,
                maxMarks,
                remarks: String(editForm.remarks || '').trim(),
                lessonPlanIds: Array.isArray(editForm.lessonPlanIds) ? editForm.lessonPlanIds : []
            });
            setEditingGradeId('');
            fetchGrades();
        } catch (error) {
            window.alert(error.response?.data?.message || t('studentGrades:alerts.updateFailed'));
        } finally {
            setSavingGradeId('');
        }
    };

    const handleClassChange = (event) => {
        const nextClassId = event.target.value;
        setSelectedClassId(nextClassId);
        setSelectedStudentId('');
    };

    const handleStudentChange = (event) => {
        const nextStudentId = event.target.value;
        setSelectedStudentId(nextStudentId);

        if (!nextStudentId || nextStudentId === studentId) {
            return;
        }

        navigate(`/portal/grades/student/${nextStudentId}`);
    };

    return (
        <div className="student-grades-page">
            <header className="page-header">
                <h1><HiOutlineClipboardList className="header-icon" /> {pageTitle}</h1>
                <p className="page-subtitle">
                    {isStudentView ? t('studentGrades:subtitle.student') : t('studentGrades:subtitle.staff')}
                    {!isStudentView && studentName ? ` ${t('studentGrades:subtitle.studentLabel')} ${studentName}.` : ''}
                    {academicYear ? ` ${t('studentGrades:subtitle.academicYearLabel')} ${academicYear}.` : ''}
                </p>
            </header>

            {canSwitchStudents && (
                <div className="gradebook-student-switcher card">
                    <div className="gradebook-student-switcher__header">
                        <h2>{t('studentGrades:switcher.title')}</h2>
                        <p>{t('studentGrades:switcher.description')}</p>
                    </div>
                    <div className="gradebook-student-switcher__controls">
                        <label className="filter-group">
                            <span className="filter-label">{t('studentGrades:switcher.classLabel')}</span>
                            <select
                                value={selectedClassId}
                                onChange={handleClassChange}
                                className="filter-select"
                            >
                                <option value="">{t('studentGrades:switcher.selectClass')}</option>
                                {availableClasses.map((classItem) => (
                                    <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="filter-group">
                            <span className="filter-label">{t('studentGrades:switcher.studentLabel')}</span>
                            <select
                                value={selectedStudentId}
                                onChange={handleStudentChange}
                                className="filter-select"
                                disabled={!selectedClassId}
                            >
                                <option value="">{t('studentGrades:switcher.selectStudent')}</option>
                                {availableStudents.map((student) => (
                                    <option key={student._id} value={student._id}>
                                        {formatStudentOptionLabel(student, t('studentGrades:switcher.unnamedStudent'))}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>
            )}

            <div className="filters-bar">
                <label className="filter-group">
                    <span className="filter-label">{t('studentGrades:filters.subject')}</span>
                    <select
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">{t('studentGrades:filters.allSubjects')}</option>
                        {subjects.map((s) => (
                            <option key={s._id} value={s._id}>{s.name}</option>
                        ))}
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">{t('studentGrades:filters.category')}</span>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">{t('studentGrades:filters.allCategories')}</option>
                        {categoryOptions.map((option) => (
                            <option key={option} value={option}>{formatCategoryLabel(option)}</option>
                        ))}
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">{t('studentGrades:filters.month')}</span>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="filter-select"
                    >
                        {monthOptions.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">{t('studentGrades:filters.semester')}</span>
                    <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">{t('studentGrades:filters.all')}</option>
                        <option value="1">{t('studentGrades:filters.semester1')}</option>
                        <option value="2">{t('studentGrades:filters.semester2')}</option>
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">{t('studentGrades:filters.startDate')}</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="filter-select"
                    />
                </label>
                <label className="filter-group">
                    <span className="filter-label">{t('studentGrades:filters.endDate')}</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="filter-select"
                    />
                </label>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner" />
                    <p>{t('studentGrades:states.loading')}</p>
                </div>
            ) : (
                <>
                    {bySubject.length > 0 && (
                        <section className="summary-cards">
                            <h2 className="section-title">{t('studentGrades:summary.averageBySubject')}</h2>
                            <div className="summary-grid">
                                {bySubject.map((s) => (
                                    <div key={s.subject?._id} className="summary-card">
                                        <span className="summary-subject">{s.subject?.name}</span>
                                        <span className="summary-average">{s.average}%</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="grades-section">
                        <h2 className="section-title">{t('studentGrades:table.title')}</h2>
                        {filteredGrades.length === 0 ? (
                            <p className="empty-state">{t('studentGrades:states.empty')}</p>
                        ) : (
                            <div className="table-wrap">
                                <table className="grades-table">
                                    <thead>
                                        <tr>
                                            <th>{t('studentGrades:table.columns.date')}</th>
                                            <th>{t('studentGrades:table.columns.subject')}</th>
                                            <th>{t('studentGrades:table.columns.type')}</th>
                                            <th>{t('studentGrades:table.columns.marks')}</th>
                                            <th>{t('studentGrades:table.columns.max')}</th>
                                            <th>%</th>
                                            <th>{t('studentGrades:table.columns.linkedLessons', { defaultValue: 'Linked lessons' })}</th>
                                            <th>{t('studentGrades:table.columns.remarks')}</th>
                                            {canEditGrades && <th>{t('studentGrades:table.columns.actions')}</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredGrades.map((g) => {
                                            const pct = g.maxMarks > 0
                                                ? Math.round((g.marks / g.maxMarks) * 100)
                                                : 0;
                                            const isEditing = editingGradeId === g._id;
                                            const isSaving = savingGradeId === g._id;
                                            const linkedLessons = Array.isArray(g.lessonPlanIds) ? g.lessonPlanIds : [];
                                            const linkedLessonCount = linkedLessons.length;
                                            const linkedLessonTitles = linkedLessons
                                                .map((lesson) => lesson?.title || lesson?.topic)
                                                .filter(Boolean)
                                                .slice(0, 3)
                                                .join(', ');
                                            const columnCount = canEditGrades ? 9 : 8;
                                            return (
                                                <Fragment key={g._id}>
                                                    <tr>
                                                        <td>{formatDate(g.date)}</td>
                                                        <td>{g.subject?.name || t('studentGrades:common.dash')}</td>
                                                        <td>{formatGradeType(g.gradeType)}</td>
                                                        <td>
                                                            {isEditing ? (
                                                                <input
                                                                    type="number"
                                                                    className="table-input"
                                                                    value={editForm.marks}
                                                                    onChange={(e) => setEditForm((prev) => ({ ...prev, marks: e.target.value }))}
                                                                    min={0}
                                                                    step={0.5}
                                                                />
                                                            ) : g.marks}
                                                        </td>
                                                        <td>
                                                            {isEditing ? (
                                                                <input
                                                                    type="number"
                                                                    className="table-input"
                                                                    value={editForm.maxMarks}
                                                                    onChange={(e) => setEditForm((prev) => ({ ...prev, maxMarks: e.target.value }))}
                                                                    min={1}
                                                                    step={0.5}
                                                                />
                                                            ) : g.maxMarks}
                                                        </td>
                                                        <td>{isEditing ? t('studentGrades:common.dash') : `${pct}%`}</td>
                                                        <td title={linkedLessonTitles || ''}>
                                                            {linkedLessonCount > 0
                                                                ? t('studentGrades:table.linkedLessonCount', {
                                                                    defaultValue: '{{count}} linked',
                                                                    count: linkedLessonCount
                                                                })
                                                                : t('studentGrades:common.dash')}
                                                        </td>
                                                        <td>
                                                            {isEditing ? (
                                                                <input
                                                                    type="text"
                                                                    className="table-input"
                                                                    value={editForm.remarks}
                                                                    onChange={(e) => setEditForm((prev) => ({ ...prev, remarks: e.target.value }))}
                                                                    placeholder={t('studentGrades:table.optionalRemarks')}
                                                                />
                                                            ) : (g.remarks || t('studentGrades:common.dash'))}
                                                        </td>
                                                        {canEditGrades && (
                                                            <td>
                                                                {isEditing ? (
                                                                    <div className="table-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="btn btn-primary btn-sm"
                                                                            onClick={() => handleEditSave(g._id)}
                                                                            disabled={isSaving}
                                                                        >
                                                                            {isSaving ? t('studentGrades:table.saving') : t('studentGrades:table.save')}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="btn btn-secondary btn-sm"
                                                                            onClick={handleEditCancel}
                                                                            disabled={isSaving}
                                                                        >
                                                                            {t('studentGrades:table.cancel')}
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-secondary btn-sm"
                                                                        onClick={() => handleEditStart(g)}
                                                                    >
                                                                        {t('studentGrades:table.edit')}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                    {isEditing && (
                                                        <tr className="grade-edit-lessons-row">
                                                            <td colSpan={columnCount}>
                                                                <LessonPlanLinkSelector
                                                                    classId={g.class?._id || g.class}
                                                                    subjectId={g.subject?._id || g.subject}
                                                                    selectedLessonPlanIds={editForm.lessonPlanIds}
                                                                    onChange={(nextLessonPlanIds) => setEditForm((prev) => ({
                                                                        ...prev,
                                                                        lessonPlanIds: nextLessonPlanIds
                                                                    }))}
                                                                    disabled={isSaving}
                                                                />
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default StudentGradesPage;
