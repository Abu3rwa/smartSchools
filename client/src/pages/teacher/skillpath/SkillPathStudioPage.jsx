import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  HiOutlineBookOpen,
  HiOutlineCheckCircle,
  HiOutlineClipboardList,
  HiOutlineCollection,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineUpload,
  HiOutlineViewGrid
} from "react-icons/hi";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import subjectService from "../../../services/subjectService";
import teacherService from "../../../services/teacherService";
import SkillPathImportDialog from "./SkillPathImportDialog";
import { TYPE_LABEL_KEY, normalizeItemType } from "./utils/skillpathAuthoring";
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

const SkillPathStudioPage = () => {
  const { t } = useFeatureNamespaces(["skillpath"]);
  const navigate = useNavigate();
  const [skills, setSkills] = useState([]);
  const [packs, setPacks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [skillForm, setSkillForm] = useState({ name: "", nameAr: "", gradeLevel: "", language: "en", subject: "" });
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [packForm, setPackForm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [assignPack, setAssignPack] = useState(null);
  const [assignForm, setAssignForm] = useState({ classIds: [], itemCount: 10, attemptsAllowed: 1, mode: "practice", shuffle: true, showAnswersAfter: true, dueDate: "" });
  const [report, setReport] = useState(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsData, packsData, assignmentsData, subjectsData] = await Promise.all([
        skillpathService.getSkills(),
        skillpathService.getPacks(),
        skillpathService.getAssignments().catch(() => ({ assignments: [] })),
        subjectService.getSubjects({ limit: "all", isActive: true }).catch(() => null)
      ]);
      setSkills(skillsData.skills || []);
      setPacks(packsData.packs || []);
      setAssignments(assignmentsData.assignments || []);
      setSubjects(subjectsData?.data?.subjects || []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t("errors.loadStudio"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    teacherService.getMyClasses()
      .then((response) => {
        const rows = response?.data?.classes || response?.classes || [];
        const byId = new Map();
        rows.forEach((row) => {
          const cls = row.class || row;
          if (cls?._id && !byId.has(String(cls._id))) byId.set(String(cls._id), cls);
        });
        setClasses(Array.from(byId.values()));
      })
      .catch(() => setClasses([]));
  }, []);

  const createSkill = async (event) => {
    event.preventDefault();
    if (!skillForm.name.trim() || duplicateSkill) return;
    try {
      const data = await skillpathService.createSkill({ ...skillForm, subject: skillForm.subject || null });
      setSkills((prev) => [data.skill, ...prev]);
      setSkillForm({ name: "", nameAr: "", gradeLevel: "", language: "en", subject: "" });
      setShowSkillForm(false);
      toast.success(t("studio.skillCreated"));
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const createPack = async (event) => {
    event.preventDefault();
    try {
      const data = await skillpathService.createPack({
        title: packForm.title,
        language: packForm.language,
        visibility: packForm.visibility,
        subject: packForm.subject || null,
        gradeLevels: packForm.gradeLevels.split(",").map((level) => level.trim()).filter(Boolean)
      });
      toast.success(t("studio.packCreated"));
      navigate(`/portal/skillpath-studio/packs/${data.pack._id}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const publish = async (pack) => {
    try {
      await skillpathService.publishPack(pack._id);
      toast.success(t("studio.published", { title: pack.title }));
      loadAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const archive = async (pack) => {
    if (!window.confirm(t("studio.confirmArchive", { title: pack.title }))) return;
    try {
      await skillpathService.archivePack(pack._id);
      toast.success(t("studio.archived"));
      loadAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const removePack = async (pack) => {
    if (!window.confirm(t("studio.confirmDeletePack", { title: pack.title }))) return;
    try {
      const result = await skillpathService.deletePack(pack._id);
      toast.success(result?.archived ? t("studio.packDeletedArchived") : t("studio.packDeleted"));
      loadAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const openReport = async (pack) => {
    try {
      const data = await skillpathService.getPackReport(pack._id);
      setReport(data);
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const openAssign = (pack) => {
    setAssignPack(pack);
    setAssignForm({
      classIds: [],
      itemCount: pack.itemCount || 10,
      attemptsAllowed: 1,
      mode: "practice",
      shuffle: true,
      showAnswersAfter: true,
      dueDate: ""
    });
  };

  const submitAssign = async (event) => {
    event.preventDefault();
    try {
      await skillpathService.createAssignment({
        packId: assignPack._id,
        classIds: assignForm.classIds,
        mode: assignForm.mode,
        settings: {
          itemCount: Number(assignForm.itemCount) || assignPack.itemCount,
          attemptsAllowed: Number(assignForm.attemptsAllowed) || 1,
          shuffle: assignForm.shuffle,
          showAnswersAfter: assignForm.showAnswersAfter,
          dueDate: assignForm.dueDate || null
        }
      });
      toast.success(t("assign.created"));
      setAssignPack(null);
      loadAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const closeAssignment = async (assignment) => {
    try {
      await skillpathService.closeAssignment(assignment._id);
      toast.success(t("assign.closed"));
      loadAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const archiveSkill = async (skill) => {
    if (!window.confirm(t("studio.confirmArchiveSkill", { name: skill.name }))) return;
    try {
      await skillpathService.updateSkill(skill._id, { status: "archived" });
      toast.success(t("studio.skillArchived"));
      if (String(skill._id) === skillFilter) setSkillFilter("");
      loadAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const removeSkill = async (skill) => {
    if (!window.confirm(t("studio.confirmDeleteSkill", { name: skill.name }))) return;
    try {
      const result = await skillpathService.deleteSkill(skill._id);
      toast.success(result?.archived ? t("studio.skillArchivedHistory") : t("studio.skillDeleted"));
      if (String(skill._id) === skillFilter) setSkillFilter("");
      loadAll();
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const normalizedSkillName = skillForm.name.trim().toLowerCase().replace(/\s+/g, " ");
  const duplicateSkill = normalizedSkillName
    ? skills.find((skill) => String(skill.name || "").trim().toLowerCase().replace(/\s+/g, " ") === normalizedSkillName
      && String(skill.gradeLevel || "").trim() === skillForm.gradeLevel.trim())
    : null;
  const activeSkill = skills.find((skill) => String(skill._id) === skillFilter) || null;
  const matchesSubject = (entry) => !subjectFilter
    || (subjectFilter === "general" ? !entry.subject : String(entry.subject) === subjectFilter);
  const visibleSkills = skills.filter(matchesSubject);
  const visiblePacks = (skillFilter
    ? packs.filter((pack) => (pack.skills || []).some((skill) => String(skill._id) === skillFilter))
    : packs).filter(matchesSubject);
  const subjectName = (subjectId) => subjects.find((subject) => String(subject._id) === String(subjectId))?.name || "";
  const publishedCount = packs.filter((pack) => pack.status === "published").length;
  const kpis = [
    { key: "skills", tone: "blue", icon: HiOutlineCollection, value: skills.length, label: t("studio.skillsTitle") },
    { key: "packs", tone: "purple", icon: HiOutlineBookOpen, value: packs.length, label: t("studio.packsTitle") },
    { key: "published", tone: "emerald", icon: HiOutlineCheckCircle, value: publishedCount, label: t("studio.status.published") },
    { key: "assignments", tone: "amber", icon: HiOutlineClipboardList, value: assignments.length, label: t("studio.assignmentsTitle") }
  ];

  return (
    <div className="sp-page sp-page--studio">
      <section className="sp-hero sp-hero--studio">
        <div className="sp-hero-main">
          <span className="sp-hero__kicker">
            <HiOutlineSparkles size={13} />
            {t("studio.title")}
          </span>
          <h2>{t("studio.subtitle")}</h2>
          <div className="sp-hero-actions">
            <button type="button" className="sp-btn" onClick={() => navigate("/portal/skillpath-studio/board")}>
              <HiOutlineViewGrid size={15} />
              {t("board.title")}
            </button>
            <button type="button" className="sp-btn" onClick={() => setShowSkillForm((prev) => !prev)}>
              <HiOutlinePlus size={15} />
              {t("studio.addSkill")}
            </button>
            <button type="button" className="sp-btn" onClick={() => setImportOpen(true)}>
              <HiOutlineUpload size={15} />
              {t("studio.importCsv")}
            </button>
            <button type="button" className="sp-btn sp-btn--primary" onClick={() => setPackForm({ title: "", language: "en", gradeLevels: "", visibility: "private", subject: "" })}>
              <HiOutlinePlus size={15} />
              {t("studio.newPack")}
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="sp-error">{error}</div> : null}

      <div className="sp-kpis">
        {kpis.map(({ key, tone, icon: Icon, value, label }) => (
          <div key={key} className={`sp-kpi is-${tone}`}>
            <span className="sp-kpi-plate" aria-hidden="true"><Icon size={18} /></span>
            <div className="sp-kpi-body">
              <div className="sp-kpi-val">{value}</div>
              <div className="sp-kpi-lab">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="sp-chipbar" role="group" aria-label={t("studio.subjectAll")}>
        <button
          type="button"
          className={`sp-chip sp-chip--btn${subjectFilter === "" ? " is-active" : ""}`}
          onClick={() => setSubjectFilter("")}
        >
          {t("studio.subjectAll")}
        </button>
        {subjects.map((subject) => (
          <button
            key={subject._id}
            type="button"
            className={`sp-chip sp-chip--btn${subjectFilter === String(subject._id) ? " is-active" : ""}`}
            onClick={() => setSubjectFilter(subjectFilter === String(subject._id) ? "" : String(subject._id))}
          >
            {subject.name}
          </button>
        ))}
        <button
          type="button"
          className={`sp-chip sp-chip--btn${subjectFilter === "general" ? " is-active" : ""}`}
          onClick={() => setSubjectFilter(subjectFilter === "general" ? "" : "general")}
        >
          {t("studio.subjectGeneral")}
        </button>
      </div>

      {showSkillForm ? (
        <form className="sp-card sp-form sp-skill-form" onSubmit={createSkill}>
          <h4>{t("studio.addSkill")}</h4>
          <div className="sp-form__row">
            <label>
              <span>{t("studio.skillName")}</span>
              <input
                value={skillForm.name}
                onChange={(event) => setSkillForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={t("studio.skillNamePlaceholder")}
                required
              />
            </label>
            <label>
              <span>{t("studio.skillNameAr")}</span>
              <input
                dir="rtl"
                value={skillForm.nameAr}
                onChange={(event) => setSkillForm((prev) => ({ ...prev, nameAr: event.target.value }))}
              />
            </label>
            <label>
              <span>{t("studio.grade")}</span>
              <input
                value={skillForm.gradeLevel}
                onChange={(event) => setSkillForm((prev) => ({ ...prev, gradeLevel: event.target.value }))}
                placeholder={t("studio.gradePlaceholder")}
              />
            </label>
            <label>
              <span>{t("studio.language")}</span>
              <select
                value={skillForm.language}
                onChange={(event) => setSkillForm((prev) => ({ ...prev, language: event.target.value }))}
              >
                <option value="en">{t("studio.langEn")}</option>
                <option value="ar">{t("studio.langAr")}</option>
                <option value="mixed">{t("studio.langMixed")}</option>
              </select>
            </label>
            <label>
              <span>{t("studio.subject")}</span>
              <select
                value={skillForm.subject}
                onChange={(event) => setSkillForm((prev) => ({ ...prev, subject: event.target.value }))}
              >
                <option value="">{t("studio.subjectGeneral")}</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>{subject.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="sp-actions">
            {duplicateSkill ? (
              <span className="sp-chip sp-chip--danger">{t("studio.duplicateSkill")}</span>
            ) : null}
            <button type="submit" className="sp-btn sp-btn--primary" disabled={!skillForm.name.trim() || Boolean(duplicateSkill)}>
              {t("studio.saveSkill")}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sp-studio-grid">
        <div className="sp-studio-main">
          <section className="sp-section">
            <div className="sp-section__head sp-section__head--rich">
              <span className="sp-sec-plate is-purple" aria-hidden="true"><HiOutlineBookOpen size={14} /></span>
              <h3>{activeSkill ? t("studio.filteringPacks", { skill: activeSkill.name }) : t("studio.packsTitle")}</h3>
              <span className="sp-count">{visiblePacks.length}</span>
              {activeSkill ? (
                <button type="button" className="sp-btn sp-btn--ghost sp-btn--sm" onClick={() => setSkillFilter("")}>
                  {t("studio.showAllPacks")}
                </button>
              ) : null}
            </div>
            {loading ? (
              <div className="sp-loading">{t("common.loading")}</div>
            ) : visiblePacks.length ? (
              <div className="sp-grid">
                {visiblePacks.map((pack) => (
                  <article key={pack._id} className="sp-card sp-card--pack">
                    <div className="sp-pack-head">
                      <span className="sp-pack-plate" aria-hidden="true"><HiOutlineBookOpen size={16} /></span>
                      <div className="sp-pack-title">
                        <h4>{pack.title}</h4>
                        <span>
                          {[pack.subject ? subjectName(pack.subject) : t("studio.subjectGeneral"), t("home.items", { count: pack.itemCount })].join(" · ")}
                        </span>
                      </div>
                      <span className={`sp-status is-${pack.status}`}>{t(`studio.status.${pack.status}`)}</span>
                    </div>
                    <div className="sp-card__meta">
                      {(pack.skills || []).map((skill) => (
                        <span key={String(skill._id)} className="sp-chip">{skill.name}</span>
                      ))}
                      {pack.itemCount === 0 ? (
                        <span className="sp-chip sp-chip--due">{t("studio.emptyPack")}</span>
                      ) : null}
                      {Object.entries(pack.itemTypeCounts || {}).map(([type, count]) => (
                        <span key={type} className="sp-chip">
                          {count} × {t(`editor.${TYPE_LABEL_KEY[normalizeItemType(type)] || "typeMcq"}`)}
                        </span>
                      ))}
                      <span className="sp-chip">
                        {pack.visibility === "school" ? t("studio.visibleSchool") : t("studio.visiblePrivate")}
                      </span>
                      {pack.revisionVersion ? (
                        <span className="sp-chip">v{pack.revisionVersion}</span>
                      ) : null}
                    </div>
                    <div className="sp-card__foot sp-pack-foot">
                      <button type="button" className="sp-btn" onClick={() => navigate(`/portal/skillpath-studio/packs/${pack._id}`)}>
                        {t("studio.edit")}
                      </button>
                      {pack.status === "draft" ? (
                        <button type="button" className="sp-btn sp-btn--primary" disabled={pack.itemCount === 0} onClick={() => publish(pack)}>
                          {t("studio.publish")}
                        </button>
                      ) : (
                        <button type="button" className="sp-btn sp-btn--primary" onClick={() => openAssign(pack)}>
                          {t("studio.assign")}
                        </button>
                      )}
                      <button type="button" className="sp-btn sp-btn--ghost" onClick={() => openReport(pack)}>
                        {t("studio.report")}
                      </button>
                      <button type="button" className="sp-btn sp-btn--ghost" onClick={() => archive(pack)}>
                        {t("studio.archive")}
                      </button>
                      <button type="button" className="sp-btn sp-btn--danger" onClick={() => removePack(pack)}>
                        {t("studio.deletePack")}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="sp-empty">{activeSkill ? t("studio.noPacksForSkill") : t("studio.noPacks")}</div>
            )}
          </section>
        </div>

        <aside className="sp-studio-rail">
          <section className="sp-section">
            <div className="sp-section__head sp-section__head--rich">
              <span className="sp-sec-plate is-amber" aria-hidden="true"><HiOutlineClipboardList size={14} /></span>
              <h3>{t("studio.assignmentsTitle")}</h3>
              <span className="sp-count">{assignments.length}</span>
            </div>
            {assignments.length ? (
              <div className="sp-card sp-rail-list">
                {assignments.map((assignment) => (
                  <div key={assignment._id} className="sp-skill-row">
                    <div className="sp-skill-row__name">
                      <strong>{assignment.packTitle || t("home.untitledPack")}</strong>
                      <span>
                        {t("studio.assignmentMeta", {
                          students: assignment.studentCount,
                          completed: assignment.completed,
                          sessions: assignment.sessions
                        })}
                      </span>
                    </div>
                    <span className={`sp-chip ${assignment.status === "closed" ? "" : "sp-chip--done"}`}>
                      {t(`studio.assignmentStatus.${assignment.status}`)}
                    </span>
                    {assignment.status === "open" ? (
                      <button type="button" className="sp-btn sp-btn--ghost sp-btn--sm" onClick={() => closeAssignment(assignment)}>
                        {t("studio.close")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="sp-empty">{t("studio.noAssignments")}</div>
            )}
          </section>

          <section className="sp-section">
            <div className="sp-section__head sp-section__head--rich">
              <span className="sp-sec-plate is-blue" aria-hidden="true"><HiOutlineCollection size={14} /></span>
              <h3>{t("studio.skillsTitle")}</h3>
              <span className="sp-count">{visibleSkills.length}</span>
            </div>
            <p className="sp-play__foot-note" style={{ marginTop: 0 }}>{t("studio.skillsNote")}</p>
            {visibleSkills.length ? (
              <div className="sp-card sp-rail-list">
                {visibleSkills.map((skill) => {
                  const selected = String(skill._id) === skillFilter;
                  return (
                    <div key={skill._id} className={`sp-skill-row${selected ? " is-active" : ""}`}>
                      <div className="sp-skill-row__name">
                        <strong>{skill.name}</strong>
                        <span>
                          {[
                            skill.subject ? subjectName(skill.subject) : t("studio.subjectGeneral"),
                            skill.gradeLevel ? `${t("studio.grade")} ${skill.gradeLevel}` : "",
                            skill.nameAr
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <span className="sp-chip">
                        {t("studio.skillUsage", { packs: skill.packCount || 0, items: skill.itemCount || 0 })}
                      </span>
                      <button
                        type="button"
                        className="sp-btn sp-btn--sm"
                        onClick={() => setSkillFilter(selected ? "" : String(skill._id))}
                      >
                        {selected ? t("studio.showAllPacks") : t("studio.showPacks")}
                      </button>
                      <button
                        type="button"
                        className="sp-btn sp-btn--sm"
                        onClick={() => archiveSkill(skill)}
                      >
                        {t("studio.archiveSkill")}
                      </button>
                      <button
                        type="button"
                        className="sp-btn sp-btn--danger sp-btn--sm"
                        onClick={() => removeSkill(skill)}
                      >
                        {t("studio.deleteSkill")}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="sp-empty">{t("studio.noSkills")}</div>
            )}
          </section>
        </aside>
      </div>

      {packForm ? (
        <Modal title={t("studio.newPack")} onClose={() => setPackForm(null)}>
          <form className="sp-form" onSubmit={createPack}>
            <label>
              <span>{t("studio.packTitle")}</span>
              <input
                value={packForm.title}
                onChange={(event) => setPackForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder={t("studio.packTitlePlaceholder")}
                required
                autoFocus
              />
            </label>
            <label>
              <span>{t("studio.gradeLevels")}</span>
              <input
                value={packForm.gradeLevels}
                onChange={(event) => setPackForm((prev) => ({ ...prev, gradeLevels: event.target.value }))}
                placeholder="5, 6"
              />
            </label>
            <label>
              <span>{t("studio.language")}</span>
              <select value={packForm.language} onChange={(event) => setPackForm((prev) => ({ ...prev, language: event.target.value }))}>
                <option value="en">{t("studio.langEn")}</option>
                <option value="ar">{t("studio.langAr")}</option>
                <option value="mixed">{t("studio.langMixed")}</option>
              </select>
            </label>
            <label>
              <span>{t("studio.visibility")}</span>
              <select value={packForm.visibility} onChange={(event) => setPackForm((prev) => ({ ...prev, visibility: event.target.value }))}>
                <option value="private">{t("studio.visiblePrivate")}</option>
                <option value="school">{t("studio.visibleSchool")}</option>
              </select>
            </label>
            <label>
              <span>{t("studio.subject")}</span>
              <select value={packForm.subject} onChange={(event) => setPackForm((prev) => ({ ...prev, subject: event.target.value }))}>
                <option value="">{t("studio.subjectGeneral")}</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <div className="sp-actions">
              <button type="button" className="sp-btn" onClick={() => setPackForm(null)}>{t("common.cancel")}</button>
              <button type="submit" className="sp-btn sp-btn--primary">{t("studio.createPack")}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {importOpen ? (
        <Modal title={t("import.title")} onClose={() => setImportOpen(false)} wide>
          <SkillPathImportDialog
            skills={skills}
            packs={packs}
            subjects={subjects}
            defaultSkillId={skillFilter}
            onClose={() => setImportOpen(false)}
            onImported={() => { setImportOpen(false); loadAll(); }}
          />
        </Modal>
      ) : null}

      {assignPack ? (
        <Modal title={t("assign.title", { title: assignPack.title })} onClose={() => setAssignPack(null)}>
          <form className="sp-form" onSubmit={submitAssign}>
            <label>
              <span>{t("assign.classes")}</span>
              {classes.length ? (
                <div className="sp-check-list">
                  {classes.map((cls) => (
                    <label key={cls._id} className="sp-check">
                      <input
                        type="checkbox"
                        checked={assignForm.classIds.includes(cls._id)}
                        onChange={(event) => setAssignForm((prev) => ({
                          ...prev,
                          classIds: event.target.checked
                            ? [...prev.classIds, cls._id]
                            : prev.classIds.filter((id) => id !== cls._id)
                        }))}
                      />
                      <span>{cls.name}{cls.section ? ` ${cls.section}` : ""}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <span className="sp-play__foot-note">{t("assign.noClasses")}</span>
              )}
            </label>
            <div className="sp-form__row">
              <label>
                <span>{t("assign.mode")}</span>
                <select value={assignForm.mode} onChange={(event) => setAssignForm((prev) => ({ ...prev, mode: event.target.value }))}>
                  <option value="practice">{t("home.modePractice")}</option>
                  <option value="quiz">{t("home.modeQuiz")}</option>
                </select>
              </label>
              <label>
                <span>{t("assign.itemCount")}</span>
                <input
                  type="number"
                  min="1"
                  max={assignPack.itemCount}
                  value={assignForm.itemCount}
                  onChange={(event) => setAssignForm((prev) => ({ ...prev, itemCount: event.target.value }))}
                />
              </label>
              <label>
                <span>{t("assign.attempts")}</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={assignForm.attemptsAllowed}
                  onChange={(event) => setAssignForm((prev) => ({ ...prev, attemptsAllowed: event.target.value }))}
                />
              </label>
              <label>
                <span>{t("assign.dueDate")}</span>
                <input
                  type="date"
                  value={assignForm.dueDate}
                  onChange={(event) => setAssignForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </label>
            </div>
            <label className="sp-check">
              <input
                type="checkbox"
                checked={assignForm.showAnswersAfter}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, showAnswersAfter: event.target.checked }))}
              />
              <span>{t("assign.showAnswers")}</span>
            </label>
            <label className="sp-check">
              <input
                type="checkbox"
                checked={assignForm.shuffle}
                onChange={(event) => setAssignForm((prev) => ({ ...prev, shuffle: event.target.checked }))}
              />
              <span>{t("assign.shuffle")}</span>
            </label>
            <div className="sp-actions">
              <button type="button" className="sp-btn" onClick={() => setAssignPack(null)}>{t("common.cancel")}</button>
              <button type="submit" className="sp-btn sp-btn--primary" disabled={assignForm.classIds.length === 0}>
                {t("assign.create")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {report ? (
        <Modal title={t("report.title", { title: report.pack?.title || "" })} onClose={() => setReport(null)} wide>
          <div className="sp-actions" style={{ marginBottom: 10 }}>
            <span className="sp-chip">{t("report.assignments", { count: report.assignmentCount })}</span>
            <span className="sp-chip">{t("home.items", { count: report.pack?.itemCount || 0 })}</span>
          </div>
          {report.rows?.length ? (
            <div className="sp-scroll">
              <table className="sp-table">
                <thead>
                  <tr>
                    <th>{t("report.student")}</th>
                    <th>{t("report.sessions")}</th>
                    <th>{t("report.answered")}</th>
                    <th>{t("report.accuracy")}</th>
                    <th>{t("report.firstTry")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.studentId}>
                      <td>{row.name}</td>
                      <td>{row.sessions}</td>
                      <td>{row.answered}</td>
                      <td>{row.accuracy === null ? "—" : `${row.accuracy}%`}</td>
                      <td>{row.firstAttemptCorrect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sp-empty">{t("report.empty")}</div>
          )}
          <p className="sp-play__foot-note">{t("report.note")}</p>
        </Modal>
      ) : null}
    </div>
  );
};

export default SkillPathStudioPage;
