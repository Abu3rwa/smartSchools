import { Fragment, memo, useMemo, useState } from 'react';
import { HiOutlineChartBar, HiOutlineChevronRight, HiOutlinePlus, HiOutlineRefresh, HiOutlineSearch, HiOutlineSparkles, HiOutlineUsers, HiOutlineX } from 'react-icons/hi';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    getClassCategoryAverage,
    getClassOverallAverage,
    formatAverageOutOfScale,
    getScaleBandForPercentage,
    getStudentCategoryAverage,
    getStudentOverallAverage,
    normalizeCategory
} from '../utils/gradebookPresentation';

const NAME_SORT = '__name';
const OVERALL_SORT = '__overall';

const toNumericAverage = (value) => {
    if (value === '-' || value === null || value === undefined) return null;
    const numeric = Number(String(value).replace('%', '').trim());
    return Number.isFinite(numeric) ? numeric : null;
};

const studentFullName = (student) => `${student?.firstName || ''} ${student?.lastName || ''}`.trim();

const GradebookTable = ({
    loading,
    error = null,
    students,
    grades,
    gradingScale,
    dynamicCategories,
    categoryScales = {},
    processedData,
    selectedCategoryFilter = 'All',
    onOpenAIModal,
    onOpenLearningTrace,
    onAddGrades,
    onRetry
}) => {
    const { t } = useTranslation(['gradebook']);
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState(NAME_SORT);
    const [sortDirection, setSortDirection] = useState('asc');
    const [ungradedOnly, setUngradedOnly] = useState(false);
    const [expandedIds, setExpandedIds] = useState(() => new Set());

    const assessmentsByStudent = useMemo(() => {
        const map = new Map();
        for (const grade of grades || []) {
            const studentId = grade.student?._id;
            if (!studentId) continue;
            const category = normalizeCategory(grade.category || grade.gradeType);
            if (selectedCategoryFilter !== 'All' && category !== selectedCategoryFilter) continue;
            if (!map.has(studentId)) map.set(studentId, []);
            map.get(studentId).push({ ...grade, category });
        }
        for (const list of map.values()) {
            list.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
        }
        return map;
    }, [grades, selectedCategoryFilter]);

    const ungradedStudents = useMemo(
        () => students.filter((student) => !processedData[student._id]?.overallCount),
        [students, processedData]
    );

    const visibleStudents = useMemo(() => {
        const needle = query.trim().toLowerCase();
        let list = students;

        if (needle) {
            list = list.filter((student) => studentFullName(student).toLowerCase().includes(needle));
        }
        if (ungradedOnly) {
            const ungradedIds = new Set(ungradedStudents.map((student) => student._id));
            list = list.filter((student) => ungradedIds.has(student._id));
        }

        const averageFor = (student) => {
            const studentData = processedData[student._id];
            if (sortKey === OVERALL_SORT) {
                return toNumericAverage(getStudentOverallAverage(studentData));
            }
            if (sortKey === NAME_SORT) return null;
            return toNumericAverage(getStudentCategoryAverage(studentData, sortKey));
        };

        const sorted = [...list].sort((a, b) => {
            if (sortKey === NAME_SORT) {
                return studentFullName(a).localeCompare(studentFullName(b), undefined, { sensitivity: 'base' });
            }
            const left = averageFor(a);
            const right = averageFor(b);
            if (left === null && right === null) {
                return studentFullName(a).localeCompare(studentFullName(b), undefined, { sensitivity: 'base' });
            }
            // Students without a grade for this column always sort last
            if (left === null) return 1;
            if (right === null) return -1;
            if (left === right) {
                return studentFullName(a).localeCompare(studentFullName(b), undefined, { sensitivity: 'base' });
            }
            return sortDirection === 'asc' ? left - right : right - left;
        });

        if (sortKey === NAME_SORT && sortDirection === 'desc') sorted.reverse();
        return sorted;
    }, [processedData, query, sortDirection, sortKey, students, ungradedOnly, ungradedStudents]);

    const applySort = (key) => {
        if (key === sortKey) {
            setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSortKey(key);
        setSortDirection(key === NAME_SORT ? 'asc' : 'desc');
    };

    const sortState = (key) => {
        if (key !== sortKey) return undefined;
        return sortDirection === 'asc' ? 'ascending' : 'descending';
    };

    const toggleExpanded = (studentId) => {
        setExpandedIds((current) => {
            const next = new Set(current);
            if (next.has(studentId)) next.delete(studentId);
            else next.add(studentId);
            return next;
        });
    };

    const renderAverageCell = (averageValue, count, scale = 10) => {
        if (averageValue === '-' || averageValue === null || averageValue === undefined) {
            return '-';
        }

        const numericAverage = toNumericAverage(averageValue);
        if (numericAverage === null) {
            return averageValue;
        }

        const band = getScaleBandForPercentage(numericAverage, gradingScale);
        const averageOutOfScale = formatAverageOutOfScale(numericAverage, scale);
        const chipLabel = `${averageOutOfScale}/${scale}`;
        return (
            <>
                <span
                    className="gradebook-average-chip"
                    style={{
                        backgroundColor: `${band?.color || '#64748b'}22`,
                        color: band?.color || 'var(--text-primary)'
                    }}
                    title={band?.grade ? `${band.grade} (${chipLabel})` : chipLabel}
                >
                    {chipLabel}
                    {band?.grade ? ` (${band.grade})` : ''}
                </span>
                {count ? (
                    <span className="gradebook-table__count">
                        {t('gradebook:table.assessmentsCount', { n: count, defaultValue: `${count} assessed` })}
                    </span>
                ) : null}
            </>
        );
    };

    const renderSortableHeader = (key, label, alignCenter = false) => (
        <th
            scope="col"
            className={`sortable-header${alignCenter ? ' text-center' : ''}`}
            aria-sort={sortState(key)}
        >
            <button type="button" onClick={() => applySort(key)}>
                {label}
            </button>
        </th>
    );

    if (loading) {
        return (
            <div className="card">
                <div className="gradebook-table__skeleton-group" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((row) => (
                        <div key={row} className="gradebook-table__skeleton-row">
                            <span className="gradebook-table__skeleton" style={{ width: '28%' }} />
                            <span className="gradebook-table__skeleton" style={{ width: '14%' }} />
                            <span className="gradebook-table__skeleton" style={{ width: '14%' }} />
                            <span className="gradebook-table__skeleton" style={{ width: '14%' }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card">
                <div className="gradebook-error" role="alert">
                    <span>
                        {t('gradebook:table.loadError', { defaultValue: 'Could not load grades for this class.' })}
                        {error?.message ? ` (${error.message})` : ''}
                    </span>
                    {onRetry && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
                            <HiOutlineRefresh size={16} />
                            {t('gradebook:table.retry', { defaultValue: 'Retry' })}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (grades.length === 0) {
        return (
            <div className="card">
                <div className="empty-state">
                    <HiOutlineUsers size={48} />
                    <h3>{t('gradebook:table.noGradesForMonth')}</h3>
                    <p className="gradebook-empty__hint">
                        {t('gradebook:table.noGradesHint', {
                            defaultValue: 'No grades have been recorded for this subject and month yet.'
                        })}
                    </p>
                    {onAddGrades && (
                        <button type="button" className="gradebook-empty__cta" onClick={onAddGrades}>
                            <HiOutlinePlus size={18} />
                            {t('gradebook:header.addGrades')}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const isFiltered = Boolean(query.trim()) || ungradedOnly;

    return (
        <div className="card">
            <div className="table-toolbar">
                <div className="table-toolbar__search">
                    <HiOutlineSearch size={16} />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('gradebook:table.searchPlaceholder', { defaultValue: 'Search student' })}
                        aria-label={t('gradebook:table.searchAria', { defaultValue: 'Search students in this class' })}
                    />
                </div>

                <button
                    type="button"
                    className="table-toolbar__toggle"
                    aria-pressed={ungradedOnly}
                    disabled={ungradedStudents.length === 0}
                    onClick={() => setUngradedOnly((current) => !current)}
                >
                    <HiOutlineUsers size={14} />
                    {t('gradebook:table.notGraded', {
                        n: ungradedStudents.length,
                        defaultValue: `${ungradedStudents.length} not graded`
                    })}
                </button>

                <span className="table-toolbar__count">
                    {t('gradebook:table.showing', {
                        shown: visibleStudents.length,
                        total: students.length,
                        defaultValue: `${visibleStudents.length} of ${students.length} students`
                    })}
                </span>

                {isFiltered && (
                    <button
                        type="button"
                        className="table-toolbar__toggle"
                        onClick={() => {
                            setQuery('');
                            setUngradedOnly(false);
                        }}
                    >
                        <HiOutlineX size={14} />
                        {t('gradebook:table.clearFilters', { defaultValue: 'Clear' })}
                    </button>
                )}
            </div>

            <div className="table-container gradebook-table-container">
                <table className="gradebook-table">
                    <caption className="gradebook-sr-only">{t('gradebook:table.caption', { defaultValue: 'Grades for this class' })}</caption>
                    <thead>
                        <tr>
                            {renderSortableHeader(NAME_SORT, t('gradebook:table.columns.student'))}
                            {dynamicCategories.map((category) => (
                                <th key={category} scope="col" className="sortable-header text-center" aria-sort={sortState(category)}>
                                    <button type="button" onClick={() => applySort(category)}>
                                        {t('gradebook:table.columns.categoryAvg', {
                                            category: t(`gradebook:categories.${category}`, { defaultValue: category }),
                                            max: categoryScales[category] || 10
                                        })}
                                    </button>
                                </th>
                            ))}
                            {renderSortableHeader(OVERALL_SORT, t('gradebook:table.columns.overallAvg'), true)}
                        </tr>
                    </thead>

                    <tbody>
                        {visibleStudents.map((student) => {
                            const studentData = processedData[student._id] || { categories: {}, overallTotal: 0, overallCount: 0 };
                            const overallAverage = getStudentOverallAverage(studentData);
                            const expanded = expandedIds.has(student._id);
                            const assessments = assessmentsByStudent.get(student._id) || [];

                            return (
                                <Fragment key={student._id}>
                                    <tr>
                                        <td>
                                            <div className="student-cell" style={{ justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button
                                                        type="button"
                                                        className="gradebook-row-toggle"
                                                        aria-expanded={expanded}
                                                        aria-label={t('gradebook:table.showAssessments', {
                                                            name: studentFullName(student),
                                                            defaultValue: `Show assessments for ${studentFullName(student)}`
                                                        })}
                                                        onClick={() => toggleExpanded(student._id)}
                                                    >
                                                        <HiOutlineChevronRight size={14} />
                                                    </button>
                                                    <div className="avatar-sm">
                                                        {student.firstName?.charAt(0)}
                                                        {student.lastName?.charAt(0)}
                                                    </div>
                                                    <Link to={`/portal/grades/student/${student._id}`} className="student-name-link">
                                                        {student.firstName} {student.lastName}
                                                    </Link>
                                                </div>

                                                <div className="student-cell__actions">
                                                    <button
                                                        type="button"
                                                        className="btn-icon"
                                                        aria-label={t('gradebook:table.generateProgressReport') + ` — ${studentFullName(student)}`}
                                                        title={t('gradebook:table.generateProgressReport')}
                                                        onClick={() => onOpenAIModal(student)}
                                                        style={{ color: 'var(--accent-purple)' }}
                                                    >
                                                        <HiOutlineSparkles size={18} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="btn-icon"
                                                        aria-label={t('gradebook:table.openLearningTrace', { defaultValue: 'Open learning trace' }) + ` — ${studentFullName(student)}`}
                                                        title={t('gradebook:table.openLearningTrace', { defaultValue: 'Open learning trace' })}
                                                        onClick={() => onOpenLearningTrace(student)}
                                                        style={{ color: 'var(--primary)' }}
                                                    >
                                                        <HiOutlineChartBar size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </td>

                                        {dynamicCategories.map((category) => {
                                            const average = getStudentCategoryAverage(studentData, category);
                                            const count = studentData.categories?.[category]?.count || 0;
                                            return (
                                                <td key={category} className="text-center font-mono">
                                                    {renderAverageCell(average, count, categoryScales[category] || 10)}
                                                </td>
                                            );
                                        })}

                                        <td className="text-center font-bold font-mono">
                                            {renderAverageCell(overallAverage, studentData.overallCount)}
                                        </td>
                                    </tr>

                                    {expanded && (
                                        <tr className={`gradebook-detail-row${assessments.length === 0 ? ' is-ungraded' : ''}`}>
                                            <td colSpan={dynamicCategories.length + 2}>
                                                {assessments.length === 0 ? (
                                                    <p className="gradebook-detail__empty">
                                                        {t('gradebook:table.noAssessments', {
                                                            defaultValue: 'No assessments recorded for this student this month.'
                                                        })}
                                                    </p>
                                                ) : (
                                                    <div className="gradebook-detail__list">
                                                        {assessments.map((grade) => (
                                                            <div
                                                                key={grade._id || `${grade.category}-${grade.title}-${grade.date}`}
                                                                className="gradebook-detail__row"
                                                            >
                                                                <strong>
                                                                    {t(`gradebook:categories.${grade.category}`, { defaultValue: grade.category })}
                                                                </strong>
                                                                <span>{grade.title || t('gradebook:table.untitledAssessment', { defaultValue: 'Untitled' })}</span>
                                                                <span className="gradebook-detail__marks">
                                                                    {grade.marks}/{grade.maxMarks}
                                                                    {Number.isFinite(Number(grade.percentage))
                                                                        ? ` (${Number(grade.percentage).toFixed(1)}%)`
                                                                        : ''}
                                                                </span>
                                                                {grade.date && (
                                                                    <time className="gradebook-table__date" dateTime={new Date(grade.date).toISOString()}>
                                                                        {new Date(grade.date).toLocaleDateString()}
                                                                    </time>
                                                                )}
                                                                {grade.remarks && (
                                                                    <span className="gradebook-detail__remarks">{grade.remarks}</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}

                        {visibleStudents.length === 0 && (
                            <tr>
                                <td colSpan={dynamicCategories.length + 2} className="empty-row">
                                    {students.length === 0
                                        ? t('gradebook:table.noStudents')
                                        : t('gradebook:table.noMatches', { defaultValue: 'No students match this filter.' })}
                                </td>
                            </tr>
                        )}
                    </tbody>

                    <tfoot>
                        <tr className="class-average-row" style={{ fontWeight: 'bold' }}>
                            <td style={{ padding: '12px' }}>{t('gradebook:table.classAverage')}</td>
                            {dynamicCategories.map((category) => {
                                const average = getClassCategoryAverage({ students, processedData, category });
                                return (
                                    <td key={category} className="text-center">
                                        {renderAverageCell(average, null, categoryScales[category] || 10)}
                                    </td>
                                );
                            })}
                            <td className="text-center">
                                {renderAverageCell(getClassOverallAverage({ students, processedData }), null)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default memo(GradebookTable);
