import {
  HiOutlineArrowLeft,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineCheck,
  HiOutlinePlus,
} from "react-icons/hi2";
import {
  allItemsReady,
  formatNumber,
  outlineCounts,
} from "./liveLessonBuilderForm.js";

const BuilderApproveStep = ({
  items,
  classes,
  subjectOptions,
  form,
  onChange,
  onSubmit,
  onBack,
  busy,
  approvedLessonId,
  onOpenLibrary,
  onBuildAnother,
  t,
  locale,
}) => {
  const counts = outlineCounts(items);
  const ready = allItemsReady(items);
  const missing = !ready
    ? "approve.notReady"
    : !form.classId || !form.subjectId
      ? "approve.needClass"
      : !form.answersChecked
        ? "approve.needChecked"
        : "";
  const canSubmit = Boolean(approvedLessonId) || (!busy && !missing);

  if (approvedLessonId) {
    return (
      <section className="llb-screen" aria-label={t("steps.approve.label")}>
        <div className="llb-success">
          <div className="llb-success-icon">
            <HiOutlineCheck className="llb-ic" aria-hidden="true" />
          </div>
          <h2>{t("approve.successTitle")}</h2>
          <p>{t("approve.successBody")}</p>
          <div className="llb-success-actions">
            <button
              type="button"
              className="llb-btn llb-btn-primary"
              onClick={onOpenLibrary}
            >
              <HiOutlineArrowTopRightOnSquare className="llb-ic-sm" aria-hidden="true" />
              {t("approve.openLibrary")}
            </button>
            <button
              type="button"
              className="llb-btn llb-btn-secondary"
              onClick={onBuildAnother}
            >
              <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
              {t("approve.buildAnother")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="llb-screen" aria-label={t("steps.approve.label")}>
      <div className="llb-screen-heading">
        <div>
          <h2>{t("approve.heading")}</h2>
          <p>{t("approve.copy")}</p>
        </div>
        <div className="llb-heading-aside">
          <span className="llb-soft-chip">
            <strong>{formatNumber(items.length, locale)}</strong>
            {t("approve.readySuffix")}
          </span>
          <span className="llb-soft-chip">{t("approve.noCharge")}</span>
        </div>
      </div>

      <div className="llb-approve-layout">
        <div className="llb-panel">
          <div className="llb-approval-hero">
            <div className="llb-approval-icon">
              <HiOutlineCheck className="llb-ic" aria-hidden="true" />
            </div>
            <div className="llb-approval-body">
              <strong>
                {ready ? t("approve.heroStrong") : t("approve.warn")}
              </strong>
              <span>
                {ready ? t("approve.heroCopy") : t("approve.warnBody")}
              </span>
            </div>
          </div>
          <div className="llb-approval-body">
            <div className="llb-checklist">
              <div className="llb-check-row">
                <span
                  className={
                    ready ? "llb-check-icon" : "llb-check-icon is-warn"
                  }
                >
                  <HiOutlineCheck className="llb-ic-sm" aria-hidden="true" />
                </span>
                <span>
                  <strong>
                    {t("approve.checkSlides", {
                      ready: formatNumber(
                        items.filter((item) => item.status === "ready").length,
                        locale,
                      ),
                      total: formatNumber(items.length, locale),
                    })}
                  </strong>{" "}
                  {t("approve.checkSlidesBody", {
                    slides: formatNumber(counts.slides, locale),
                    questions: formatNumber(counts.questions, locale),
                  })}
                </span>
              </div>
              <div className="llb-check-row">
                <span className={ready ? "llb-check-icon" : "llb-check-icon is-warn"}>
                  <HiOutlineCheck className="llb-ic-sm" aria-hidden="true" />
                </span>
                <span>
                  <strong>{t("approve.checkKeys")}</strong>{" "}
                  {t("approve.checkKeysBody")}
                </span>
              </div>
              <div className="llb-check-row">
                <span className={ready ? "llb-check-icon" : "llb-check-icon is-warn"}>
                  <HiOutlineCheck className="llb-ic-sm" aria-hidden="true" />
                </span>
                <span>
                  <strong>{t("approve.checkPlan")}</strong>{" "}
                  {t("approve.checkPlanBody")}
                </span>
              </div>
              <div className="llb-check-row">
                <span className={ready ? "llb-check-icon" : "llb-check-icon is-warn"}>
                  <HiOutlineCheck className="llb-ic-sm" aria-hidden="true" />
                </span>
                <span>
                  <strong>{t("approve.checkSafe")}</strong>{" "}
                  {t("approve.checkSafeBody")}
                </span>
              </div>
            </div>
            <div className="llb-contract">
              <strong>{t("approve.contract")}</strong> {t("approve.contractBody")}
            </div>
          </div>
        </div>

        <div className="llb-panel">
          <div className="llb-panel-header">
            <div>
              <h3>{t("approve.formTitle")}</h3>
              <p>{t("approve.formCopy")}</p>
            </div>
          </div>
          <div className="llb-approve-form">
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-approve-class">
                {t("approve.class")}
              </label>
              <select
                id="llb-approve-class"
                className="llb-select"
                value={form.classId}
                disabled={busy}
                onChange={(event) => onChange({ classId: event.target.value })}
              >
                <option value="">{t("approve.classPlaceholder")}</option>
                {classes.map((classItem) => (
                  <option key={classItem._id} value={classItem._id}>
                    {`${classItem.name || ""}${classItem.section ? ` · ${classItem.section}` : ""}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-approve-subject">
                {t("approve.subject")}
              </label>
              <select
                id="llb-approve-subject"
                className="llb-select"
                value={form.subjectId}
                disabled={busy || !subjectOptions.length}
                onChange={(event) => onChange({ subjectId: event.target.value })}
              >
                <option value="">{t("approve.subjectPlaceholder")}</option>
                {subjectOptions.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-approve-title">
                {t("approve.title")}
              </label>
              <input
                id="llb-approve-title"
                className="llb-input"
                dir="auto"
                value={form.title}
                maxLength={200}
                disabled={busy}
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </div>
            <div className="llb-field-block">
              <label className="llb-field-label" htmlFor="llb-approve-description">
                {t("approve.description")}{" "}
                <span className="llb-form-note">{t("approve.optional")}</span>
              </label>
              <input
                id="llb-approve-description"
                className="llb-input"
                value={form.description}
                maxLength={1000}
                disabled={busy}
                placeholder={t("approve.descriptionPlaceholder")}
                onChange={(event) => onChange({ description: event.target.value })}
              />
            </div>
            <label className="llb-approve-check">
              <input
                type="checkbox"
                checked={form.answersChecked}
                disabled={busy}
                onChange={(event) =>
                  onChange({ answersChecked: event.target.checked })
                }
              />
              <span>
                <strong>{t("approve.checkboxStrong")}</strong>
                <br />
                {t("approve.checkboxBody")}
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="llb-footer">
        <div className="llb-footer-context">
          <div className="llb-footer-line">
            <HiOutlineCheck className="llb-ic-sm llb-footer-check" aria-hidden="true" />
            <strong>{t("approve.readyLine")}</strong>
            <span>· {t("approve.readyLineBody")}</span>
          </div>
          <div className="llb-footer-hint">{t("approve.readyHint")}</div>
        </div>
        <div className="llb-footer-actions">
          <button
            type="button"
            className="llb-btn llb-btn-secondary"
            disabled={busy}
            onClick={onBack}
          >
            <HiOutlineArrowLeft className="llb-ic-sm llb-arrow" aria-hidden="true" />
            {t("approve.back")}
          </button>
          <button
            type="button"
            className="llb-btn llb-btn-primary"
            disabled={!canSubmit || Boolean(missing)}
            title={missing ? t(missing) : undefined}
            onClick={onSubmit}
          >
            {busy ? t("approve.saving") : t("approve.submit")}
          </button>
        </div>
      </div>
    </section>
  );
};

export default BuilderApproveStep;
