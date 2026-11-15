import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineArrowLeft, HiOutlineCheckCircle, HiOutlineChatBubbleLeftRight } from "react-icons/hi2";
import supportStudentService from "../../../../services/supportStudentService.js";
import SurveyForm from "../../../../components/support/SurveyForm.jsx";
import ErrorBanner from "../../../../components/shared/ErrorBanner.jsx";
import { dateLabel, dueLabel, errorText, isOverdue } from "../../../../components/support/supportUi.js";
import "./StudentSupportPage.css";

const finished = (survey) => survey.status === "submitted" || survey.status === "skipped";

const StudentSupportPage = () => {
  const { t, i18n } = useTranslation("support");
  const arabic = String(i18n.language || "").startsWith("ar");

  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openSurvey, setOpenSurvey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await supportStudentService.listSurveys();
      setSurveys(data.surveys || []);
      setLoadError(false);
    } catch (error) {
      if (error?.response?.status === 403) setDisabled(true);
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = (surveyId, next) => {
    setSurveys((current) => current.map((row) => (row.id === surveyId ? { ...row, ...next } : row)));
    setOpenSurvey((current) => (current && current.id === surveyId ? { ...current, ...next } : current));
  };

  const open = async (surveyId) => {
    setBusy(true);
    try {
      const survey = await supportStudentService.getSurvey(surveyId);
      setOpenSurvey(survey);
      if (survey.status === "opened") patch(surveyId, { status: "opened" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(errorText(error, t("errors.loadReview")));
    } finally {
      setBusy(false);
    }
  };

  const save = async (answers) => {
    setBusy(true);
    try {
      const saved = await supportStudentService.saveSurvey(openSurvey.id, answers, openSurvey.revision);
      patch(openSurvey.id, { revision: saved.revision, lastSavedAt: saved.lastSavedAt });
      toast.success(t("survey.saved"));
    } catch (error) {
      toast.error(errorText(error, t("survey.saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (answers) => {
    setBusy(true);
    try {
      await supportStudentService.submitSurvey(openSurvey.id, answers, openSurvey.revision);
      patch(openSurvey.id, { status: "submitted" });
      toast.success(t("survey.submitted"));
    } catch (error) {
      toast.error(errorText(error, t("survey.submitFailed")));
    } finally {
      setBusy(false);
    }
  };

  const markNoConcerns = async () => {
    setBusy(true);
    try {
      await supportStudentService.noConcerns(openSurvey.id);
      patch(openSurvey.id, { status: "submitted", noConcerns: true });
      toast.success(t("survey.noConcernsSaved"));
    } catch (error) {
      toast.error(errorText(error, t("survey.submitFailed")));
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      await supportStudentService.skipSurvey(openSurvey.id);
      patch(openSurvey.id, { status: "skipped" });
      toast.success(t("survey.skipped"));
    } catch (error) {
      toast.error(errorText(error, t("survey.submitFailed")));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="student-support"><div className="loading-container"><div className="spinner" /></div></div>;
  }

  if (disabled) {
    return (
      <div className="student-support" dir={arabic ? "rtl" : "ltr"}>
        <div className="student-support-empty">
          <HiOutlineChatBubbleLeftRight size={38} />
          <h2>{t("student.disabledTitle")}</h2>
          <p>{t("student.disabledBody")}</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="student-support" dir={arabic ? "rtl" : "ltr"}>
        <ErrorBanner message={t("student.loadFailed")} onRetry={() => { setLoading(true); load(); }} retryLabel={t("common.retry")} />
      </div>
    );
  }

  if (openSurvey) {
    return (
      <div className="student-support" dir={arabic ? "rtl" : "ltr"}>
        <button type="button" className="student-support-back" onClick={() => setOpenSurvey(null)}>
          <HiOutlineArrowLeft size={16} />
          {t("student.back")}
        </button>
        <header className="student-support-head">
          <h1>{t("student.surveyTitle")}</h1>
          <p>
            {[openSurvey.subject?.name, dueLabel(openSurvey.dueDate, i18n.language) && t("student.dueOn", { date: dueLabel(openSurvey.dueDate, i18n.language) })].filter(Boolean).join(" · ")}
          </p>
        </header>
        {finished(openSurvey) ? (
          <div className="student-support-done" role="status">
            <HiOutlineCheckCircle size={34} />
            <h2>{openSurvey.noConcerns ? t("student.noConcernsDone") : t("student.thanksTitle")}</h2>
            <p>{t("student.thanksBody")}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setOpenSurvey(null)}>
              {t("student.back")}
            </button>
          </div>
        ) : (
          <SurveyForm
            key={openSurvey.id}
            survey={openSurvey}
            saving={busy}
            submitting={busy}
            onSave={save}
            onSubmit={submit}
            onNoConcerns={markNoConcerns}
            onSkip={skip}
          />
        )}
      </div>
    );
  }

  return (
    <div className="student-support" dir={arabic ? "rtl" : "ltr"}>
      <header className="student-support-head">
        <h1>{t("student.title")}</h1>
        <p>{t("student.subtitle")}</p>
      </header>

      {surveys.length === 0 ? (
        <div className="student-support-empty">
          <HiOutlineChatBubbleLeftRight size={38} />
          <h2>{t("student.emptyTitle")}</h2>
          <p>{t("student.emptyBody")}</p>
        </div>
      ) : (
        <ul className="student-support-list">
          {surveys.map((row) => {
            const done = finished(row);
            return (
              <li key={row.id} className={`student-support-row ${done ? "is-done" : ""}`}>
                <div className="student-support-row-main">
                  <strong>{row.subject || t("student.general")}</strong>
                  <p>
                    {[
                      row.dueDate ? dueLabel(row.dueDate, i18n.language) : "",
                      row.questionCount ? t("student.questionCount", { n: row.questionCount }) : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {done && row.submittedAt && (
                    <em>{t("student.sentOn", { date: dateLabel(row.submittedAt, i18n.language) })}</em>
                  )}
                </div>
                {done ? (
                  <span className="support-chip is-done">
                    {row.status === "skipped" ? t("student.skippedChip") : t("student.sentChip")}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`btn btn-sm ${isOverdue(row.dueDate) ? "btn-primary" : "btn-secondary"}`}
                    disabled={busy}
                    onClick={() => open(row.id)}
                  >
                    {row.status === "opened" ? t("access.continue") : t("student.start")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="student-support-foot">{t("student.foot")}</p>
    </div>
  );
};

export default StudentSupportPage;
