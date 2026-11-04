import { useState } from "react";
import { useTranslation } from "react-i18next";
import { REPLY_GROUP_ORDER, formatEstimate } from "../inboxUi.js";

const TONES = ["professional", "short", "warm", "formal"];
const LANGUAGES = ["auto", "en", "ar"];

export default function ReplyTypePicker({
  types,
  customTypes,
  typesState,
  suggested,
  defaultTone,
  estimateCents,
  generating,
  onWrite,
  onSaveType,
  onRetryTypes,
}) {
  const { t, i18n } = useTranslation(["inboxAssistant"]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(suggested || "");
  const [customText, setCustomText] = useState("");
  const [tone, setTone] = useState(defaultTone || "professional");
  const [language, setLanguage] = useState("auto");
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [instruction, setInstruction] = useState("");
  const [savingType, setSavingType] = useState(false);
  const [typeNotice, setTypeNotice] = useState("");

  const needle = query.trim().toLowerCase();
  const matches = (type) => !needle || String(type.label).toLowerCase().includes(needle);
  const catalogue = types.filter((type) => type.id !== "custom");
  const groups = REPLY_GROUP_ORDER
    .map((group) => ({ group, items: catalogue.filter((type) => type.group === group && matches(type)) }))
    .filter((entry) => entry.items.length);
  const myTypes = customTypes.filter(matches);
  const customEntry = types.find((type) => type.id === "custom");
  const currentType = [...types, ...customTypes].find((type) => type.id === selected);
  const currentInstruction = selected === "custom"
    ? customText.trim()
    : (currentType?.instruction || "");

  const canWrite = Boolean(
    selected && (selected !== "custom" || customText.trim()) && !generating,
  );

  const pick = (id) => {
    setSelected(id);
    setTypeNotice("");
  };

  const write = () => {
    if (!canWrite) return;
    onWrite({
      replyType: selected,
      customInstruction: customText.trim(),
      tone,
      language,
    });
  };

  const openForm = () => {
    setLabel(currentType?.label || "");
    setInstruction(currentInstruction);
    setTypeNotice("");
    setFormOpen(true);
  };

  const submitType = async (event) => {
    event.preventDefault();
    if (savingType) return;
    const name = label.trim();
    const text = instruction.trim();
    if (!name || !text) return;
    setSavingType(true);
    const id = await onSaveType({ label: name, instruction: text });
    setSavingType(false);
    if (!id) return;
    setSelected(id);
    setFormOpen(false);
    setTypeNotice(t("inboxAssistant:reply.typeSaved"));
  };

  return (
    <section className="ia-picker" aria-label={t("inboxAssistant:reply.type")}>
      <label className="ia-field">
        <span>{t("inboxAssistant:reply.searchTypes")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("inboxAssistant:reply.searchPlaceholder")}
        />
      </label>

      {(typesState === "loading" || typesState === "idle") && (
        <p className="ia-picker-state" role="status">{t("inboxAssistant:reply.typesLoading")}</p>
      )}

      {typesState === "error" && (
        <div className="ia-picker-state" role="alert">
          <p>{t("inboxAssistant:reply.typesFailed")}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetryTypes}>
            {t("inboxAssistant:reply.retry")}
          </button>
        </div>
      )}

      {typesState === "ready" && (
        <div className="ia-type-groups" role="radiogroup" aria-label={t("inboxAssistant:reply.type")}>
          {groups.map(({ group, items }) => (
            <div key={group} className="ia-type-group">
              <h3>{t(`inboxAssistant:reply.groups.${group}`)}</h3>
              {items.map((type) => (
                <label key={type.id} className={`ia-type-option ${selected === type.id ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="ia-reply-type"
                    value={type.id}
                    checked={selected === type.id}
                    onChange={() => pick(type.id)}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          ))}

          {myTypes.length > 0 && (
            <div className="ia-type-group">
              <h3>{t("inboxAssistant:reply.myTypes")}</h3>
              {myTypes.map((type) => (
                <label key={type.id} className={`ia-type-option ${selected === type.id ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="ia-reply-type"
                    value={type.id}
                    checked={selected === type.id}
                    onChange={() => pick(type.id)}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          )}

          {!groups.length && !myTypes.length && (
            <p className="ia-picker-state">{t("inboxAssistant:reply.noTypes")}</p>
          )}
        </div>
      )}

      <label className="ia-field">
        <span>{customEntry?.label || t("inboxAssistant:reply.customLabel")}</span>
        <textarea
          rows={3}
          maxLength={500}
          value={customText}
          onChange={(event) => {
            setCustomText(event.target.value);
            if (event.target.value.trim()) pick("custom");
          }}
          placeholder={t("inboxAssistant:reply.customPlaceholder")}
          aria-describedby="ia-custom-hint"
        />
        <small id="ia-custom-hint" className="ia-hint">
          {t("inboxAssistant:reply.customHint")}
        </small>
      </label>

      <div className="ia-picker-row">
        <label className="ia-field">
          <span>{t("inboxAssistant:reply.tone")}</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            {TONES.map((key) => (
              <option key={key} value={key}>{t(`inboxAssistant:toolbar.tones.${key}`)}</option>
            ))}
          </select>
        </label>

        <label className="ia-field">
          <span>{t("inboxAssistant:reply.language")}</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {LANGUAGES.map((key) => (
              <option key={key} value={key}>{t(`inboxAssistant:reply.languages.${key}`)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="ia-save-type">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!currentInstruction || savingType}
          aria-expanded={formOpen}
          onClick={() => (formOpen ? setFormOpen(false) : openForm())}
        >
          {t("inboxAssistant:reply.saveAsType")}
        </button>
        {typeNotice && <p className="ia-hint" role="status">{typeNotice}</p>}

        {formOpen && (
          <form className="ia-save-type-form" onSubmit={submitType}>
            <label className="ia-field">
              <span>{t("inboxAssistant:reply.typeLabel")}</span>
              <input
                type="text"
                maxLength={60}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                aria-describedby="ia-type-label-hint"
              />
              <small id="ia-type-label-hint" className="ia-hint">
                {t("inboxAssistant:reply.typeLabelHint")}
              </small>
            </label>
            <label className="ia-field">
              <span>{t("inboxAssistant:reply.typeInstruction")}</span>
              <textarea
                rows={3}
                maxLength={300}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                aria-describedby="ia-type-instruction-hint"
              />
              <small id="ia-type-instruction-hint" className="ia-hint">
                {t("inboxAssistant:reply.typeInstructionHint")}
              </small>
            </label>
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={savingType || !label.trim() || !instruction.trim()}
            >
              {t(savingType ? "inboxAssistant:reply.savingType" : "inboxAssistant:reply.saveType")}
            </button>
          </form>
        )}
      </div>

      <div className="ia-picker-footer">
        <span className="ia-hint">
          {estimateCents !== null
            ? t("inboxAssistant:reply.estimate", {
              cost: formatEstimate(estimateCents, i18n.language),
            })
            : ""}
          {!canWrite && !generating && (
            ` ${t(selected ? "inboxAssistant:reply.writeBlocked" : "inboxAssistant:reply.chooseType")}`
          )}
        </span>
        <button type="button" className="btn btn-primary" disabled={!canWrite} onClick={write}>
          {t(generating ? "inboxAssistant:reply.writing" : "inboxAssistant:reply.write")}
        </button>
      </div>
    </section>
  );
}
