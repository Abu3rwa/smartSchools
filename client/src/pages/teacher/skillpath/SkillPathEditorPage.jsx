import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import subjectService from "../../../services/subjectService";
import {
  ITEM_TYPES,
  TYPE_LABEL_KEY,
  LIMITS,
  normalizeItemType,
  blankDraft,
  draftFromItem,
  validateDraft,
  nextOptionId,
  newOrderRowId
} from "./utils/skillpathAuthoring";
import "../../skillpath/skillpath.css";

const Modal = ({ title, onClose, children, wide }) => (
  <div className="sp-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`sp-modal${wide ? " sp-modal--wide" : ""}`}>
      <div className="sp-modal__head">
        <h3>{title}</h3>
        <button type="button" className="sp-icon-btn" onClick={onClose} aria-label="close">×</button>
      </div>
      <div className="sp-modal__body">{children}</div>
    </div>
  </div>
);

const SkillPathEditorPage = () => {
  const { t } = useFeatureNamespaces(["skillpath"]);
  const { packId } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({ loading: true, error: null, pack: null, canEdit: false });
  const [skills, setSkills] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemDraft, setItemDraft] = useState(null);
  const [itemError, setItemError] = useState("");

  const load = useCallback(async () => {
    setState({ loading: true, error: null, pack: null, canEdit: false });
    try {
      const [packData, skillsData, subjectsData] = await Promise.all([
        skillpathService.getPack(packId),
        skillpathService.getSkills().catch(() => ({ skills: [] })),
        subjectService.getSubjects({ limit: "all", isActive: true }).catch(() => null)
      ]);
      const { pack, canEdit } = packData;
      setState({ loading: false, error: null, pack, canEdit });
      setSkills(skillsData.skills || []);
      setSubjects(subjectsData?.data?.subjects || []);
      setItems(pack.items || []);
      setForm({
        title: pack.title || "",
        description: pack.description || "",
        language: pack.language || "en",
        visibility: pack.visibility || "private",
        subject: pack.subject ? String(pack.subject) : "",
        gradeLevels: (pack.gradeLevels || []).join(", ")
      });
      setDirty(false);
    } catch (error) {
      setState({
        loading: false,
        error: error?.response?.data?.message || t("errors.loadEditor"),
        pack: null,
        canEdit: false
      });
    }
  }, [packId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const skillNames = useMemo(() => new Map(skills.map((skill) => [String(skill._id), skill])), [skills]);

  const patchForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = await skillpathService.updatePack(packId, {
        title: form.title,
        description: form.description,
        language: form.language,
        visibility: form.visibility,
        subject: form.subject || null,
        gradeLevels: form.gradeLevels.split(",").map((level) => level.trim()).filter(Boolean),
        expectedRevision: state.pack?.authoringRevision ?? 0,
        items
      });
      setState((prev) => ({ ...prev, pack: data.pack }));
      setItems(data.pack.items || []);
      setDirty(false);
      toast.success(t("editor.saved"));
      return true;
    } catch (error) {
      const issues = error?.response?.data?.data?.errors;
      const detail = issues?.[0]?.message ? ` — ${issues[0].message}` : "";
      toast.error((error?.response?.data?.message || t("errors.generic")) + detail);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setSaving(true);
    try {
      await skillpathService.publishPack(packId);
      toast.success(t("studio.published", { title: form.title }));
      navigate("/portal/skillpath-studio");
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const openNewItem = () => {
    setItemError("");
    setItemDraft(blankDraft(skills[0]?._id || ""));
  };

  const openItem = (item, index) => {
    setItemError("");
    setItemDraft(draftFromItem(item, index));
  };

  const patchItem = (patch) => setItemDraft((prev) => ({ ...prev, ...patch }));
  const patchNumeric = (patch) => setItemDraft((prev) => ({ ...prev, numeric: { ...prev.numeric, ...patch } }));

  const setOptionText = (index, text) => {
    setItemDraft((prev) => ({
      ...prev,
      options: prev.options.map((option, optionIndex) => (
        optionIndex === index ? { ...option, text } : option
      ))
    }));
  };

  const addOption = () => {
    setItemDraft((prev) => (
      prev.options.length >= LIMITS.maxOptions
        ? prev
        : { ...prev, options: [...prev.options, { id: nextOptionId(prev.options), text: "" }] }
    ));
  };

  const removeOption = (index) => {
    setItemDraft((prev) => {
      const options = prev.options.filter((_, optionIndex) => optionIndex !== index);
      const removedId = prev.options[index]?.id;
      const correctOptionId = options.some((option) => option.id === prev.correctOptionId)
        ? prev.correctOptionId
        : (options[0]?.id || "");
      return {
        ...prev,
        options,
        correctOptionId,
        correctKeys: prev.correctKeys.filter((key) => key !== removedId)
      };
    });
  };

  const toggleCorrectKey = (id) => {
    setItemDraft((prev) => ({
      ...prev,
      correctKeys: prev.correctKeys.includes(id)
        ? prev.correctKeys.filter((key) => key !== id)
        : [...prev.correctKeys, id]
    }));
  };

  const setPairField = (index, field, value) => {
    setItemDraft((prev) => ({
      ...prev,
      pairs: prev.pairs.map((pair, pairIndex) => (pairIndex === index ? { ...pair, [field]: value } : pair))
    }));
  };

  const addPair = () => {
    setItemDraft((prev) => (
      prev.pairs.length >= LIMITS.maxPairs ? prev : { ...prev, pairs: [...prev.pairs, { left: "", right: "" }] }
    ));
  };

  const removePair = (index) => {
    setItemDraft((prev) => ({ ...prev, pairs: prev.pairs.filter((_, pairIndex) => pairIndex !== index) }));
  };

  const setOrderText = (index, text) => {
    setItemDraft((prev) => ({
      ...prev,
      orderRows: prev.orderRows.map((row, rowIndex) => (rowIndex === index ? { ...row, text } : row))
    }));
  };

  const moveOrderRow = (index, direction) => {
    setItemDraft((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.orderRows.length) return prev;
      const orderRows = [...prev.orderRows];
      [orderRows[index], orderRows[target]] = [orderRows[target], orderRows[index]];
      return { ...prev, orderRows };
    });
  };

  const addOrderRow = () => {
    setItemDraft((prev) => (
      prev.orderRows.length >= LIMITS.maxOrder ? prev : { ...prev, orderRows: [...prev.orderRows, { id: newOrderRowId(), text: "" }] }
    ));
  };

  const removeOrderRow = (index) => {
    setItemDraft((prev) => ({ ...prev, orderRows: prev.orderRows.filter((_, rowIndex) => rowIndex !== index) }));
  };

  const saveItem = () => {
    const { payload, errors } = validateDraft(itemDraft);
    if (errors.length > 0) {
      const first = errors[0];
      return setItemError(t(`editor.${first.code}`, first.params || {}));
    }
    setItems((prev) => (
      itemDraft.index >= 0
        ? prev.map((item, index) => (index === itemDraft.index ? payload : item))
        : [...prev, payload]
    ));
    setDirty(true);
    setItemDraft(null);
    setItemError("");
  };

  const deleteItem = (index) => {
    if (!window.confirm(t("editor.confirmDelete"))) return;
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setDirty(true);
  };

  if (state.loading) {
    return <div className="sp-page sp-loading">{t("common.loading")}</div>;
  }

  if (state.error) {
    return (
      <div className="sp-page">
        <div className="sp-error">{state.error}</div>
        <div className="sp-actions">
          <button type="button" className="sp-btn" onClick={load}>{t("common.retry")}</button>
          <Link className="sp-btn" to="/portal/skillpath-studio">{t("editor.back")}</Link>
        </div>
      </div>
    );
  }

  const pack = state.pack;
  const readOnly = !state.canEdit;

  return (
    <div className="sp-page">
      <header className="sp-header">
        <div>
          <Link className="sp-chip" to="/portal/skillpath-studio">{t("editor.back")}</Link>
          <h1 style={{ marginTop: 8 }}>{form.title || t("editor.title")}</h1>
          <p>{t("studio.status." + pack.status)} · {t("home.items", { count: items.length })}</p>
        </div>
        {!readOnly ? (
          <div className="sp-actions">
            <button type="button" className="sp-btn" onClick={save} disabled={saving || !dirty}>
              {saving ? t("common.working") : t("editor.save")}
            </button>
            <button type="button" className="sp-btn sp-btn--primary" onClick={publish} disabled={saving || items.length === 0}>
              {t("editor.publish")}
            </button>
          </div>
        ) : null}
      </header>

      {readOnly ? <div className="sp-error">{t("editor.notEditable")}</div> : null}
      {pack.status === "published" && !readOnly ? (
        <p className="sp-play__foot-note" style={{ marginBottom: 12 }}>{t("editor.publishedNote")}</p>
      ) : null}

      <section className="sp-section">
        <div className="sp-section__head">
          <h3>{t("editor.metaTitle")}</h3>
        </div>
        <div className="sp-card sp-form">
          <label>
            <span>{t("studio.packTitle")}</span>
            <input
              value={form.title}
              disabled={readOnly}
              onChange={(event) => patchForm({ title: event.target.value })}
              placeholder={t("studio.packTitlePlaceholder")}
            />
          </label>
          <label>
            <span>{t("editor.description")}</span>
            <input
              value={form.description}
              disabled={readOnly}
              onChange={(event) => patchForm({ description: event.target.value })}
              placeholder={t("editor.descriptionPlaceholder")}
            />
          </label>
          <div className="sp-form__row">
            <label>
              <span>{t("studio.gradeLevels")}</span>
              <input
                value={form.gradeLevels}
                disabled={readOnly}
                onChange={(event) => patchForm({ gradeLevels: event.target.value })}
                placeholder="5, 6"
              />
            </label>
            <label>
              <span>{t("studio.language")}</span>
              <select
                value={form.language}
                disabled={readOnly}
                onChange={(event) => patchForm({ language: event.target.value })}
              >
                <option value="en">{t("studio.langEn")}</option>
                <option value="ar">{t("studio.langAr")}</option>
                <option value="mixed">{t("studio.langMixed")}</option>
              </select>
            </label>
            <label>
              <span>{t("studio.visibility")}</span>
              <select
                value={form.visibility}
                disabled={readOnly}
                onChange={(event) => patchForm({ visibility: event.target.value })}
              >
                <option value="private">{t("studio.visiblePrivate")}</option>
                <option value="school">{t("studio.visibleSchool")}</option>
              </select>
            </label>
            <label>
              <span>{t("studio.subject")}</span>
              <select
                value={form.subject}
                disabled={readOnly}
                onChange={(event) => patchForm({ subject: event.target.value })}
              >
                <option value="">{t("studio.subjectGeneral")}</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>{subject.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="sp-section">
        <div className="sp-section__head">
          <h3>{t("editor.itemsTitle")}</h3>
          <span className="sp-chip">{items.length}</span>
          {!readOnly ? (
            <button type="button" className="sp-btn sp-btn--primary" onClick={openNewItem}>
              {t("editor.addItem")}
            </button>
          ) : null}
        </div>

        {items.length ? (
          <div className="sp-card" style={{ padding: "4px 16px" }}>
            {items.map((item, index) => {
              const skill = skillNames.get(String(item.skillId));
              return (
                <div key={item.externalId} className="sp-item-row">
                  <div className="sp-item-row__body">
                    <div className="sp-card__meta">
                      <span className="sp-chip">
                        {t(`editor.${TYPE_LABEL_KEY[normalizeItemType(item.type)] || "typeMcq"}`)}
                      </span>
                      {skill ? <span className="sp-chip">{skill.name}</span> : null}
                      <span className="sp-chip">{t("editor.level" + (item.difficulty || 1))}</span>
                    </div>
                    <p dir="auto" className="sp-item-row__prompt">{item.prompt}</p>
                  </div>
                  {!readOnly ? (
                    <div className="sp-actions">
                      <button type="button" className="sp-btn" onClick={() => openItem(item, index)}>
                        {t("studio.edit")}
                      </button>
                      <button type="button" className="sp-btn sp-btn--danger" onClick={() => deleteItem(index)}>
                        {t("editor.deleteItem")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sp-empty">{t("editor.noItems")}</div>
        )}
      </section>

      {itemDraft ? (
        <Modal title={itemDraft.index >= 0 ? t("editor.editItem") : t("editor.newItem")} onClose={() => setItemDraft(null)} wide>
          <div className="sp-form">
            <div className="sp-form__row">
              <label>
                <span>{t("editor.itemType")}</span>
                <select
                  value={itemDraft.type}
                  onChange={(event) => patchItem({ type: event.target.value })}
                >
                  {ITEM_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`editor.${TYPE_LABEL_KEY[type]}`)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("editor.skill")}</span>
                <select value={itemDraft.skillId} onChange={(event) => patchItem({ skillId: event.target.value })}>
                  <option value="">{t("editor.chooseSkill")}</option>
                  {skills.map((skill) => (
                    <option key={skill._id} value={skill._id}>
                      {skill.name}{skill.gradeLevel ? ` · ${skill.gradeLevel}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("editor.difficulty")}</span>
                <select
                  value={itemDraft.difficulty}
                  onChange={(event) => patchItem({ difficulty: Number(event.target.value) })}
                >
                  <option value={1}>{t("editor.level1")}</option>
                  <option value={2}>{t("editor.level2")}</option>
                  <option value={3}>{t("editor.level3")}</option>
                </select>
              </label>
            </div>

            <label>
              <span>{t("editor.prompt")}</span>
              <textarea
                rows={3}
                dir="auto"
                value={itemDraft.prompt}
                onChange={(event) => patchItem({ prompt: event.target.value })}
                placeholder={itemDraft.type === "fill_in_blank" ? t("editor.promptFillHint") : t("editor.promptPlaceholder")}
              />
            </label>

            {itemDraft.type === "multiple_choice" || itemDraft.type === "multiple_select" ? (
              <div>
                <span className="sp-form__label">
                  {t("editor.options")}
                  {itemDraft.type === "multiple_select" ? ` — ${t("editor.multiCorrectHint")}` : ""}
                </span>
                {itemDraft.options.map((option, index) => (
                  <div key={option.id} className="sp-option-row">
                    {itemDraft.type === "multiple_choice" ? (
                      <input
                        type="radio"
                        name="correct-option"
                        checked={itemDraft.correctOptionId === option.id}
                        onChange={() => patchItem({ correctOptionId: option.id })}
                        aria-label={t("editor.correctOption")}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={itemDraft.correctKeys.includes(option.id)}
                        onChange={() => toggleCorrectKey(option.id)}
                        aria-label={t("editor.correctOption")}
                      />
                    )}
                    <input
                      type="text"
                      dir="auto"
                      value={option.text}
                      onChange={(event) => setOptionText(index, event.target.value)}
                      placeholder={t("editor.option", { index: index + 1 })}
                    />
                    <button
                      type="button"
                      className="sp-icon-btn"
                      onClick={() => removeOption(index)}
                      disabled={itemDraft.options.length <= 2}
                      aria-label={t("editor.deleteItem")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost"
                  onClick={addOption}
                  disabled={itemDraft.options.length >= LIMITS.maxOptions}
                >
                  {t("editor.addOption")}
                </button>
              </div>
            ) : null}

            {itemDraft.type === "true_false" ? (
              <div>
                <span className="sp-form__label">{t("editor.correctAnswerLabel")}</span>
                <div className="sp-actions">
                  <label className="sp-chip">
                    <input
                      type="radio"
                      name="true-false"
                      checked={itemDraft.trueFalse === "true"}
                      onChange={() => patchItem({ trueFalse: "true" })}
                    />
                    {t("editor.true")}
                  </label>
                  <label className="sp-chip">
                    <input
                      type="radio"
                      name="true-false"
                      checked={itemDraft.trueFalse === "false"}
                      onChange={() => patchItem({ trueFalse: "false" })}
                    />
                    {t("editor.false")}
                  </label>
                </div>
              </div>
            ) : null}

            {itemDraft.type === "matching" ? (
              <div>
                <span className="sp-form__label">{t("editor.matchingPairs")} — {t("editor.matchingHint")}</span>
                {itemDraft.pairs.map((pair, index) => (
                  <div key={index} className="sp-option-row">
                    <input
                      type="text"
                      dir="auto"
                      value={pair.left}
                      onChange={(event) => setPairField(index, "left", event.target.value)}
                      placeholder={t("editor.pairLeft", { index: index + 1 })}
                    />
                    <input
                      type="text"
                      dir="auto"
                      value={pair.right}
                      onChange={(event) => setPairField(index, "right", event.target.value)}
                      placeholder={t("editor.pairRight", { index: index + 1 })}
                    />
                    <button
                      type="button"
                      className="sp-icon-btn"
                      onClick={() => removePair(index)}
                      disabled={itemDraft.pairs.length <= LIMITS.minPairs}
                      aria-label={t("editor.deleteItem")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost"
                  onClick={addPair}
                  disabled={itemDraft.pairs.length >= LIMITS.maxPairs}
                >
                  {t("editor.addPair")}
                </button>
              </div>
            ) : null}

            {itemDraft.type === "ordering" ? (
              <div>
                <span className="sp-form__label">{t("editor.orderingItems")} — {t("editor.orderingHint")}</span>
                {itemDraft.orderRows.map((row, index) => (
                  <div key={row.id} className="sp-option-row">
                    <span className="sp-chip">{index + 1}</span>
                    <input
                      type="text"
                      dir="auto"
                      value={row.text}
                      onChange={(event) => setOrderText(index, event.target.value)}
                      placeholder={t("editor.orderItem", { index: index + 1 })}
                    />
                    <button
                      type="button"
                      className="sp-icon-btn"
                      onClick={() => moveOrderRow(index, -1)}
                      disabled={index === 0}
                      aria-label={t("editor.moveUp")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="sp-icon-btn"
                      onClick={() => moveOrderRow(index, 1)}
                      disabled={index === itemDraft.orderRows.length - 1}
                      aria-label={t("editor.moveDown")}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="sp-icon-btn"
                      onClick={() => removeOrderRow(index)}
                      disabled={itemDraft.orderRows.length <= LIMITS.minOrder}
                      aria-label={t("editor.deleteItem")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost"
                  onClick={addOrderRow}
                  disabled={itemDraft.orderRows.length >= LIMITS.maxOrder}
                >
                  {t("editor.addOrderItem")}
                </button>
              </div>
            ) : null}

            {itemDraft.type === "numeric_response" ? (
              <div className="sp-form">
                <div className="sp-form__row">
                  <label>
                    <span>{t("editor.numericMode")}</span>
                    <select
                      value={itemDraft.numeric.mode}
                      onChange={(event) => patchNumeric({ mode: event.target.value })}
                    >
                      <option value="exact">{t("editor.numericExact")}</option>
                      <option value="tolerance">{t("editor.numericTolerance")}</option>
                      <option value="relative">{t("editor.numericRelative")}</option>
                      <option value="range">{t("editor.numericRange")}</option>
                    </select>
                  </label>
                  {itemDraft.numeric.mode === "range" ? (
                    <>
                      <label>
                        <span>{t("editor.numericMin")}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={itemDraft.numeric.min}
                          onChange={(event) => patchNumeric({ min: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>{t("editor.numericMax")}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={itemDraft.numeric.max}
                          onChange={(event) => patchNumeric({ max: event.target.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        <span>{t("editor.numericValue")}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={itemDraft.numeric.value}
                          onChange={(event) => patchNumeric({ value: event.target.value })}
                        />
                      </label>
                      {itemDraft.numeric.mode === "tolerance" || itemDraft.numeric.mode === "relative" ? (
                        <label>
                          <span>{itemDraft.numeric.mode === "relative" ? t("editor.numericTolerancePercent") : t("editor.numericToleranceValue")}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={itemDraft.numeric.tolerance}
                            onChange={(event) => patchNumeric({ tolerance: event.target.value })}
                          />
                        </label>
                      ) : null}
                    </>
                  )}
                  <label>
                    <span>{t("editor.numericUnit")}</span>
                    <input
                      type="text"
                      dir="auto"
                      value={itemDraft.numeric.unit}
                      onChange={(event) => patchNumeric({ unit: event.target.value })}
                      placeholder={t("editor.numericUnitPlaceholder")}
                    />
                  </label>
                </div>
                <div className="sp-actions">
                  <label className="sp-chip">
                    <input
                      type="checkbox"
                      checked={itemDraft.numeric.allowFractions}
                      onChange={(event) => patchNumeric({ allowFractions: event.target.checked })}
                    />
                    {t("editor.numericFractions")}
                  </label>
                  <label className="sp-chip">
                    <input
                      type="checkbox"
                      checked={itemDraft.numeric.allowPercent}
                      onChange={(event) => patchNumeric({ allowPercent: event.target.checked })}
                    />
                    {t("editor.numericPercent")}
                  </label>
                </div>
              </div>
            ) : null}

            {itemDraft.type === "fill_in_blank" ? (
              <label>
                <span>{t("editor.acceptedAnswers")}</span>
                <textarea
                  rows={3}
                  dir="auto"
                  value={itemDraft.acceptedText || ""}
                  onChange={(event) => patchItem({ acceptedText: event.target.value })}
                  placeholder={t("editor.acceptedPlaceholder")}
                />
              </label>
            ) : null}

            <label>
              <span>{t("editor.explanation")}</span>
              <textarea
                rows={2}
                dir="auto"
                value={itemDraft.explanation || ""}
                onChange={(event) => patchItem({ explanation: event.target.value })}
                placeholder={t("editor.explanationPlaceholder")}
              />
            </label>

            {itemError ? <div className="sp-error">{itemError}</div> : null}

            <div className="sp-actions">
              <button type="button" className="sp-btn" onClick={() => setItemDraft(null)}>{t("common.cancel")}</button>
              <button type="button" className="sp-btn sp-btn--primary" onClick={saveItem}>{t("editor.saveItem")}</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

export default SkillPathEditorPage;
