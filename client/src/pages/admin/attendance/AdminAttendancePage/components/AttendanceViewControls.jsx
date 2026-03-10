import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { VIEW_MODES } from '../constants';

const AttendanceViewControls = ({
    classes,
    dateRangeText,
    filters,
    navigateDate,
    setFilters,
    setViewMode,
    subjects,
    teachers,
    viewMode
}) => {
    const { t, i18n } = useTranslation(['adminAttendance']);
    const isRtl = i18n.dir() === 'rtl';

    return (
        <div className="view-controls">
            <div className="view-modes">
                <div className="toggle-buttons">
                    <button
                        className={`toggle-btn ${viewMode === VIEW_MODES.TODAY ? 'active' : ''}`}
                        onClick={() => setViewMode(VIEW_MODES.TODAY)}
                    >
                        {t('adminAttendance:view.today')}
                    </button>
                    <button
                        className={`toggle-btn ${viewMode === VIEW_MODES.WEEK ? 'active' : ''}`}
                        onClick={() => setViewMode(VIEW_MODES.WEEK)}
                    >
                        {t('adminAttendance:view.week')}
                    </button>
                    <button
                        className={`toggle-btn ${viewMode === VIEW_MODES.MONTH ? 'active' : ''}`}
                        onClick={() => setViewMode(VIEW_MODES.MONTH)}
                    >
                        {t('adminAttendance:view.month')}
                    </button>
                </div>

                <div className="date-navigation">
                    <button onClick={() => navigateDate('prev')}>
                        {isRtl ? <HiOutlineChevronRight size={20} /> : <HiOutlineChevronLeft size={20} />}
                    </button>
                    <span>{dateRangeText}</span>
                    <button onClick={() => navigateDate('next')}>
                        {isRtl ? <HiOutlineChevronLeft size={20} /> : <HiOutlineChevronRight size={20} />}
                    </button>
                </div>
            </div>

            <div className="filters">
                <div className="filter-group">
                    <select
                        value={filters.teacher}
                        onChange={(e) => setFilters((prev) => ({ ...prev, teacher: e.target.value }))}
                    >
                        <option value="">{t('adminAttendance:filters.allTeachers')}</option>
                        {teachers.map((teacher) => (
                            <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                {teacher.user
                                    ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim()
                                    : t('adminAttendance:common.unknown')}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <select
                        value={filters.class}
                        onChange={(e) => setFilters((prev) => ({ ...prev, class: e.target.value }))}
                    >
                        <option value="">{t('adminAttendance:filters.allClasses')}</option>
                        {classes.map((cls) => (
                            <option key={cls._id} value={cls._id}>
                                {cls.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <select
                        value={filters.subject}
                        onChange={(e) => setFilters((prev) => ({ ...prev, subject: e.target.value }))}
                    >
                        <option value="">{t('adminAttendance:filters.allSubjects')}</option>
                        {subjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    >
                        <option value="">{t('adminAttendance:filters.allStatus')}</option>
                        <option value="recorded">{t('adminAttendance:status.recorded')}</option>
                        <option value="pending">{t('adminAttendance:status.pending')}</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default AttendanceViewControls;
