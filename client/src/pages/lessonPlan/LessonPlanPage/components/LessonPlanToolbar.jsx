import { useTranslation } from 'react-i18next';

const LessonPlanToolbar = ({
  canFilterAsAdmin,
  canFilterBySubject,
  teachers,
  filterClasses,
  filterSubjects,
  subjects,
  selectedTeacherFilter,
  setSelectedTeacherFilter,
  selectedClassFilter,
  setSelectedClassFilter,
  selectedSubjectFilter,
  setSelectedSubjectFilter,
  startDateFilter,
  setStartDateFilter,
  endDateFilter,
  setEndDateFilter,
}) => {
  const { t } = useTranslation(['lessonPlan']);
  const subjectOptions = canFilterAsAdmin ? filterSubjects : subjects;
  if (!canFilterBySubject && !canFilterAsAdmin) return null;

  return (
    <div className="lessons-toolbar">
      {canFilterAsAdmin && (
        <>
          <div className="lesson-filter-group">
            <select
              id="lesson-teacher-filter"
              value={selectedTeacherFilter}
              onChange={(e) => setSelectedTeacherFilter(e.target.value)}
            >
              <option value="">{t('lessonPlan:toolbar.allTeachers')}</option>
              {teachers.map((teacher) => {
                const uid = teacher.user?._id || teacher.user;
                const name = teacher.user
                  ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() || t('lessonPlan:common.unknown')
                  : t('lessonPlan:common.unknown');
                return (
                  <option key={uid || teacher._id} value={uid || ''}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="lesson-filter-group">
            <select
              id="lesson-class-filter"
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
            >
              <option value="">{t('lessonPlan:toolbar.allClasses')}</option>
              {filterClasses.map((cls) => (
                <option key={cls._id} value={cls._id}>{cls.name}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="lesson-filter-group">
        <select
          id="lesson-subject-filter"
          value={selectedSubjectFilter}
          onChange={(e) => setSelectedSubjectFilter(e.target.value)}
        >
          <option value="">{t('lessonPlan:toolbar.allSubjects')}</option>
          {subjectOptions.map((sub) => (
            <option key={sub._id} value={sub._id}>{sub.name}</option>
          ))}
        </select>
      </div>
      {canFilterAsAdmin && (
        <>
          <div className="lesson-filter-group">
            <label htmlFor="lesson-start-date">{t('lessonPlan:toolbar.fromDate')}</label>
            <input
              id="lesson-start-date"
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
            />
          </div>
          <div className="lesson-filter-group">
            <label htmlFor="lesson-end-date">{t('lessonPlan:toolbar.toDate')}</label>
            <input
              id="lesson-end-date"
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default LessonPlanToolbar;
