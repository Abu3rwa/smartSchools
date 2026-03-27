import { useTranslation } from 'react-i18next';

const OVERVIEW_FIELDS = [
  {
    key: 'showSummaryMetrics',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showSummaryMetrics',
    defaultLabel: 'Show summary metrics',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showSummaryMetrics',
    defaultHint: 'Include total standards, students, mastery, and not-started counts on overview reports.'
  },
  {
    key: 'showHeatmapTable',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showHeatmapTable',
    defaultLabel: 'Show standards heatmap table',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showHeatmapTable',
    defaultHint: 'Include the standards-level distribution matrix in class overview reports.'
  },
  {
    key: 'showTopNeedIntervention',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showTopNeedIntervention',
    defaultLabel: 'Show top standards needing intervention',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showTopNeedIntervention',
    defaultHint: 'Include the list of standards with the highest below-level/not-started counts.'
  },
  {
    key: 'showTopStrongStandards',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showTopStrongStandards',
    defaultLabel: 'Show top strong standards',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showTopStrongStandards',
    defaultHint: 'Include the list of highest-performing standards in class overview reports.'
  }
];

const STANDARD_FIELDS = [
  {
    key: 'showStudentTable',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showStudentTable',
    defaultLabel: 'Show student rows',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showStudentTable',
    defaultHint: 'Include student-level rows for each group in per-standard reports.'
  },
  {
    key: 'showTrendColumn',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showTrendColumn',
    defaultLabel: 'Show trend column',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showTrendColumn',
    defaultHint: 'Display the trend indicator column in student tables.'
  },
  {
    key: 'showAttemptsColumn',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showAttemptsColumn',
    defaultLabel: 'Show attempts column',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showAttemptsColumn',
    defaultHint: 'Display total attempts in student tables.'
  },
  {
    key: 'showOverrideColumn',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showOverrideColumn',
    defaultLabel: 'Show override status column',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showOverrideColumn',
    defaultHint: 'Display teacher override status in student tables.'
  },
  {
    key: 'showSuggestedActivities',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showSuggestedActivities',
    defaultLabel: 'Show suggested activities',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showSuggestedActivities',
    defaultHint: 'Include the suggested activities block under each student group.'
  },
  {
    key: 'showNotStartedStudents',
    labelKey: 'schoolSettings:studentGroupingReports.fields.showNotStartedStudents',
    defaultLabel: 'Show not-started students list',
    hintKey: 'schoolSettings:studentGroupingReports.hints.showNotStartedStudents',
    defaultHint: 'Include the list of students who have not started the selected standard.'
  }
];

const StudentGroupingReportsTab = ({ settings, loading, saving, onChange, onSave }) => {
  const { t } = useTranslation(['schoolSettings']);

  return (
    <div className="card admissions-promotion-settings-card">
      <div className="tab-header">
        <div>
          <h3>{t('schoolSettings:studentGroupingReports.title', 'Student Grouping Reports')}</h3>
          <span>
            {t(
              'schoolSettings:studentGroupingReports.helpText',
              'Control which sections appear in Student Grouping PDF exports for teachers.'
            )}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">
          {t('schoolSettings:studentGroupingReports.loading', 'Loading settings...')}
        </p>
      ) : (
        <>
          <div className="wizard-step">
            <h4>{t('schoolSettings:studentGroupingReports.overviewTitle', 'Class Overview PDF')}</h4>
            {OVERVIEW_FIELDS.map((field) => (
              <label key={field.key} className="communication-toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.[field.key])}
                  onChange={(event) => onChange({ [field.key]: event.target.checked })}
                />
                <span>
                  {t(field.labelKey, field.defaultLabel)}
                  <span className="form-hint">{t(field.hintKey, field.defaultHint)}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="wizard-step">
            <h4>{t('schoolSettings:studentGroupingReports.standardTitle', 'Per-Standard PDF')}</h4>
            {STANDARD_FIELDS.map((field) => (
              <label key={field.key} className="communication-toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.[field.key])}
                  onChange={(event) => onChange({ [field.key]: event.target.checked })}
                />
                <span>
                  {t(field.labelKey, field.defaultLabel)}
                  <span className="form-hint">{t(field.hintKey, field.defaultHint)}</span>
                </span>
              </label>
            ))}
          </div>

          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving
              ? t('schoolSettings:common.saving', 'Saving...')
              : t('schoolSettings:studentGroupingReports.save', 'Save Settings')}
          </button>
        </>
      )}
    </div>
  );
};

export default StudentGroupingReportsTab;
