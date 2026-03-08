import UpgradePrompt from '../../../../components/UpgradePrompt';

const CommunicationTab = ({
  loading,
  saving,
  featureAvailable,
  aiEmailDraftEnabled,
  onToggleAiEmailDraft
}) => {
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
        <h3>Communication</h3>
        <p className="text-muted">
          Control AI-assisted email body drafting in the Email Composer for your school.
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
              Enable AI email drafting for this school
            </span>
          </label>
        )}
      </div>
    </div>
  );
};

export default CommunicationTab;
