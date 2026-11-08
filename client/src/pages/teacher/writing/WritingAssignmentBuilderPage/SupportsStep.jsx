import { useTranslation } from "react-i18next";
import TagInput from "../components/TagInput.jsx";

export default function SupportsStep({ form, update, vocabularyLists = [] }) {
  const { t } = useTranslation(["writing"]);
  const supports = form.supports || {};
  const wordSupport = supports.wordSupport || {
    vocabulary: { enabled: false, listIds: [] },
    spelling: { enabled: false, maxWords: 5 },
  };

  const set = (key, value) => update({ supports: { ...supports, [key]: value } });
  const setWordSupport = (patch) =>
    set("wordSupport", { ...wordSupport, ...patch });
  const toggleList = (listId) => {
    const selected = wordSupport.vocabulary?.listIds || [];
    setWordSupport({
      vocabulary: {
        ...wordSupport.vocabulary,
        listIds: selected.includes(listId)
          ? selected.filter((id) => id !== listId)
          : [...selected, listId],
      },
    });
  };

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
        <span>{t("writing:teacher.builder.wordSupport")}</span>
        <p className="wa-hint">
          {t("writing:teacher.builder.wordSupportHint")}
        </p>

        <label className="wa-review-check">
          <input
            type="checkbox"
            checked={wordSupport.vocabulary?.enabled === true}
            onChange={(event) =>
              setWordSupport({
                vocabulary: {
                  ...wordSupport.vocabulary,
                  enabled: event.target.checked,
                },
              })
            }
          />
          <span>{t("writing:teacher.builder.vocabularyLists")}</span>
        </label>
        {wordSupport.vocabulary?.enabled === true &&
          (vocabularyLists.length ? (
            <>
              <div className="wa-list-picker">
                {vocabularyLists.map((list) => (
                  <label className="wa-list-option" key={list.listId}>
                    <input
                      type="checkbox"
                      checked={(wordSupport.vocabulary?.listIds || []).includes(
                        list.listId,
                      )}
                      onChange={() => toggleList(list.listId)}
                    />
                    <span>
                      <strong>{list.title || list.listId}</strong>
                      <em>{list.listId}</em>
                    </span>
                  </label>
                ))}
              </div>
              <p className="wa-hint">
                {t("writing:teacher.builder.vocabularyHint")}
              </p>
            </>
          ) : (
            <p className="wa-hint">
              {t("writing:teacher.builder.vocabularyEmpty")}
            </p>
          ))}

        <label className="wa-review-check">
          <input
            type="checkbox"
            checked={wordSupport.spelling?.enabled === true}
            onChange={(event) =>
              setWordSupport({
                spelling: {
                  ...wordSupport.spelling,
                  enabled: event.target.checked,
                },
              })
            }
          />
          <span>{t("writing:teacher.builder.spellingSupport")}</span>
        </label>
        {wordSupport.spelling?.enabled === true && (
          <label className="wa-inline-number">
            <span>{t("writing:teacher.builder.spellingMaxWords")}</span>
            <input
              type="number"
              min="1"
              max="10"
              value={wordSupport.spelling?.maxWords || 5}
              onChange={(event) =>
                setWordSupport({
                  spelling: {
                    ...wordSupport.spelling,
                    maxWords: Number(event.target.value) || 5,
                  },
                })
              }
            />
          </label>
        )}
        <p className="wa-hint">
          {t("writing:teacher.builder.spellingSupportHint")}
        </p>
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
