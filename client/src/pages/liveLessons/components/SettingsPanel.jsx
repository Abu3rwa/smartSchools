import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";

const SettingsPanel = ({
  isAdmin,
  aiHtmlReviewEnabled,
  savingHtmlReviewSetting,
  onToggleAiHtmlReview,
  markDraftEnabled,
  savingMarkDraftSetting,
  onToggleMarkDraft,
  aiBuilderEnabled,
  savingAiBuilderSetting,
  onToggleAiBuilder,
}) => {
  const { t } = useFeatureNamespaces("liveLessonBuilder");
  return (
  <>
    {isAdmin && (
      <section className="live-safety-setting">
        <div>
          <strong>AI HTML safety review</strong>
          <p>
            When enabled, AI reviews HTML and scripts before saving. When
            disabled, CSS animation still works but slides containing
            JavaScript are rejected. Approved scripts run in an isolated,
            network-restricted sandbox.
          </p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={aiHtmlReviewEnabled}
            disabled={savingHtmlReviewSetting}
            onChange={(event) => onToggleAiHtmlReview(event.target.checked)}
          />
          {savingHtmlReviewSetting
            ? "Saving…"
            : aiHtmlReviewEnabled
              ? "Enabled"
              : "Disabled"}
        </label>
      </section>
    )}
    {isAdmin && (
      <section className="live-safety-setting">
        <div>
          <strong>Suggested marks for approval</strong>
          <p>
            When enabled, a teacher marking a live session can ask for a
            first mark and comment on the written answers that are waiting.
            Nothing is saved or shared until the teacher approves it, and
            turning this off leaves the mark sheet exactly as it was.
          </p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={markDraftEnabled}
            disabled={savingMarkDraftSetting}
            onChange={(event) => onToggleMarkDraft(event.target.checked)}
          />
          {savingMarkDraftSetting
            ? "Saving…"
            : markDraftEnabled
              ? "Enabled"
              : "Disabled"}
        </label>
      </section>
    )}
    {isAdmin && (
      <section className="live-safety-setting">
        <div>
          <strong>{t("settings.aiBuilderTitle")}</strong>
          <p>{t("settings.aiBuilderCopy")}</p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={aiBuilderEnabled}
            disabled={savingAiBuilderSetting}
            onChange={(event) => onToggleAiBuilder(event.target.checked)}
          />
          {savingAiBuilderSetting
            ? t("settings.aiBuilderSaving")
            : aiBuilderEnabled
              ? t("settings.aiBuilderEnabled")
              : t("settings.aiBuilderDisabled")}
        </label>
      </section>
    )}
  </>
  );
};

export default SettingsPanel;
