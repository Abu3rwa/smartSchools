import { useTranslation } from "react-i18next";
import TagInput from "../components/TagInput.jsx";

export default function SupportsStep({ form, update }) {
  const { t } = useTranslation(["writing"]);
  const supports = form.supports || {};

  const set = (key, value) => update({ supports: { ...supports, [key]: value } });

  return (
    <div className="wa-step">
      <p className="wa-hint">{t("writing:teacher.builder.supportsHint")}</p>

      <div className="wa-grid-2">
        <TagInput
          label={t("writing:teacher.builder.wordBank")}
          value={supports.wordBank || []}
          onChange={(next) => set("wordBank", next)}
          placeholder={t("writing:teacher.builder.wordBankPlaceholder")}
        />
        <TagInput
          label={t("writing:teacher.builder.transitions")}
          value={supports.transitions || []}
          onChange={(next) => set("transitions", next)}
          placeholder={t("writing:teacher.builder.transitionsPlaceholder")}
          max={40}
        />
        <TagInput
          label={t("writing:teacher.builder.sentenceStarters")}
          value={supports.sentenceStarters || []}
          onChange={(next) => set("sentenceStarters", next)}
          placeholder={t("writing:teacher.builder.startersPlaceholder")}
          max={30}
        />
        <TagInput
          label={t("writing:teacher.builder.guidingQuestions")}
          value={supports.guidingQuestions || []}
          onChange={(next) => set("guidingQuestions", next)}
          placeholder={t("writing:teacher.builder.guidingQuestionsPlaceholder")}
          max={20}
        />
      </div>

      <div className="wa-field">
        <span>{t("writing:teacher.builder.modelText")}</span>
        <textarea
          rows={5}
          value={supports.modelText || ""}
          onChange={(event) => set("modelText", event.target.value)}
          placeholder={t("writing:teacher.builder.modelTextPlaceholder")}
        />
        <p className="wa-hint">{t("writing:teacher.builder.modelTextHint")}</p>
      </div>

      <div className="wa-field">
        <span>{t("writing:teacher.builder.plannerPrompt")}</span>
        <textarea
          rows={3}
          value={supports.plannerPrompt || ""}
          onChange={(event) => set("plannerPrompt", event.target.value)}
          placeholder={t("writing:teacher.builder.plannerPlaceholder")}
        />
      </div>

      <div className="wa-field">
        <span>{t("writing:teacher.builder.aiGuardrails")}</span>
        <textarea
          rows={3}
          value={form.aiConstraints || ""}
          onChange={(event) => update({ aiConstraints: event.target.value })}
          placeholder={t("writing:teacher.builder.aiGuardrailsPlaceholder")}
        />
        <p className="wa-hint">{t("writing:teacher.builder.aiGuardrailsHint")}</p>
      </div>
    </div>
  );
}
