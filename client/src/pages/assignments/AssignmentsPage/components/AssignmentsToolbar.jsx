import { HiOutlineSearch } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const uniqueById = (items = []) => (
    Array.from(new Map((items || [])
        .filter((item) => item?._id)
        .map((item) => [String(item._id), item])).values())
);

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const AssignmentsToolbar = ({
    searchTerm,
    onSearchChange,
    selectedClass,
    onClassChange,
    availableClasses,
    selectedSubject,
    onSubjectChange,
    availableSubjects,
    selectedMonth,
    onMonthChange,
    visibleCount,
    totalCount
}) => {
    const { t } = useTranslation(['assignments']);
    const classes = uniqueById(availableClasses);
    const subjects = uniqueById(availableSubjects);

    return (
        <div className="assignments-toolbar">
            <div className="assignments-search">
                <HiOutlineSearch aria-hidden="true" />
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t('assignments:toolbar.searchPlaceholder')}
                    aria-label={t('assignments:toolbar.searchPlaceholder')}
                />
            </div>

            <select
                className="assignments-select"
                value={selectedClass}
                onChange={(event) => onClassChange(event.target.value)}
                aria-label={t('assignments:filters.class')}
            >
                <option value="">{t('assignments:filters.selectClass')}</option>
                {classes.map((item) => (
                    <option key={item._id} value={item._id}>{item.optionLabel || item.name}</option>
                ))}
            </select>

            <select
                className="assignments-select"
                value={selectedSubject}
                onChange={(event) => onSubjectChange(event.target.value)}
                aria-label={t('assignments:filters.subject')}
            >
                <option value="">{t('assignments:filters.allSubjects')}</option>
                {subjects.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                ))}
            </select>

            <select
                className="assignments-select"
                value={selectedMonth ?? ""}
                onChange={(event) => onMonthChange(event.target.value)}
                aria-label={t('assignments:filters.month')}
            >
                <option value="">{t('assignments:filters.allMonths')}</option>
                {MONTHS.map((month) => (
                    <option key={month} value={month}>{t(`assignments:months.${month}`)}</option>
                ))}
            </select>

            <span className="assignments-toolbar__hint">
                {t('assignments:toolbar.showing', { visible: visibleCount, total: totalCount })}
            </span>
        </div>
    );
};

export default AssignmentsToolbar;
