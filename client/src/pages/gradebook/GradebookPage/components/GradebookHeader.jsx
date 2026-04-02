import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineArrowLeft,
    HiOutlineBookOpen,
    HiOutlineMail,
    HiOutlinePencilAlt,
    HiOutlinePlus,
    HiOutlineSparkles,
    HiOutlineViewGrid,
    HiOutlineTable
} from 'react-icons/hi';
import { CATEGORY_FILTER_OPTIONS } from '../constants';

const GradebookHeader = ({
    classId,
    className,
    academicYear,
    selectedCategoryFilter,
    onCategoryFilterChange,
    onSendReports,
    notificationSending,
    hasStudents,
    onOpenAddModal,
    grades,
    viewMode = 'table',
    onViewModeChange,
    hasSpreadsheet = false,
    isEmbedded = false,
    // Within-class filters (subject + month)
    selectedSubject,
    onSubjectChange,
    selectedMonth,
    onMonthChange,
    subjects = [],
    months = [],
    // Class-level filters (grade, subject filter, class) — only when embedded
    availableClasses = [],
    selectedGrade,
    onGradeChange,
    selectedSubjectFilter,
    onSubjectFilterChange,
    onClassChange
}) => {
    const { t } = useTranslation(['gradebook']);

    const uniqueGrades = useMemo(() => {
        if (!isEmbedded) return [];
        const grades = [...new Set(availableClasses.map((c) => c.grade))].filter(Boolean);
        grades.sort((a, b) => a - b);
        return grades;
    }, [availableClasses, isEmbedded]);

    const uniqueSubjects = useMemo(() => {
        if (!isEmbedded) return [];
        const seen = new Map();
        for (const cls of availableClasses) {
            for (const s of cls.subjects || []) {
                const sub = s.subject;
                if (sub && !seen.has(sub._id)) {
                    seen.set(sub._id, sub);
                }
            }
        }
        return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [availableClasses, isEmbedded]);

    const filteredClasses = useMemo(() => {
        if (!isEmbedded) return [];
        let result = availableClasses;
        if (selectedGrade) {
            result = result.filter((c) => c.grade === Number(selectedGrade));
        }
        if (selectedSubjectFilter) {
            result = result.filter((c) =>
                (c.subjects || []).some((s) => s.subject?._id === selectedSubjectFilter)
            );
        }
        return result;
    }, [availableClasses, isEmbedded, selectedGrade, selectedSubjectFilter]);

    // Get distinct assessment groups from current grades for quick-edit links
    const assessmentGroups = (() => {
        if (!grades || grades.length === 0) return [];
        const groups = new Map();
        for (const grade of grades) {
            const gid = grade.assessmentGroupId;
            if (!gid || groups.has(gid)) continue;
            groups.set(gid, {
                assessmentGroupId: gid,
                title: grade.title || '',
                category: grade.category || grade.gradeType || '',
                date: grade.date
            });
        }
        return Array.from(groups.values()).slice(0, 10);
    })();

    return (
        <>
            {!isEmbedded && (
                <Link to={`/portal/classes/${classId}`} className="back-link">
                    <HiOutlineArrowLeft />
                    {t('gradebook:header.backToClass')}
                </Link>
            )}

            <div className="gradebook-header">
                <div className="gradebook-header__top">
                    <div>
                        <h1>
                            <HiOutlineBookOpen />
                            {t('gradebook:header.title')}
                        </h1>
                        <p className="text-muted">{className} • {academicYear}</p>
                    </div>

                    <div className="header-actions">
                        {hasSpreadsheet && onViewModeChange && (
                            <div className="view-toggle" style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color, #e2e8f0)' }}>
                                <button
                                    className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => onViewModeChange('table')}
                                    title={t('gradebook:header.tableView', { defaultValue: 'Table View' })}
                                    style={{ borderRadius: 0, border: 'none' }}
                                >
                                    <HiOutlineTable size={16} />
                                </button>
                                <button
                                    className={`btn btn-sm ${viewMode === 'spreadsheet' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => onViewModeChange('spreadsheet')}
                                    title={t('gradebook:header.spreadsheetView', { defaultValue: 'Spreadsheet View' })}
                                    style={{ borderRadius: 0, border: 'none' }}
                                >
                                    <HiOutlineViewGrid size={16} />
                                </button>
                            </div>
                        )}

                        <Link to="/portal/reports/generator" className="btn btn-outline">
                            <HiOutlineSparkles size={20} />
                            {t('gradebook:header.advancedReports')}
                        </Link>

                        <button
                            className="btn btn-success"
                            onClick={onSendReports}
                            disabled={notificationSending || !hasStudents}
                        >
                            <HiOutlineMail size={20} />
                            {notificationSending ? t('gradebook:common.sending') : t('gradebook:header.sendReports')}
                        </button>

                        <button className="btn btn-primary" onClick={onOpenAddModal}>
                            <HiOutlinePlus size={20} />
                            {t('gradebook:header.addGrades')}
                        </button>

                        {assessmentGroups.length > 0 && (
                            <div className="dropdown" style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                    className="btn btn-outline"
                                    onClick={(e) => {
                                        const menu = e.currentTarget.nextElementSibling;
                                        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                                    }}
                                >
                                    <HiOutlinePencilAlt size={20} />
                                    {t('gradebook:header.editGrades', { defaultValue: 'Edit Grades' })}
                                </button>
                                <div className="dropdown-menu" style={{ display: 'none', position: 'absolute', right: 0, top: '100%', background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 220, zIndex: 50, padding: '4px 0' }}>
                                    {assessmentGroups.map((group) => (
                                        <Link
                                            key={group.assessmentGroupId}
                                            to={`/portal/grades/entry?assessmentGroupId=${group.assessmentGroupId}&class=${classId}`}
                                            className="dropdown-item"
                                            style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: 'var(--text-primary)', fontSize: 14 }}
                                        >
                                            <strong>{group.category}</strong>
                                            {group.title ? ` — ${group.title}` : ''}
                                            {group.date && (
                                                <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                                                    {new Date(group.date).toLocaleDateString()}
                                                </span>
                                            )}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Unified filter bar */}
                <div className="gradebook-header__filters">
                    {isEmbedded && (
                        <>
                            <div className="form-group">
                                <label>{t('gradebook:classFilters.grade', { defaultValue: 'Grade' })}</label>
                                <select value={selectedGrade} onChange={(e) => onGradeChange(e.target.value)}>
                                    <option value="">{t('gradebook:classFilters.allGrades', { defaultValue: 'All Grades' })}</option>
                                    {uniqueGrades.map((g) => (
                                        <option key={g} value={g}>
                                            {t('gradebook:classFilters.gradeN', { defaultValue: `Grade ${g}`, n: g })}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>{t('gradebook:classFilters.class', { defaultValue: 'Class' })}</label>
                                <select value={classId} onChange={(e) => onClassChange(e.target.value)}>
                                    {filteredClasses.length === 0 && (
                                        <option value="">{t('gradebook:classFilters.noClasses', { defaultValue: 'No classes match' })}</option>
                                    )}
                                    {filteredClasses.map((c) => (
                                        <option key={c._id} value={c._id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <div className="form-group">
                        <label>{t('gradebook:filters.subject')}</label>
                        <select value={selectedSubject} onChange={(e) => onSubjectChange(e.target.value)}>
                            <option value="">{t('gradebook:filters.selectSubject')}</option>
                            {subjects.map((subject) => (
                                <option key={subject._id} value={subject._id}>
                                    {subject.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('gradebook:filters.month')}</label>
                        <select value={selectedMonth} onChange={(e) => onMonthChange(Number(e.target.value))}>
                            {months.map((month) => (
                                <option key={month.value} value={month.value}>
                                    {t(`gradebook:months.${month.value}`, { defaultValue: month.label })}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('gradebook:filters.category', { defaultValue: 'Category' })}</label>
                        <select
                            value={selectedCategoryFilter}
                            onChange={(event) => onCategoryFilterChange(event.target.value)}
                        >
                            <option value="All">{t('gradebook:categories.all')}</option>
                            {CATEGORY_FILTER_OPTIONS.map((category) => (
                                <option key={category} value={category}>
                                    {t(`gradebook:categories.${category}`, { defaultValue: category })}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </>
    );
};

export default GradebookHeader;
