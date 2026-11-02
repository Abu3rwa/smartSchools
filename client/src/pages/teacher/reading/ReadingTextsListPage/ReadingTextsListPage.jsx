import { useMemo, useState } from "react";
import { Menu, MenuItem } from "@mui/material";
import {
  HiOutlineArrowLeft,
  HiOutlineCalendar,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineDocumentAdd,
  HiOutlineDotsVertical,
  HiOutlineFolderOpen,
  HiOutlineSelector,
  HiOutlineUserGroup,
  HiOutlineBookOpen,
  HiOutlineSearch,
  HiOutlineVolumeUp,
  HiOutlineSparkles,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { selectUser } from "../../../../store/slices/authSlice.js";
import { useReadingTextsListData } from "./hooks/useReadingTextsListData.js";
import { fetchTexts } from "../../../../store/slices/readingSlice.js";
import readingService from "../../../../services/readingService.js";
import ReadingCsvImportPanel from "./ReadingCsvImportPanel.jsx";
import ReadingEditorModal from "./ReadingEditorModal.jsx";
import ModelAudioPreview from "../ModelAudioPreview.jsx";
import {
  filterReadings,
  nextSort,
  readingLevelTargets,
  readingOwnerName,
  readingQuestionCounts,
  readingSummary,
  sortReadings,
} from "./readingTablePresentation.js";
import toast from "react-hot-toast";
import "../readingTable.css";
import "./ReadingTextsListPage.css";

const COLUMNS = [
  { key: "reading", className: "reading-col-reading" },
  { key: "difficulty", className: "reading-col-levels" },
  { key: "levels", className: "reading-col-levels" },
  { key: "questions", className: "reading-col-optional" },
  { key: "assignments", className: "reading-cell-number" },
  { key: "sharing", className: "reading-col-optional" },
  { key: "added", className: "reading-col-optional" },
  { key: "actions", className: "reading-cell-actions", sortable: false },
];

export default function ReadingTextsListPage() {
  const { t, i18n } = useTranslation(["reading"]);
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const data = useReadingTextsListData();
  const [editingReading, setEditingReading] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "added", direction: "desc" });
  const [menu, setMenu] = useState({ anchorEl: null, text: null });
  const {
    texts,
    classes,
    academicYear,
    loading,
    assignModal,
    assignClassId,
    setAssignClassId,
    assignDueDate,
    setAssignDueDate,
    assignInstructions,
    setAssignInstructions,
    assignPublished,
    setAssignPublished,
    assignPublishAt,
    setAssignPublishAt,
    assignSubmitting,
    openAssignModal,
    closeAssignModal,
    handleAssignSubmit,
    assignmentCountByText,
    readingGate,
    enableReadingGate,
    disableReadingGate,
    setReadingGateField,
    fluency,
    fluencyAvailable,
    enableFluency,
    disableFluency,
    toggleFluencyPart,
    setFluencyField,
    coverage,
    coverageParts,
    coverageLoading,
    coverageError,
    selectedCoverage,
    generatingAudio,
    audioProgress,
    cancelAudioGeneration,
    generateSelectedAudio,
    onBack,
    onUpload,
    onResults,
  } = data;

  const formatDate = (value) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(i18n.language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatCents = (value) => {
    const cents = Number(value) || 0;
    return cents >= 1 ? Math.round(cents) : Math.round(cents * 100) / 100;
  };

  const visibleReadings = useMemo(() => sortReadings(
    filterReadings(texts, search),
    sort.key,
    sort.direction,
    assignmentCountByText,
  ), [texts, search, sort, assignmentCountByText]);

  const summary = useMemo(
    () => readingSummary(filterReadings(texts, search), assignmentCountByText),
    [texts, search, assignmentCountByText],
  );

  const closeMenu = () => setMenu({ anchorEl: null, text: null });

  const runFromMenu = (action, text) => {
    closeMenu();
    action(text);
  };
  const handleSharingChange = async (text) => {
    try {
      await readingService.updateTextSharing(text._id, !text.isShared);
      await dispatch(fetchTexts());
      toast.success(text.isShared ? t("reading:texts.shareDisabled") : t("reading:texts.shareEnabled"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("reading:texts.sharingFailed"));
    }
  };
  const canManage = (text) => user?.role === "admin"
    || String(text.createdBy?._id || text.createdBy || "") === String(user?._id || "");
  const handleEdit = async (text) => {
    setEditorLoading(true);
    try {
      const response = await readingService.getTextById(text._id);
      setEditingReading(response.data?.data);
    } catch (error) {
      toast.error(error.response?.data?.message || t("reading:texts.editFailed"));
    } finally {
      setEditorLoading(false);
    }
  };
  const handleSave = async (payload) => {
    setEditorSaving(true);
    try {
      await readingService.updateText(editingReading._id, payload);
      setEditingReading(null);
      await dispatch(fetchTexts());
      toast.success(t("reading:texts.editSuccess"));
    } finally {
      setEditorSaving(false);
    }
  };
  const handleDelete = async (text) => {
    if (!window.confirm(t("reading:texts.deleteConfirm", { title: text.title }))) return;
    try {
      await readingService.deleteText(text._id);
      await dispatch(fetchTexts());
      toast.success(t("reading:texts.deleteSuccess"));
    } catch (error) {
      toast.error(error.response?.data?.message || t("reading:texts.deleteFailed"));
    }
  };

  return (
    <div className="reading-texts-list-page">
      <div className="page-header-row">
        <div className="page-header">
          <button type="button" className="reading-back" onClick={onBack}>
            <HiOutlineArrowLeft size={15} aria-hidden="true" />
            {t("reading:common.back")}
          </button>
          <h1>{t("reading:texts.title")}</h1>
          <p className="text-muted">
            {t("reading:texts.subtitle")}
            {academicYear && (
              <span className="reading-year-chip">
                <HiOutlineCalendar size={13} aria-hidden="true" />
                {t("reading:texts.academicYearChip", { year: academicYear })}
              </span>
            )}
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onResults()}>
            <HiOutlineFolderOpen size={18} />
            {t("reading:texts.results")}
          </button>
          <button type="button" className="btn btn-primary" onClick={onUpload}>
            <HiOutlineDocumentAdd size={18} />
            {t("reading:texts.uploadText")}
          </button>
        </div>
      </div>

      <ReadingCsvImportPanel onImported={() => dispatch(fetchTexts())} />

      {loading && texts.length === 0 ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : texts.length === 0 ? (
        <div className="reading-empty">
          <HiOutlineBookOpen size={48} className="empty-icon" />
          <h3>{t("reading:texts.emptyTitle")}</h3>
          <p>{t("reading:texts.emptySubtitle")}</p>
          <button type="button" className="btn btn-primary" onClick={onUpload}>
            {t("reading:texts.uploadText")}
          </button>
        </div>
      ) : (
        <>
          <div className="reading-library-bar">
            <div className="reading-summary-strip reading-stats">
              <div>
                <span className="strip-value">{summary.total}</span>
                <span className="strip-label">{t("reading:texts.statsReadings")}</span>
              </div>
              <div>
                <span className="strip-value">{summary.assigned}</span>
                <span className="strip-label">{t("reading:texts.statsAssigned")}</span>
              </div>
              <div>
                <span className="strip-value">{summary.shared}</span>
                <span className="strip-label">{t("reading:texts.statsShared")}</span>
              </div>
            </div>
            <label className="reading-search">
              <HiOutlineSearch size={16} aria-hidden="true" />
              <span className="reading-sr-only">{t("reading:texts.searchLabel")}</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("reading:texts.searchPlaceholder")}
              />
            </label>
          </div>

          {visibleReadings.length === 0 ? (
            <div className="reading-empty">
              <HiOutlineSearch size={40} className="empty-icon" />
              <h3>{t("reading:texts.noMatchesTitle")}</h3>
              <p>{t("reading:texts.noMatchesSubtitle")}</p>
            </div>
          ) : (
            <div className="reading-table-card">
              <div className="reading-table-wrap">
                <table className="reading-table">
                  <caption className="reading-sr-only">{t("reading:texts.tableCaption")}</caption>
                  <thead>
                    <tr>
                      {COLUMNS.map((column) => {
                        const isSorted = column.sortable !== false && sort.key === column.key;
                        return (
                          <th
                            key={column.key}
                            className={column.className}
                            scope="col"
                            aria-sort={isSorted
                              ? (sort.direction === "asc" ? "ascending" : "descending")
                              : undefined}
                          >
                            {column.sortable === false ? (
                              <span className="reading-th-label">{t(`reading:texts.columns.${column.key}`)}</span>
                            ) : (
                              <button
                                type="button"
                                className={`reading-sort${isSorted ? " is-active" : ""}`}
                                onClick={() => setSort((current) => nextSort(current, column.key))}
                              >
                                <span>{t(`reading:texts.columns.${column.key}`)}</span>
                                {isSorted ? (sort.direction === "asc"
                                  ? <HiOutlineChevronUp size={14} aria-hidden="true" />
                                  : <HiOutlineChevronDown size={14} aria-hidden="true" />)
                                  : <HiOutlineSelector size={12} className="reading-sort-hint" aria-hidden="true" />}
                              </button>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReadings.map((text) => {
                      const levels = readingLevelTargets(text);
                      const { objective, thinking } = readingQuestionCounts(text);
                      const assigned = assignmentCountByText(text._id);
                      const owner = readingOwnerName(text);
                      const mine = canManage(text);
                      return (
                        <tr key={text._id}>
                          <td className="reading-col-reading">
                            <div className="reading-title-cell">
                              <span className="reading-title">{text.title}</span>
                              <span className="reading-tags">
                                {text.subjectArea || t("reading:texts.noSubjectSpecified")}
                                {(text.topicTags || []).slice(0, 3).map((tag) => (
                                  <em key={tag}>{tag}</em>
                                ))}
                              </span>
                            </div>
                          </td>
                          <td className="reading-col-levels">
                            {text.originalComplexity != null ? (
                              <span className="reading-pill">
                                {t("reading:texts.gradeShort", { level: text.originalComplexity })}
                              </span>
                            ) : <span className="reading-dash">—</span>}
                          </td>
                          <td className="reading-col-levels">
                            {levels.length > 0 ? (
                              <span className="reading-levels-cell">
                                {levels.map((level) => (
                                  <span key={level} className="reading-pill is-soft">{level}</span>
                                ))}
                              </span>
                            ) : (
                              <span className="reading-pill is-muted">{t("reading:texts.singleLevel")}</span>
                            )}
                          </td>
                          <td className="reading-col-optional">
                            <span className={objective ? "reading-pill is-soft" : "reading-pill is-warning"}>
                              {objective || t("reading:texts.noQuestions")}
                            </span>
                            {thinking > 0 && (
                              <span className="reading-sub">
                                {t("reading:texts.openEndedCount", { total: thinking })}
                              </span>
                            )}
                          </td>
                          <td className="reading-cell-number">
                            <span className={`reading-count${assigned ? "" : " is-empty"}`}>{assigned}</span>
                          </td>
                          <td className="reading-col-optional">
                            <span className={`reading-badge ${text.isShared ? "is-shared" : "is-private"}`}>
                              {text.isShared ? t("reading:texts.sharedShort") : t("reading:texts.private")}
                            </span>
                            {!mine && owner && (
                              <span className="reading-sub">
                                {t("reading:texts.byAuthor", { name: owner })}
                              </span>
                            )}
                          </td>
                          <td className="reading-col-optional reading-cell-date">{formatDate(text.createdAt)}</td>
                          <td className="reading-cell-actions">
                            <div className="reading-row-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => openAssignModal(text)}
                              >
                                <HiOutlineUserGroup size={16} aria-hidden="true" />
                                {t("reading:texts.assign")}
                              </button>
                              <button
                                type="button"
                                className="reading-kebab"
                                aria-label={t("reading:texts.rowMenuAria", { title: text.title })}
                                aria-haspopup="menu"
                                aria-expanded={menu.text?._id === text._id}
                                onClick={(event) => setMenu({ anchorEl: event.currentTarget, text })}
                              >
                                <HiOutlineDotsVertical size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Menu
            open={Boolean(menu.anchorEl)}
            anchorEl={menu.anchorEl}
            onClose={closeMenu}
            slotProps={{ paper: { className: "reading-row-menu" } }}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {menu.text && (
              <>
                <MenuItem onClick={() => runFromMenu(openAssignModal, menu.text)}>
                  {t("reading:texts.assign")}
                </MenuItem>
                <MenuItem onClick={() => runFromMenu((text) => onResults(text._id), menu.text)}>
                  {t("reading:texts.viewResults")}
                </MenuItem>
                {canManage(menu.text) && (
                  <>
                    <MenuItem disabled={editorLoading} onClick={() => runFromMenu(handleEdit, menu.text)}>
                      {t("reading:texts.editReading")}
                    </MenuItem>
                    <MenuItem onClick={() => runFromMenu(handleSharingChange, menu.text)}>
                      {menu.text.isShared ? t("reading:texts.stopSharing") : t("reading:texts.shareReading")}
                    </MenuItem>
                    <MenuItem className="is-danger" onClick={() => runFromMenu(handleDelete, menu.text)}>
                      {t("reading:texts.deleteReading")}
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </Menu>
        </>
      )}

      {assignModal && (
        <div className="modal-overlay" onClick={closeAssignModal}>
          <div
            className="modal-content reading-assign-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("reading:texts.assignTitle", { title: assignModal.title })}</h3>
            <form onSubmit={handleAssignSubmit}>
              <div className="form-group">
                <label htmlFor="assign-class">{t("reading:texts.assignClass")}</label>
                <select
                  id="assign-class"
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  required
                >
                  <option value="">{t("reading:texts.selectClass")}</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="assign-due">{t("reading:texts.dueDateOptional")}</label>
                <input
                  id="assign-due"
                  type="date"
                  value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)}
                />
              </div>

              <div className="fluency-toggle-row">
                <div>
                  <strong>{t("reading:texts.publish.toggleTitle")}</strong>
                  <p>{t("reading:texts.publish.toggleHint")}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={assignPublished}
                  className={`reading-switch${assignPublished ? " is-on" : ""}`}
                  onClick={() => setAssignPublished((current) => !current)}
                >
                  <span>
                    {assignPublished
                      ? t("reading:texts.publish.on")
                      : t("reading:texts.publish.off")}
                  </span>
                  <span className="reading-switch-track" aria-hidden="true">
                    <span className="reading-switch-thumb" />
                  </span>
                </button>
              </div>

              {assignPublished && (
                <div className="form-group">
                  <label htmlFor="assign-publish-at">
                    {t("reading:texts.publish.publishOn")}
                  </label>
                  <input
                    id="assign-publish-at"
                    type="datetime-local"
                    value={assignPublishAt}
                    onChange={(e) => setAssignPublishAt(e.target.value)}
                  />
                  <small>{t("reading:texts.publish.publishHint")}</small>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="assign-instructions">{t("reading:texts.instructionsOptional")}</label>
                <textarea
                  id="assign-instructions"
                  value={assignInstructions}
                  onChange={(e) => setAssignInstructions(e.target.value)}
                  rows={3}
                  placeholder={t("reading:texts.instructionsPlaceholder")}
                />
              </div>

              <div className="fluency-toggle-row">
                <div>
                  <strong>{t("reading:texts.gate.toggleTitle")}</strong>
                  <p>{t("reading:texts.gate.toggleHint")}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(readingGate)}
                  className={`reading-switch${readingGate ? " is-on" : ""}`}
                  onClick={() => (readingGate ? disableReadingGate() : enableReadingGate())}
                >
                  <span>{readingGate
                    ? t("reading:texts.gate.on")
                    : t("reading:texts.gate.off")}</span>
                  <span className="reading-switch-track" aria-hidden="true">
                    <span className="reading-switch-thumb" />
                  </span>
                </button>
              </div>

              {readingGate && (
                <div className="fluency-section">
                  <div className="fluency-fields">
                    <label>
                      <span>{t("reading:texts.gate.lockScope")}</span>
                      <select
                        value={readingGate.lockScope}
                        onChange={(e) => setReadingGateField("lockScope", e.target.value)}
                      >
                        <option value="quiz_and_thinking">
                          {t("reading:texts.gate.scopeBoth")}
                        </option>
                        <option value="quiz">
                          {t("reading:texts.gate.scopeQuiz")}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>{t("reading:texts.gate.minSeconds")}</span>
                      <input
                        type="number"
                        min="0"
                        max="1800"
                        value={readingGate.minReadSeconds}
                        placeholder={t("reading:texts.gate.auto")}
                        onChange={(e) => setReadingGateField("minReadSeconds", e.target.value)}
                      />
                      <small>{t("reading:texts.gate.autoHint")}</small>
                    </label>
                  </div>
                </div>
              )}

              <div className={`fluency-toggle-row${fluencyAvailable ? "" : " is-disabled"}`}>
                <div>
                  <strong>{t("reading:texts.fluency.toggleTitle")}</strong>
                  <p>
                    {fluencyAvailable
                      ? t("reading:texts.fluency.toggleHint")
                      : t("reading:texts.fluency.englishOnly")}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(fluency)}
                  className={`reading-switch${fluency ? " is-on" : ""}`}
                  onClick={() => (fluency ? disableFluency() : enableFluency())}
                  disabled={!fluencyAvailable}
                >
                  <span>{fluency
                    ? t("reading:texts.fluency.on")
                    : t("reading:texts.fluency.off")}</span>
                  <span className="reading-switch-track" aria-hidden="true">
                    <span className="reading-switch-thumb" />
                  </span>
                </button>
              </div>

              {fluency && (
                <div className="fluency-section">
                  <div className="fluency-section-heading">
                    <span>{t("reading:texts.fluency.partsHeading")}</span>
                    <span className="reading-sub">
                      {t("reading:texts.fluency.partsSelected", { n: fluency.parts.length })}
                    </span>
                  </div>
                  {coverageLoading ? (
                    <p className="fluency-dialog-note">{t("reading:texts.fluency.coverageLoading")}</p>
                  ) : coverageError ? (
                    <p className="fluency-dialog-note is-error">{coverageError}</p>
                  ) : coverageParts.length === 0 ? (
                    <p className="fluency-dialog-note">{t("reading:texts.fluency.noParts")}</p>
                  ) : (
                    <ul className="fluency-part-list">
                      {coverageParts.map((part, index) => (
                        <li key={part.key} className={part.isList ? "is-list" : undefined}>
                          <label>
                            <input
                              type="checkbox"
                              checked={fluency.parts.includes(part.key)}
                              onChange={() => toggleFluencyPart(part.key)}
                            />
                            <span className="fluency-part-title">
                              {part.title || t("reading:texts.fluency.partFallback", { n: index + 1 })}
                            </span>
                            <span className="fluency-part-words">
                              {part.wordCountMin === part.wordCountMax
                                ? t("reading:texts.fluency.partWords", { words: part.wordCountMax })
                                : t("reading:texts.fluency.partWordsRange", {
                                  min: part.wordCountMin,
                                  max: part.wordCountMax,
                                })}
                            </span>
                          </label>
                          {part.isList && (
                            <p className="fluency-part-note">{t("reading:texts.fluency.listPartNote")}</p>
                          )}
                          {part.wordCountMax > 250 && (
                            <p className="fluency-part-note is-warning">
                              {t("reading:texts.fluency.longPartNote")}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="fluency-fields">
                    <label>
                      <span>{t("reading:texts.fluency.minReadings")}</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={fluency.minReadings}
                        onChange={(e) => setFluencyField("minReadings", e.target.value)}
                      />
                    </label>
                    <label>
                      <span>{t("reading:texts.fluency.maxReadings")}</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={fluency.maxReadingsPerPart}
                        onChange={(e) => setFluencyField("maxReadingsPerPart", e.target.value)}
                      />
                    </label>
                    <label>
                      <span>{t("reading:texts.fluency.targetAccuracy")}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={fluency.targetAccuracy}
                        onChange={(e) => setFluencyField("targetAccuracy", e.target.value)}
                      />
                    </label>
                    <label>
                      <span>{t("reading:texts.fluency.targetPace")}</span>
                      <input
                        type="number"
                        min="0"
                        max="400"
                        value={fluency.targetWpm}
                        placeholder={t("reading:texts.fluency.optional")}
                        onChange={(e) => setFluencyField("targetWpm", e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="fluency-check">
                    <input
                      type="checkbox"
                      checked={fluency.showPace}
                      onChange={(e) => setFluencyField("showPace", e.target.checked)}
                    />
                    {t("reading:texts.fluency.showPace")}
                  </label>
                  <label className="fluency-check">
                    <input
                      type="checkbox"
                      checked={fluency.requireListenFirst}
                      onChange={(e) => setFluencyField("requireListenFirst", e.target.checked)}
                    />
                    {t("reading:texts.fluency.requireListenFirst")}
                  </label>

                  <div className="fluency-audio">
                    <div className="fluency-audio-head">
                      <HiOutlineVolumeUp size={16} aria-hidden="true" />
                      <strong>{t("reading:texts.fluency.modelVoice")}</strong>
                    </div>
                    {coverageLoading ? (
                      <p className="fluency-dialog-note">{t("reading:texts.fluency.coverageLoading")}</p>
                    ) : coverageError ? (
                      <p className="fluency-dialog-note is-error">{coverageError}</p>
                    ) : coverage?.available === false ? (
                      <p className="fluency-dialog-note">{t("reading:texts.fluency.audioDisabled")}</p>
                    ) : selectedCoverage.blocks === 0 ? (
                      <p className="fluency-dialog-note">{t("reading:texts.fluency.choosePartsForAudio")}</p>
                    ) : selectedCoverage.missing === 0 ? (
                      <p className="fluency-dialog-note">
                        {t("reading:texts.fluency.audioReady", { total: selectedCoverage.blocks })}
                      </p>
                    ) : (
                      <p className="fluency-dialog-note">
                        {t("reading:texts.fluency.audioMissing", {
                          missing: selectedCoverage.missing,
                          total: selectedCoverage.blocks,
                          cents: formatCents(selectedCoverage.cents),
                        })}
                      </p>
                    )}
                    {selectedCoverage.ready.length > 0 && (
                      <ModelAudioPreview
                        textId={assignModal?._id}
                        parts={selectedCoverage.ready}
                      />
                    )}
                    {coverage?.available !== false && selectedCoverage.missing > 0 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={generateSelectedAudio}
                        disabled={generatingAudio}
                      >
                        <HiOutlineSparkles size={16} aria-hidden="true" />
                        {generatingAudio
                          ? t("reading:texts.fluency.generating")
                          : t("reading:texts.fluency.generate")}
                      </button>
                    )}
                    {generatingAudio && audioProgress && (
                      <div className="fluency-audio-progress">
                        <progress
                          className="fluency-audio-bar"
                          max={audioProgress.total || 1}
                          value={audioProgress.done}
                          aria-label={t("reading:texts.fluency.audioProgress", {
                            done: audioProgress.done,
                            total: audioProgress.total,
                          })}
                        />
                        <span>
                          {t("reading:texts.fluency.audioProgress", {
                            done: audioProgress.done,
                            total: audioProgress.total,
                          })}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={cancelAudioGeneration}
                        >
                          {t("reading:common.cancel")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeAssignModal}
                >
                  {t("reading:common.cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignSubmitting || generatingAudio}
                >
                  {assignSubmitting ? t("reading:common.creating") : t("reading:texts.createAssignment")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editingReading && (
        <ReadingEditorModal
          key={editingReading._id}
          reading={editingReading}
          saving={editorSaving}
          onClose={() => setEditingReading(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
