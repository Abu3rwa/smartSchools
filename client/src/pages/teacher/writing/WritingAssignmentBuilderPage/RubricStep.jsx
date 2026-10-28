import { useTranslation } from "react-i18next";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi";
import { removeAt, slugify, totalRubricPoints, updateAt } from "./form.js";

export default function RubricStep({ errors, form, update }) {
  const { t } = useTranslation(["writing"]);

  const setRow = (index, patch) => update({ rubric: updateAt(form.rubric, index, patch) });

  const toggleApplies = (index, row, key) => {
    const current = row.appliesToSections?.includes("*") ? [] : [...(row.appliesToSections || [])];
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    setRow(index, { appliesToSections: next.length ? next : ["*"] });
  };

  return (
    <div className="wa-step">
      <div className="wa-step-toolbar">
        <p className="wa-hint">{t("writing:teacher.builder.rubricHint")}</p>
        <span className="wa-points">{t("writing:teacher.builder.totalPoints", { n: totalRubricPoints(form.rubric) })}</span>
      </div>

      {form.rubric.map((row, index) => (
        <div className="wa-rubric-row" key={`${row.key || 'criterion'}-${index}`}>
          <div className="wa-row">
            <div className="wa-field wa-grow">
              <span>{t("writing:teacher.builder.criterionLabel")}</span>
              <input
                type="text"
                value={row.label}
                onChange={(event) => setRow(index, { label: event.target.value, key: slugify(event.target.value) || row.key })}
              />
            </div>
            <div className="wa-field">
              <span>{t("writing:teacher.builder.maxScore")}</span>
              <input
                type="number"
                min="1"
                max="100"
                value={row.maxScore}
                onChange={(event) => setRow(index, { maxScore: event.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm wa-remove"
              onClick={() => update({ rubric: removeAt(form.rubric, index) })}
              aria-label={t("writing:teacher.builder.removeCriterion")}
            >
              <HiOutlineTrash size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="wa-field">
            <span>{t("writing:teacher.builder.criterionDescription")}</span>
            <input
              type="text"
              value={row.description}
              onChange={(event) => setRow(index, { description: event.target.value })}
            />
          </div>
          <div className="wa-applies">
            <span className="wa-applies-label">{t("writing:teacher.builder.appliesTo")}</span>
            {form.sections.map((section) => {
              const all = row.appliesToSections?.includes("*");
              const checked = all || row.appliesToSections?.includes(section.key);
              return (
                <button
                  type="button"
                  key={section.key || section.label}
                  className={`wa-chip-button${checked ? " is-active" : ""}`}
                  onClick={() => toggleApplies(index, row, section.key)}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-secondary btn-sm wa-add-row"
        onClick={() => update({
          rubric: [...form.rubric, {
            key: "",
            label: "",
            description: "",
            maxScore: 5,
            appliesToSections: ["*"],
          }],
        })}
      >
        <HiOutlinePlus size={15} aria-hidden="true" />
        {t("writing:teacher.builder.addCriterion")}
      </button>

      {errors.rubric && <em className="wa-error">{t(`writing:teacher.builder.errors.${errors.rubric}`)}</em>}

      <div className="wa-workflow">
        <h3>{t("writing:teacher.builder.workflowTitle")}</h3>
        <label className="wa-switch">
          <input
            type="checkbox"
            checked={form.workflow.teacherPublishesFeedback}
            onChange={(event) => update({
              workflow: { ...form.workflow, teacherPublishesFeedback: event.target.checked },
            })}
          />
          <span>{t("writing:teacher.builder.publishManually")}</span>
        </label>
        <label className="wa-switch">
          <input
            type="checkbox"
            checked={form.workflow.requireNotebookCheck}
            onChange={(event) => update({
              workflow: { ...form.workflow, requireNotebookCheck: event.target.checked },
            })}
          />
          <span>{t("writing:teacher.builder.requireNotebook")}</span>
        </label>
        <label className="wa-switch">
          <input
            type="checkbox"
            checked={form.workflow.autoSuggestNextStep}
            onChange={(event) => update({
              workflow: { ...form.workflow, autoSuggestNextStep: event.target.checked },
            })}
          />
          <span>{t("writing:teacher.builder.autoNextStep")}</span>
        </label>
        <div className="wa-field">
          <span>{t("writing:teacher.builder.maxDrafts")}</span>
          <input
            type="number"
            min="1"
            max="20"
            value={form.workflow.maxDrafts}
            onChange={(event) => update({ workflow: { ...form.workflow, maxDrafts: event.target.value } })}
          />
        </div>
      </div>
    </div>
  );
}
