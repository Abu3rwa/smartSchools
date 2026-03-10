import { useTranslation } from 'react-i18next';

const AssignmentFiltersBar = ({
    filterTeacher,
    setFilterTeacher,
    filterClass,
    setFilterClass,
    teachers,
    classes
}) => {
    const { t } = useTranslation(['adminTimetable']);

    return (
        <div className="assignment-filters-bar">
            <span className="assignment-filters-label">{t('adminTimetable:assignmentFilters.label')}</span>
            <select
                className="assignment-filter-select"
                value={filterTeacher}
                onChange={(e) => setFilterTeacher(e.target.value)}
            >
                <option value="">{t('adminTimetable:assignmentFilters.allTeachers')}</option>
                {teachers.map((teacher) => (
                    <option key={teacher._id} value={teacher.user?._id || ''}>
                        {teacher.user?.firstName} {teacher.user?.lastName}
                    </option>
                ))}
            </select>
            <select
                className="assignment-filter-select"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
            >
                <option value="">{t('adminTimetable:assignmentFilters.allClasses')}</option>
                {classes.map((classItem) => (
                    <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                ))}
            </select>
        </div>
    );
};

export default AssignmentFiltersBar;
