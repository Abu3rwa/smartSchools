import UpgradePrompt from '../../../../components/UpgradePrompt';
import { useTranslation } from 'react-i18next';

const CommunicationTab = ({
  loading,
  saving,
  featureAvailable,
  aiEmailDraftEnabled,
  onToggleAiEmailDraft
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
      </div>
    </div>
  );
};

export default CommunicationTab;
