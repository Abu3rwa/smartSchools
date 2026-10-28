import { useTranslation } from "react-i18next";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi";
import { WRITING_TYPES } from "../../../../constants/writingPresets.js";
import { applyPreset, removeAt, updateAt } from "./form.js";

export default function DetailsStep({ classes, errors, form, roster, update }) {
  const { t } = useTranslation(["writing"]);

  const setGoal = (index, patch) => update({ goals: updateAt(form.goals, index, patch) });

  return (
    <div className="wa-step">
      <div className="wa-field">
        <span>{t("writing:teacher.builder.titleLabel")}</span>
        <input
          type="text"
          value={form.title}
          onChange={(event) => update({ title: event.target.value })}
          placeholder={t("writing:teacher.builder.titlePlaceholder")}
        />
        {errors.title && <em className="wa-error">{t("writing:teacher.builder.errors.title")}</em>}
      </div>

      <div className="wa-field">
        <span>{t("writing:teacher.builder.typeLabel")}</span>
        <div className="wa-chip-row">
          {WRITING_TYPES.map((type) => (
            <button
              type="button"
              key={type}
              className={`wa-chip-button${form.writingType === type ? " is-active" : ""}`}
              onClick={() => update(applyPreset(form, type))}
            >
              {t(`writing:teacher.types.${type}`)}
            </button>
          ))}
        </div>
        <p className="wa-hint">{t("writing:teacher.builder.typeHint")}</p>
      </div>

      <div className="wa-field">
        <span>{t("writing:teacher.builder.instructionsLabel")}</span>
        <textarea
          rows={4}
          value={form.instructions}
          onChange={(event) => update({ instructions: event.target.value })}
          placeholder={t("writing:teacher.builder.instructionsPlaceholder")}
        />
      </div>

      <div className="wa-row">
        <div className="wa-field">
          <span>{t("writing:teacher.builder.topicLabel")}</span>
          <input
            type="text"
            value={form.topic}
            onChange={(event) => update({ topic: event.target.value })}
          />
        </div>
        <div className="wa-field">
          <span>{t("writing:teacher.builder.classLabel")}</span>
          <select value={form.classId} onChange={(event) => update({ classId: event.target.value, goals: [] })}>
            <option value="">{t("writing:teacher.builder.chooseClass")}</option>
            {classes.map((item) => (
              <option key={item._id || item.id} value={item._id || item.id}>{item.name}</option>
            ))}
          </select>
          {errors.classId && <em className="wa-error">{t("writing:teacher.builder.errors.class")}</em>}
        </div>
        <div className="wa-field">
          <span>{t("writing:teacher.builder.dueDateLabel")}</span>
          <input
            type="date"
            value={form.dueDate}
            onChange={(event) => update({ dueDate: event.target.value })}
          />
        </div>
      </div>

      <div className="wa-row">
        <div className="wa-field">
          <span>{t("writing:teacher.builder.minWords")}</span>
          <input
            type="number"
            min="0"
            value={form.minWords}
            onChange={(event) => update({ minWords: event.target.value })}
          />
        </div>
        <div className="wa-field">
          <span>{t("writing:teacher.builder.maxWords")}</span>
          <input
            type="number"
            min="0"
            value={form.maxWords}
            onChange={(event) => update({ maxWords: event.target.value })}
          />
          {errors.maxWords && <em className="wa-error">{t("writing:teacher.builder.errors.maxBelowMin")}</em>}
        </div>
        <div className="wa-field">
          <span>{t("writing:teacher.builder.expectedLevel")}</span>
          <input
            type="text"
            value={form.expectedLevel}
            onChange={(event) => update({ expectedLevel: event.target.value })}
            placeholder={t("writing:teacher.builder.expectedLevelPlaceholder")}
          />
        </div>
      </div>

      <div className="wa-field">
        <span>{t("writing:teacher.builder.goalsLabel")}</span>
        <p className="wa-hint">{t("writing:teacher.builder.goalsHint")}</p>
        {form.goals.map((goal, index) => (
          <div className="wa-goal-row" key={`${goal.student || 'goal'}-${index}`}>
            <select
              value={goal.student}
              onChange={(event) => setGoal(index, { student: event.target.value })}
            >
              <option value="">{t("writing:teacher.builder.chooseStudent")}</option>
              {roster.map((student) => (
                <option key={student.id} value={student.id}>{student.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={goal.text}
              onChange={(event) => setGoal(index, { text: event.target.value })}
              placeholder={t("writing:teacher.builder.goalPlaceholder")}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => update({ goals: removeAt(form.goals, index) })}
              aria-label={t("writing:teacher.builder.removeGoal")}
            >
              <HiOutlineTrash size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
        {form.classId && roster.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm wa-add-row"
            onClick={() => update({ goals: [...form.goals, { student: "", text: "" }] })}
          >
            <HiOutlinePlus size={15} aria-hidden="true" />
            {t("writing:teacher.builder.addGoal")}
          </button>
        )}
      </div>
    </div>
  );
}
