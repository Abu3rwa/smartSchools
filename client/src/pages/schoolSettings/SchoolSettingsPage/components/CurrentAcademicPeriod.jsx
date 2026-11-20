import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const formatDate = (value, language) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(language === 'ar' ? 'ar' : 'en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const CurrentAcademicPeriod = ({ period, academicYears }) => {
  const { t, i18n } = useTranslation(['schoolSettings']);
  const {
    active,
    draft,
    semesters,
    loading,
    saving,
    error,
    confirmOpen,
    onYearChange,
    onSemesterChange,
    onSave,
    onConfirm,
    onCancel,
    onRetry
  } = period;

  const yearOptions = useMemo(() => {
    const options = new Set((academicYears || []).filter(Boolean));
    if (active?.academicYear) options.add(active.academicYear);
    if (draft?.year) options.add(draft.year);
    return [...options].sort();
  }, [academicYears, active, draft]);

  const semesterOptions = useMemo(() => {
    if (semesters.length > 0) {
      return semesters.map((semester) => ({
        number: semester.number,
        label: (i18n.language === 'ar' && semester.labelAr) ? semester.labelAr : semester.label
      }));
    }
    return [
      { number: 1, label: t('schoolSettings:academicPeriod.semester1') },
      { number: 2, label: t('schoolSettings:academicPeriod.semester2') }
    ];
  }, [semesters, i18n.language, t]);

  const semesterLabelFor = (number) => (
    semesterOptions.find((option) => option.number === Number(number))?.label
    || (Number(number) === 2
      ? t('schoolSettings:academicPeriod.semester2')
      : t('schoolSettings:academicPeriod.semester1'))
  );

  const selectedSemester = semesters.find((semester) => semester.number === Number(draft?.semester));
  const semesterDates = selectedSemester?.startDate && selectedSemester?.endDate
    ? t('schoolSettings:academicPeriod.dates', {
      start: formatDate(selectedSemester.startDate, i18n.language),
      end: formatDate(selectedSemester.endDate, i18n.language)
    })
    : '';

  const dirty = !!active && !!draft?.year && (
    draft.year !== active.academicYear || Number(draft.semester) !== active.semester
  );

  return (
    <section className="card academic-period-card" aria-labelledby="academic-period-title">
      <div className="academic-period-head">
        <h4 id="academic-period-title">{t('schoolSettings:academicPeriod.title')}</h4>
        <p className="text-muted">{t('schoolSettings:academicPeriod.subtitle')}</p>
      </div>

      {loading && !active ? (
        <p className="text-muted">{t('schoolSettings:academicPeriod.loading')}</p>
      ) : !active ? (
        <div className="academic-period-error-block" role="alert">
          <p>{error || t('schoolSettings:academicPeriod.loadFailed')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            {t('schoolSettings:academicPeriod.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="academic-period-year">{t('schoolSettings:academicPeriod.yearLabel')}</label>
              <select
                id="academic-period-year"
                value={draft.year}
                onChange={(event) => onYearChange(event.target.value)}
                disabled={saving}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="academic-period-semester">{t('schoolSettings:academicPeriod.semesterLabel')}</label>
              <select
                id="academic-period-semester"
                value={draft.semester}
                onChange={(event) => onSemesterChange(event.target.value)}
                disabled={saving}
              >
                {semesterOptions.map((option) => (
                  <option key={option.number} value={option.number}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {semesterDates && <p className="text-muted academic-period-dates">{semesterDates}</p>}
          {error && <p className="academic-period-error" role="alert">{error}</p>}

          {confirmOpen ? (
            <div className="academic-period-confirm" role="alertdialog" aria-labelledby="academic-period-confirm-title">
              <h5 id="academic-period-confirm-title">{t('schoolSettings:academicPeriod.confirmTitle')}</h5>
              <p>
                {t('schoolSettings:academicPeriod.confirmFrom')}{' '}
                <bdi dir="ltr">{active.academicYear}</bdi> · {semesterLabelFor(active.semester)}
              </p>
              <p>
                {t('schoolSettings:academicPeriod.confirmTo')}{' '}
                <bdi dir="ltr">{draft.year}</bdi> · {semesterLabelFor(draft.semester)}
              </p>
              <p className="text-muted">{t('schoolSettings:academicPeriod.confirmWarning')}</p>
              <div className="academic-period-actions">
                <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
                  {t('schoolSettings:academicPeriod.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving}>
                  {saving ? t('schoolSettings:academicPeriod.saving') : t('schoolSettings:academicPeriod.confirmAction')}
                </button>
              </div>
            </div>
          ) : (
            <div className="academic-period-actions">
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={!dirty || saving}>
                {t('schoolSettings:academicPeriod.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty || saving}>
                {t('schoolSettings:academicPeriod.save')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default CurrentAcademicPeriod;