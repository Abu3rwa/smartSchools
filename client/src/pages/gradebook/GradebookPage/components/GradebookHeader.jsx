import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineArrowLeft,
    HiOutlineBookOpen,
    HiOutlineChatAlt2,
    HiOutlineClipboardList,
    HiOutlineDocumentDownload,
    HiOutlineDotsHorizontal,
    HiOutlineDownload,
    HiOutlinePaperAirplane,
    HiOutlinePlus,
    HiOutlineSparkles,
    HiOutlineTable,
    HiOutlineViewGrid
} from 'react-icons/hi';
import { CATEGORY_FILTER_OPTIONS } from '../constants';
import GradebookMenu from './GradebookMenu';

const MAX_EDIT_GRADE_ITEMS = 25;

const GradebookHeader = ({
    classId,
    className,
    academicYear,
    selectedCategoryFilter,
    onCategoryFilterChange,
    onSendReports,
    summaryLanguage = 'en',
    onSummaryLanguageChange,
    onOpenDailyClasswork,
    notificationSending,
    hasStudents,
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
    selectedSemester,
    onSemesterChange,
    subjects = [],
    months = [],
    // Class-level filters (grade, subject filter, class) — only when embedded
    availableClasses = [],
    selectedGrade,
    onGradeChange,
    selectedSubjectFilter,
    onSubjectFilterChange,
    onClassChange,
    onExportGradebook,
    onOpenQuickSchools,
    hasGrades = false
}) => {
    const { t } = useTranslation(['gradebook']);
    const categoryOptions = useMemo(() => {
        const options = new Map(CATEGORY_FILTER_OPTIONS.map((category) => [category.toLowerCase(), category]));
        for (const grade of grades || []) {
            const rawCategory = String(grade.category || grade.gradeType || '').trim();
            if (!rawCategory) continue;
            const normalizedCategory = `${rawCategory.charAt(0).toUpperCase()}${rawCategory.slice(1).toLowerCase()}`;
            const key = normalizedCategory.toLowerCase();
            if (!options.has(key)) options.set(key, normalizedCategory);
        }
        return [...options.values()];
    }, [grades]);

    const uniqueGrades = useMemo(() => {
        if (!isEmbedded) return [];
        const grades = [...new Set(availableClasses.map((c) => c.grade))].filter(Boolean);
        grades.sort((a, b) => a - b);
        return grades;
    }, [availableClasses, isEmbedded]);

    const filteredClasses = useMemo(() => {
        if (!isEmbedded) return [];
        let result = Array.from(
            new Map(availableClasses.map((classItem) => [String(classItem._id), classItem])).values()
        );
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

    // Within-class assessments the teacher can jump straight back into
    const assessmentGroups = useMemo(() => {
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
        return Array.from(groups.values());
    }, [grades]);

    const languageLabel = (code) => (code === 'ar' ? t('gradebook:header.languageArabic') : t('gradebook:header.languageEnglish'));

    const communicateItems = [
        {
            id: 'sendReports',
            icon: HiOutlinePaperAirplane,
            label: notificationSending
                ? t('gradebook:common.sending')
                : t('gradebook:header.sendReports'),
            meta: notificationSending ? null : languageLabel(summaryLanguage),
            onSelect: onSendReports,
            disabled: notificationSending || !hasStudents
        },
        {
            id: 'dailyClasswork',
            icon: HiOutlineClipboardList,
            label: t('gradebook:header.dailyClasswork'),
            onSelect: onOpenDailyClasswork,
            disabled: notificationSending || !hasStudents
        },
        { id: 'divider', divider: true },
        {
            id: 'summaryLanguage',
            render: () => (
                <>
                    <span className="gradebook-menu__label">{t('gradebook:header.summaryLanguage')}</span>
                    <div className="gradebook-language-toggle" role="group" aria-label={t('gradebook:header.summaryLanguageAria')}>
                        {['en', 'ar'].map((code) => (
                            <button
                                key={code}
                                type="button"
                                aria-pressed={summaryLanguage === code}
                                disabled={notificationSending}
                                onClick={() => onSummaryLanguageChange(code)}
                            >
                                {languageLabel(code)}
                            </button>
                        ))}
                    </div>
                </>
            )
        }
    ];

    const editGradeItems = assessmentGroups
        .slice(0, MAX_EDIT_GRADE_ITEMS)
        .map((group) => ({
            id: group.assessmentGroupId,
            label: group.category,
            meta: [
                group.title,
                group.date ? new Date(group.date).toLocaleDateString() : ''
            ].filter(Boolean).join(' — '),
            to: `/portal/grades/entry?assessmentGroupId=${group.assessmentGroupId}&class=${classId}`
        }));

    if (assessmentGroups.length > MAX_EDIT_GRADE_ITEMS) {
        editGradeItems.push({
            id: 'more-assessments',
            render: () => (
                <span className="gradebook-menu__note">
                    {t('gradebook:header.moreAssessments', {
                        n: assessmentGroups.length - MAX_EDIT_GRADE_ITEMS,
                        defaultValue: `${assessmentGroups.length - MAX_EDIT_GRADE_ITEMS} more assessments in the entry page`
                    })}
                </span>
            )
        });
    }

    const moreItems = [
        {
            id: 'advancedReports',
            icon: HiOutlineSparkles,
            label: t('gradebook:header.advancedReports'),
            to: '/portal/reports/generator'
        },
        ...(onOpenQuickSchools
            ? [{
                id: 'quickSchools',
                icon: HiOutlineDocumentDownload,
                label: t('gradebook:header.quickSchoolsExport'),
                onSelect: onOpenQuickSchools,
                disabled: !hasStudents
            }]
            : []),
        ...(viewMode === 'table' && onExportGradebook
            ? [{
                id: 'export',
                icon: HiOutlineDownload,
                label: t('gradebook:header.export'),
                onSelect: onExportGradebook,
                disabled: !hasStudents || !hasGrades
            }]
            : []),
        ...(editGradeItems.length > 0
            ? [
                { id: 'editGradesDivider', divider: true },
                {
                    id: 'editGradesLabel',
                    render: () => <span className="gradebook-menu__label">{t('gradebook:header.editGrades')}</span>
                },
                ...editGradeItems
            ]
            : [])
    ];

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
                    <div className="gradebook-header__title">
                        <h1>
                            <HiOutlineBookOpen />
                            {t('gradebook:header.title')}
                        </h1>
                        {/* When embedded the Class select right below already names the class */}
                        <span className="gradebook-header__context">
                            {isEmbedded ? academicYear : `${className} • ${academicYear}`}
                        </span>
                    </div>

                    <div className="header-actions">
                        {hasSpreadsheet && onViewModeChange && (
                            <div
                                className="view-toggle"
                                role="group"
                                aria-label={t('gradebook:header.viewModeAria')}
                            >
                                <button
                                    type="button"
                                    className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => onViewModeChange('table')}
                                    aria-pressed={viewMode === 'table'}
                                    aria-label={t('gradebook:header.tableView')}
                                    title={t('gradebook:header.tableView')}
                                >
                                    <HiOutlineTable size={16} />
                                </button>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${viewMode === 'spreadsheet' ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => onViewModeChange('spreadsheet')}
                                    aria-pressed={viewMode === 'spreadsheet'}
                                    aria-label={t('gradebook:header.spreadsheetView')}
                                    title={t('gradebook:header.spreadsheetView')}
                                >
                                    <HiOutlineViewGrid size={16} />
                                </button>
                            </div>
                        )}

                        <GradebookMenu
                            label={t('gradebook:header.communicate')}
                            icon={HiOutlineChatAlt2}
                            items={communicateItems}
                            panelClassName="gradebook-menu__panel--wide"
                        />

                        <GradebookMenu
                            label={t('gradebook:header.more')}
                            icon={HiOutlineDotsHorizontal}
                            items={moreItems}
                            panelClassName="gradebook-menu__panel--wide"
                        />

                        <Link className="btn btn-primary" to="/portal/grades/entry">
                            <HiOutlinePlus size={18} />
                            {t('gradebook:header.addGrades')}
                        </Link>
                    </div>
                </div>

                {/* Unified filter bar */}
                <div className="gradebook-header__filters">
                    {isEmbedded && (
                        <>
                            <div className="form-group">
                                <label>{t('gradebook:classFilters.grade')}</label>
                                <select value={selectedGrade} onChange={(e) => onGradeChange(e.target.value)}>
                                    <option value="">{t('gradebook:classFilters.allGrades')}</option>
                                    {uniqueGrades.map((g) => (
                                        <option key={g} value={g}>
                                            {t('gradebook:classFilters.gradeN', { n: g })}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>{t('gradebook:classFilters.class')}</label>
                                <select value={classId} onChange={(e) => onClassChange(e.target.value)}>
                                    {filteredClasses.length === 0 && (
                                        <option value="">{t('gradebook:classFilters.noClasses')}</option>
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

                    {viewMode === 'spreadsheet' ? (
                        <div className="form-group">
                            <label>{t('gradebook:filters.semester')}</label>
                            <select value={selectedSemester} onChange={(e) => onSemesterChange(Number(e.target.value))}>
                                <option value={1}>{t('gradebook:filters.semester1')}</option>
                                <option value={2}>{t('gradebook:filters.semester2')}</option>
                            </select>
                        </div>
                    ) : (
                        <>
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
                                <label>{t('gradebook:filters.category')}</label>
                                <select
                                    value={selectedCategoryFilter}
                                    onChange={(event) => onCategoryFilterChange(event.target.value)}
                                >
                                    <option value="All">{t('gradebook:categories.all')}</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category} value={category}>
                                            {t(`gradebook:categories.${category}`, { defaultValue: category })}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
};

export default GradebookHeader;
