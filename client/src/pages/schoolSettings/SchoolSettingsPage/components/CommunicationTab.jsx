import UpgradePrompt from '../../../../components/UpgradePrompt';
import { useTranslation } from 'react-i18next';

const CommunicationTab = ({
  loading,
  saving,
  featureAvailable,
  aiEmailDraftEnabled,
  attendanceRemindersEnabled,
  attendanceReminderDelayMinutes,
  onToggleAiEmailDraft,
  onAttendanceReminderSettingsChange,
  onSaveAttendanceReminderSettings
}) => {
  const { t } = useTranslation(['schoolSettings']);

  if (loading) {
    return (
      <div className="tab-content">
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content">
      <div className="card communication-settings-card">
        <h3>{t('schoolSettings:communication.title')}</h3>
        <p className="text-muted">
          {t('schoolSettings:communication.helpText')}
        </p>

        {!featureAvailable ? (
          <UpgradePrompt feature="aiEmailDrafts" />
        ) : (
          <label className="communication-toggle-row">
            <input
              type="checkbox"
              checked={Boolean(aiEmailDraftEnabled)}
              onChange={(event) => onToggleAiEmailDraft(event.target.checked)}
              disabled={saving}
            />
            <span>
              {t('schoolSettings:communication.enableAiEmailDrafting')}
            </span>
          </label>
        )}

        <hr style={{ margin: '1rem 0', borderColor: 'var(--border-color)' }} />

        <h4 style={{ marginBottom: '0.5rem' }}>
          {t('schoolSettings:communication.attendanceRemindersTitle')}
        </h4>
        <p className="text-muted">
          {t('schoolSettings:communication.attendanceRemindersHelpText')}
        </p>

        <label className="communication-toggle-row">
          <input
            type="checkbox"
            checked={Boolean(attendanceRemindersEnabled)}
            onChange={(event) => onAttendanceReminderSettingsChange({
              attendanceRemindersEnabled: event.target.checked
            })}
            disabled={saving}
          />
          <span>
            {t('schoolSettings:communication.enableAttendanceReminders')}
          </span>
        </label>

        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="attendance-reminder-delay-minutes">
            {t('schoolSettings:communication.delayMinutesLabel')}
          </label>
          <input
          className="attendance-reminder-delay-minutes"
            id="attendance-reminder-delay-minutes"
            type="number"
            min={1}
            max={1440}
            step={1}
            value={attendanceReminderDelayMinutes}
            onChange={(event) => onAttendanceReminderSettingsChange({
              attendanceReminderDelayMinutes: event.target.value
            })}
            disabled={saving}
          />
          <p className="text-muted" style={{ marginTop: '0.4rem' }}>
            {t('schoolSettings:communication.delayMinutesHint')}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onSaveAttendanceReminderSettings}
          disabled={saving}
        >
          {saving
            ? t('schoolSettings:common.saving')
            : t('schoolSettings:communication.saveAttendanceReminderSettings')}
        </button>
      </div>
    </div>
  );
};

export default CommunicationTab;
