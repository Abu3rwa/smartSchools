import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const WEEKDAY_OPTIONS = [
  { value: 0, labelKey: 'schoolSettings:weekdays.short.sun' },
  { value: 1, labelKey: 'schoolSettings:weekdays.short.mon' },
  { value: 2, labelKey: 'schoolSettings:weekdays.short.tue' },
  { value: 3, labelKey: 'schoolSettings:weekdays.short.wed' },
  { value: 4, labelKey: 'schoolSettings:weekdays.short.thu' },
  { value: 5, labelKey: 'schoolSettings:weekdays.short.fri' },
  { value: 6, labelKey: 'schoolSettings:weekdays.short.sat' }
];

const SchoolYearTab = ({
  academicYears,
  fromYear,
  toYear,
  setFromYear,
  setToYear,
  rolloverLoading,
  classesCreated,
  deactivateCount,
  promoteResult,
  currentAcademicYear,
  onCopyClasses,
  onDeactivateYear,
  onPromoteStudents,
  onSwitchToNewYear,
  schoolYearStartDate,
  schoolYearEndDate,
  setSchoolYearStartDate,
  setSchoolYearEndDate,
  schoolYearDatesSaving,
  schoolWeekConfigLoading,
  schoolWeekConfigSaving,
  weekWorkingDays,
  weekendDays,
  academicYearSaving,
  onSaveSchoolYearDates,
  onToggleWeekWorkingDay,
  onSaveWeekWorkingDays,
  onNavigateClasses,
  onEditUsersTab
}) => {
  const { t } = useTranslation(['schoolSettings']);
  const sortedYears = useMemo(() => [...academicYears].sort(), [academicYears]);
  const weekendLabels = weekendDays
    .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day))
    .filter(Boolean)
    .map((option) => t(option.labelKey));

  return (
    <div className="tab-content">
      <div className="tab-header">
        <span>
          {t('schoolSettings:schoolYear.intro')}
        </span>
      </div>
      <div className="rollover-wizard card">
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.step0.title')}</h4>
          <p className="text-muted">{t('schoolSettings:schoolYear.step0.subtitle')}</p>
          <div className="form-row">
            <div className="form-group">
              <label>{t('schoolSettings:schoolYear.step0.startDate')}</label>
              <input type="date" value={schoolYearStartDate} onChange={(event) => setSchoolYearStartDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('schoolSettings:schoolYear.step0.endDate')}</label>
              <input type="date" value={schoolYearEndDate} onChange={(event) => setSchoolYearEndDate(event.target.value)} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={onSaveSchoolYearDates}
            disabled={schoolYearDatesSaving || !schoolYearStartDate || !schoolYearEndDate}
          >
            {schoolYearDatesSaving ? t('schoolSettings:common.saving') : t('schoolSettings:schoolYear.step0.saveDates')}
          </button>
        </div>
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.teachingWeek.title')}</h4>
          <p className="text-muted">{t('schoolSettings:schoolYear.teachingWeek.subtitle')}</p>
          <div className="weekday-chip-group">
            {WEEKDAY_OPTIONS.map((dayOption) => {
              const active = weekWorkingDays.includes(dayOption.value);
              return (
                <button
                  key={dayOption.value}
                  type="button"
                  className={`weekday-chip ${active ? 'active' : ''}`}
                  onClick={() => onToggleWeekWorkingDay(dayOption.value)}
                  disabled={schoolWeekConfigLoading || schoolWeekConfigSaving}
                >
                  {t(dayOption.labelKey)}
                </button>
              );
            })}
          </div>
          <p className="text-muted weekday-summary">
            {t('schoolSettings:schoolYear.teachingWeek.weekendSummary', {
              days: weekendLabels.length > 0
                ? weekendLabels.join(', ')
                : t('schoolSettings:schoolYear.teachingWeek.none')
            })}
          </p>
          <button
            className="btn btn-primary"
            onClick={onSaveWeekWorkingDays}
            disabled={schoolWeekConfigLoading || schoolWeekConfigSaving}
          >
            {schoolWeekConfigSaving ? t('schoolSettings:common.saving') : t('schoolSettings:schoolYear.teachingWeek.saveAction')}
          </button>
        </div>
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.step1.title')}</h4>
          <div className="form-row">
            <div className="form-group">
              <label>{t('schoolSettings:schoolYear.step1.fromYear')}</label>
              <select value={fromYear} onChange={(event) => setFromYear(event.target.value)}>
                <option value="">{t('schoolSettings:schoolYear.selectPlaceholder')}</option>
                {sortedYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{t('schoolSettings:schoolYear.step1.toYear')}</label>
              <input
                type="text"
                value={toYear}
                onChange={(event) => setToYear(event.target.value)}
                placeholder={t('schoolSettings:schoolYear.step1.toYearPlaceholder')}
              />
            </div>
          </div>
        </div>
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.step2.title')}</h4>
          <p className="text-muted">{t('schoolSettings:schoolYear.step2.subtitle')}</p>
          <button className="btn btn-primary" onClick={onCopyClasses} disabled={rolloverLoading || !fromYear || !toYear}>
            {rolloverLoading ? t('schoolSettings:schoolYear.actions.creating') : t('schoolSettings:schoolYear.step2.action')}
          </button>
          {classesCreated !== null && <p className="result-msg">{t('schoolSettings:schoolYear.step2.result', { count: classesCreated })}</p>}
        </div>
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.step3.title')}</h4>
          <p className="text-muted">{t('schoolSettings:schoolYear.step3.subtitle')}</p>
          <button className="btn btn-secondary" onClick={onDeactivateYear} disabled={rolloverLoading || !fromYear}>
            {rolloverLoading ? t('schoolSettings:schoolYear.actions.updating') : t('schoolSettings:schoolYear.step3.action', { year: fromYear || t('schoolSettings:common.ellipsis') })}
          </button>
          {deactivateCount !== null && <p className="result-msg">{t('schoolSettings:schoolYear.step3.result', { count: deactivateCount })}</p>}
        </div>
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.step4.title')}</h4>
          <p className="text-muted">{t('schoolSettings:schoolYear.step4.subtitle')}</p>
          <button className="btn btn-primary" onClick={onPromoteStudents} disabled={rolloverLoading || !fromYear || !toYear}>
            {rolloverLoading ? t('schoolSettings:schoolYear.actions.promoting') : t('schoolSettings:schoolYear.step4.action')}
          </button>
          {promoteResult && (
            <div className="result-msg">
              <p>{t('schoolSettings:schoolYear.step4.result', { promoted: promoteResult.promoted, graduated: promoteResult.graduated, skipped: promoteResult.skipped })}</p>
              {promoteResult.errors?.length > 0 && (
                <details>
                  <summary>{t('schoolSettings:schoolYear.step4.errorsSummary')}</summary>
                  <ul>{promoteResult.errors.map((errorItem, index) => <li key={index}>{errorItem}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.step5.title')}</h4>
          <p className="text-muted">{t('schoolSettings:schoolYear.step5.currentYear')} <strong>{currentAcademicYear}</strong></p>
          <button className="btn btn-primary" onClick={onSwitchToNewYear} disabled={!toYear || academicYearSaving}>
            {academicYearSaving ? t('schoolSettings:schoolYear.actions.switching') : t('schoolSettings:schoolYear.step5.action', { year: toYear || t('schoolSettings:schoolYear.step5.newYearFallback') })}
          </button>
        </div>
        <div className="wizard-step">
          <h4>{t('schoolSettings:schoolYear.step6.title')}</h4>
          <p className="text-muted">{t('schoolSettings:schoolYear.step6.subtitle')}</p>
          <button className="btn btn-secondary" onClick={onNavigateClasses}>{t('schoolSettings:schoolYear.step6.editClasses')}</button>
          <span style={{ marginLeft: 8 }} />
          <button className="btn btn-secondary" onClick={onEditUsersTab}>{t('schoolSettings:schoolYear.step6.editUsersRoles')}</button>
        </div>
      </div>
    </div>
  );
};

export default SchoolYearTab;
