import { useTranslation } from 'react-i18next';
import { HiOutlineSearch } from 'react-icons/hi';

const TYPE_OPTIONS = [
  '',
  'google_form',
  'practice',
  'assessment',
  'homework',
  'classwork',
  'grammar_test',
];

const STATE_OPTIONS = ['', 'upcoming', 'active', 'needs_review', 'completed'];

const SEMESTER_OPTIONS = ['', '1', '2'];

const SORT_OPTIONS = ['assignedDate', 'dueDate', 'title'];

const AssignmentsToolbar = ({
  searchInput,
  onSearchChange,
  type,
  state,
  subject = '',
  subjects = [],
  semester = '',
  sort,
  availableYears = [],
  year,
  yearsLoading = false,
  onChange,
}) => {
  const { t } = useTranslation(['assignments']);

  return (
    <div className="assignments-toolbar">
      <label className="assignments-search">
        <HiOutlineSearch size={18} aria-hidden="true" />
        <span className="visually-hidden">{t('student.filters.search')}</span>
        <input
          type="search"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('student.filters.searchPlaceholder')}
          autoComplete="off"
        />
      </label>

      <div className="assignments-filter-row">
        <label className="assignments-filter">
          <span>{t('student.filters.type')}</span>
          <select
            value={type}
            onChange={(event) => onChange('type', event.target.value)}
          >
            {TYPE_OPTIONS.map((value) => (
              <option key={value || 'all'} value={value}>
                {value
                  ? t(`student.filters.types.${value}`)
                  : t('student.filters.allTypes')}
              </option>
            ))}
          </select>
        </label>

        <label className="assignments-filter">
          <span>{t('student.filters.state')}</span>
          <select
            value={state}
            onChange={(event) => onChange('state', event.target.value)}
          >
            {STATE_OPTIONS.map((value) => (
              <option key={value || 'all'} value={value}>
                {value
                  ? t(`student.filters.states.${value}`)
                  : t('student.filters.allStates')}
              </option>
            ))}
          </select>
        </label>

        {subjects.length > 1 ? (
          <label className="assignments-filter">
            <span>{t('student.filters.subject')}</span>
            <select
              value={subject}
              onChange={(event) => onChange('subject', event.target.value)}
            >
              <option value="">{t('student.filters.allSubjects')}</option>
              {subjects.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name || t('student.filters.subjectFallback')}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="assignments-filter">
          <span>{t('student.filters.semester')}</span>
          <select
            value={semester}
            onChange={(event) => onChange('semester', event.target.value)}
          >
            {SEMESTER_OPTIONS.map((value) => (
              <option key={value || 'all'} value={value}>
                {value
                  ? t(`student.filters.semesters.${value === '1' ? 'first' : 'second'}`)
                  : t('student.filters.allSemesters')}
              </option>
            ))}
          </select>
        </label>

        {availableYears.length > 1 ? (
          <label className="assignments-filter">
            <span>{t('student.filters.year')}</span>
            <select
              value={year || ''}
              disabled={yearsLoading}
              onChange={(event) => onChange('year', event.target.value)}
            >
              {availableYears.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="assignments-filter">
          <span>{t('student.filters.sort')}</span>
          <select
            value={sort}
            onChange={(event) => onChange('sort', event.target.value)}
          >
            {SORT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`student.filters.sorts.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

export default AssignmentsToolbar;
