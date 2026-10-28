import { useTranslation } from "react-i18next";
import { HiOutlineChevronDown, HiOutlineChevronUp, HiOutlinePlus, HiOutlineTrash } from "react-icons/hi";
import { SECTION_KINDS, presetSections } from "../../../../constants/writingPresets.js";
import TagInput from "../components/TagInput.jsx";
import { moveRow, newSection, normalizeSectionRow, removeAt, updateAt } from "./form.js";

export default function StructureStep({ errors, form, update }) {
  const { t } = useTranslation(["writing"]);

  const setRow = (index, patch) => update({
    sections: updateAt(form.sections, index, patch),
  });

  const toggleRepeatable = (index, row) => {
    const repeatable = row.repeatable !== true;
    setRow(index, repeatable
      ? { repeatable: true, minCount: row.minCount || 2, maxCount: Math.max(row.maxCount || 1, row.minCount || 2) }
      : { repeatable: false, minCount: 1, maxCount: 1 });
  };

  return (
    <div className="wa-step">
      <div className="wa-step-toolbar">
        <p className="wa-hint">{t("writing:teacher.builder.structureHint")}</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => update({ sections: presetSections(form.writingType) })}
        >
          {t("writing:teacher.builder.reloadPreset")}
        </button>
      </div>

      {form.sections.map((row, index) => {
        const section = normalizeSectionRow(row);
        return (
          <div className="wa-section-row" key={`${row.key || 'section'}-${index}`}>
            <div className="wa-section-order">
              <button
                type="button"
                className="wa-icon-btn"
                onClick={() => update({ sections: moveRow(form.sections, index, -1) })}
                disabled={index === 0}
                aria-label={t("writing:teacher.builder.moveUp")}
              >
                <HiOutlineChevronUp size={16} aria-hidden="true" />
              </button>
              <span className="wa-section-number">{index + 1}</span>
              <button
                type="button"
                className="wa-icon-btn"
                onClick={() => update({ sections: moveRow(form.sections, index, 1) })}
                disabled={index === form.sections.length - 1}
                aria-label={t("writing:teacher.builder.moveDown")}
              >
                <HiOutlineChevronDown size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="wa-section-body">
              <div className="wa-row">
                <div className="wa-field wa-grow">
                  <span>{t("writing:teacher.builder.sectionLabel")}</span>
                  <input
                    type="text"
                    value={section.label}
                    onChange={(event) => setRow(index, { label: event.target.value })}
                  />
                </div>
                <div className="wa-field">
                  <span>{t("writing:teacher.builder.sectionKind")}</span>
                  <select
                    value={section.kind}
                    onChange={(event) => setRow(index, { kind: event.target.value })}
                  >
                    {SECTION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>{t(`writing:teacher.kinds.${kind}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="wa-field">
                  <span>{t("writing:teacher.builder.sectionMinWords")}</span>
                  <input
                    type="number"
                    min="0"
                    value={section.minWords}
                    onChange={(event) => setRow(index, { minWords: event.target.value })}
                  />
                </div>
              </div>

              <div className="wa-field">
                <span>{t("writing:teacher.builder.sectionInstructions")}</span>
                <input
                  type="text"
                  value={section.instructions}
                  onChange={(event) => setRow(index, { instructions: event.target.value })}
                />
              </div>

              <div className="wa-switch-row">
                <label className="wa-switch">
                  <input
                    type="checkbox"
                    checked={section.required}
                    onChange={(event) => setRow(index, { required: event.target.checked })}
                  />
                  <span>{t("writing:teacher.builder.required")}</span>
                </label>
                <label className="wa-switch">
                  <input
                    type="checkbox"
                    checked={section.repeatable}
                    onChange={() => toggleRepeatable(index, section)}
                  />
                  <span>{t("writing:teacher.builder.repeatable")}</span>
                </label>
                {section.repeatable && (
                  <div className="wa-count-pair">
                    <label className="wa-field">
                      <span>{t("writing:teacher.builder.minCount")}</span>
                      <input
                        type="number"
                        min="1"
                        value={section.minCount}
                        onChange={(event) => setRow(index, { minCount: event.target.value })}
                      />
                    </label>
                    <label className="wa-field">
                      <span>{t("writing:teacher.builder.maxCount")}</span>
                      <input
                        type="number"
                        min="1"
                        value={section.maxCount}
                        onChange={(event) => setRow(index, { maxCount: event.target.value })}
                      />
                    </label>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm wa-remove"
                  onClick={() => update({ sections: removeAt(form.sections, index) })}
                >
                  <HiOutlineTrash size={15} aria-hidden="true" />
                  {t("writing:teacher.builder.removeSection")}
                </button>
              </div>

              <TagInput
                label={t("writing:teacher.builder.criteriaLabel")}
                value={section.criteria}
                onChange={(next) => setRow(index, { criteria: next })}
                placeholder={t("writing:teacher.builder.criteriaPlaceholder")}
                max={10}
              />
            </div>
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-secondary btn-sm wa-add-row"
        onClick={() => update({ sections: [...form.sections, newSection()] })}
      >
        <HiOutlinePlus size={15} aria-hidden="true" />
        {t("writing:teacher.builder.addSection")}
      </button>

      {errors.sections && (
        <em className="wa-error">{t(`writing:teacher.builder.errors.${errors.sections}`)}</em>
      )}
    </div>
  );
}
