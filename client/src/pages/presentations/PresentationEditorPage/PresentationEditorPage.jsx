import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineArrowLeft,
  HiOutlinePlayCircle,
  HiOutlineDocumentArrowDown,
  HiOutlinePencilSquare,
  HiOutlineSparkles,
  HiOutlineArrowsUpDown,
  HiOutlineCheckCircle,
} from "react-icons/hi2";

import {
  fetchPresentation,
  updatePresentation,
  updateSlide,
  patchSlide,
  applyLayoutToSlide,
  regenerateSlide,
  textAssistSlide,
  reorderSlides,
  fetchComments,
  addComment,
  resolveComment,
  deleteComment,
  clearCurrent,
} from "../../../store/slices/presentationSlice";
import presentationService from "../../../services/presentationService";
import SlideRenderer from "../../../components/presentations/SlideRenderer";
import {
  DEFAULT_PRESENTATION_LAYOUT_SYSTEM,
  PRESENTATION_LAYOUT_SYSTEMS,
} from "../shared/presentationLayoutSystems";
import "./PresentationEditorPage.css";

const EDITABLE_CANVAS_FIELDS = ["title", "bodyHtml", "bodyHtml2", "speakerNotes", "subtitle"];

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

const buildPatchOperations = (baseline = {}, draft = {}) => {
  const operations = [];

  const trackField = (path, baselineValue, draftValue) => {
    if (JSON.stringify(baselineValue ?? "") !== JSON.stringify(draftValue ?? "")) {
      operations.push({ op: "set", path, value: draftValue ?? "" });
    }
  };

  trackField("title", baseline.title, draft.title);
  trackField("subtitle", baseline.subtitle, draft.subtitle);
  trackField("bodyHtml", baseline.bodyHtml, draft.bodyHtml);
  trackField("bodyHtml2", baseline.bodyHtml2, draft.bodyHtml2);
  trackField("speakerNotes", baseline.speakerNotes, draft.speakerNotes);
  trackField("layout", baseline.layout, draft.layout);
  trackField("imageUrl", baseline.imageUrl, draft.imageUrl);
  trackField("imageAlt", baseline.imageAlt, draft.imageAlt);
  trackField("imageCaption", baseline.imageCaption, draft.imageCaption);

  const baselineBackground = baseline.background || {};
  const draftBackground = draft.background || {};
  trackField("background.type", baselineBackground.type, draftBackground.type);
  trackField("background.solidColor", baselineBackground.solidColor, draftBackground.solidColor);
  trackField("background.gradientFrom", baselineBackground.gradientFrom, draftBackground.gradientFrom);
  trackField("background.gradientTo", baselineBackground.gradientTo, draftBackground.gradientTo);
  trackField("background.gradientAngle", baselineBackground.gradientAngle, draftBackground.gradientAngle);
  trackField("background.imageUrl", baselineBackground.imageUrl, draftBackground.imageUrl);
  trackField("background.overlayColor", baselineBackground.overlayColor, draftBackground.overlayColor);
  trackField("background.overlayOpacity", baselineBackground.overlayOpacity, draftBackground.overlayOpacity);

  return operations;
};

const PresentationEditorPage = () => {
  const { t } = useTranslation(["presentations"]);
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const {
    current: presentation,
    loading,
    regenerating,
    textAssisting,
    patching,
    autosaveStatus,
    comments,
    commentsLoading,
    error,
  } = useSelector(
    (s) => s.presentations
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingSlide, setEditingSlide] = useState(false);
  const [slideEditData, setSlideEditData] = useState({});
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [bulkLayout, setBulkLayout] = useState("title-body");
  const [selectedSlideIndexes, setSelectedSlideIndexes] = useState([]);
  const [canvasEditField, setCanvasEditField] = useState("title");
  const [canvasEditValue, setCanvasEditValue] = useState("");
  const [canvasEditOpen, setCanvasEditOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [themeEditData, setThemeEditData] = useState({});
  const [regenPrompt, setRegenPrompt] = useState("");
  const [showRegenPanel, setShowRegenPanel] = useState(false);
  const [assistAction, setAssistAction] = useState("improve");
  const [assistField, setAssistField] = useState("bodyHtml");
  const [assistCustomPrompt, setAssistCustomPrompt] = useState("");
  const [draggingIndex, setDraggingIndex] = useState(null);
  const slideListRef = useRef(null);
  const editBaselineRef = useRef(null);
  const autosaveTimerRef = useRef(null);

  useEffect(() => {
    dispatch(fetchPresentation(id));
    return () => {
      dispatch(clearCurrent());
    };
  }, [dispatch, id]);

  useEffect(() => {
    if (presentation) {
      setTitleValue(presentation.title);
      setThemeEditData({
        primaryColor: presentation.theme?.primaryColor || "#1a73e8",
        secondaryColor: presentation.theme?.secondaryColor || "#174ea6",
        fontFamily: presentation.theme?.fontFamily || "Segoe UI, Roboto, Arial, sans-serif",
        titleColor: presentation.themeTokens?.titleColor || "#0f172a",
        bodyColor: presentation.themeTokens?.bodyColor || "#1f2937",
        canvasColor: presentation.themeTokens?.canvasColor || "#ffffff",
        surfaceColor: presentation.themeTokens?.surfaceColor || "#f8fafc",
        gradientFrom: presentation.themeTokens?.gradientFrom || presentation.theme?.primaryColor || "#1a73e8",
        gradientTo: presentation.themeTokens?.gradientTo || presentation.theme?.secondaryColor || "#174ea6",
        gradientAngle: presentation.themeTokens?.gradientAngle ?? 135,
        layoutSystem: presentation.layoutSystem || DEFAULT_PRESENTATION_LAYOUT_SYSTEM,
        schemaVersion: presentation.schemaVersion || 2,
      });
    }
  }, [presentation]);

  const slides = presentation?.slides
    ? [...presentation.slides].sort((a, b) => a.order - b.order)
    : [];
  const activeSlide = slides[activeIndex];
  const selectedIndexes = selectedSlideIndexes.length
    ? selectedSlideIndexes
    : [activeIndex];

  const isSlideDirty = useMemo(() => {
    if (!editingSlide || !editBaselineRef.current) return false;
    return buildPatchOperations(editBaselineRef.current, slideEditData).length > 0;
  }, [editingSlide, slideEditData]);

  useEffect(() => {
    if (!id) return;
    dispatch(fetchComments({ id, slideIndex: activeIndex }));
  }, [dispatch, id, activeIndex]);

  // ─── Title editing ───────────────────────────────────────────────
  const handleSaveTitle = useCallback(async () => {
    if (!titleValue.trim()) return;
    await dispatch(
      updatePresentation({ id, data: { title: titleValue.trim() } })
    );
    setEditingTitle(false);
    toast.success("Title updated");
  }, [dispatch, id, titleValue]);

  // ─── Slide editing ──────────────────────────────────────────────
  const startEditing = useCallback(() => {
    if (!activeSlide) return;
    const seed = {
      title: activeSlide.title || "",
      subtitle: activeSlide.subtitle || "",
      bodyHtml: activeSlide.bodyHtml || "",
      bodyHtml2: activeSlide.bodyHtml2 || "",
      speakerNotes: activeSlide.speakerNotes || "",
      imageUrl: activeSlide.imageUrl || "",
      imageAlt: activeSlide.imageAlt || "",
      imageCaption: activeSlide.imageCaption || "",
      layout: activeSlide.layout || "title-body",
      background: {
        type: activeSlide.background?.type || "solid",
        solidColor: activeSlide.background?.solidColor || presentation?.themeTokens?.canvasColor || "#ffffff",
        gradientFrom: activeSlide.background?.gradientFrom || presentation?.themeTokens?.gradientFrom || presentation?.theme?.primaryColor || "#1a73e8",
        gradientTo: activeSlide.background?.gradientTo || presentation?.themeTokens?.gradientTo || presentation?.theme?.secondaryColor || "#174ea6",
        gradientAngle: activeSlide.background?.gradientAngle ?? presentation?.themeTokens?.gradientAngle ?? 135,
        imageUrl: activeSlide.background?.imageUrl || "",
        overlayColor: activeSlide.background?.overlayColor || "#000000",
        overlayOpacity: activeSlide.background?.overlayOpacity ?? 0,
      },
    };

    setSlideEditData(seed);
    editBaselineRef.current = clone(seed);
    setHistoryPast([]);
    setHistoryFuture([]);
    setEditingSlide(true);
  }, [activeSlide, presentation]);

  const updateSlideDraft = useCallback((nextDataOrUpdater) => {
    setSlideEditData((prev) => {
      const next =
        typeof nextDataOrUpdater === "function"
          ? nextDataOrUpdater(prev)
          : nextDataOrUpdater;

      setHistoryPast((past) => [...past.slice(-49), clone(prev)]);
      setHistoryFuture([]);
      return next;
    });
  }, []);

  const undoSlideDraft = useCallback(() => {
    if (!historyPast.length) return;
    setSlideEditData((current) => {
      const previous = historyPast[historyPast.length - 1];
      setHistoryPast((past) => past.slice(0, -1));
      setHistoryFuture((future) => [clone(current), ...future.slice(0, 49)]);
      return clone(previous);
    });
  }, [historyPast]);

  const redoSlideDraft = useCallback(() => {
    if (!historyFuture.length) return;
    const [next, ...rest] = historyFuture;
    setSlideEditData((current) => {
      setHistoryPast((past) => [...past.slice(-49), clone(current)]);
      setHistoryFuture(rest);
      return clone(next);
    });
  }, [historyFuture]);

  const handleSaveSlide = useCallback(async (mode = "manual") => {
    if (!editingSlide || !editBaselineRef.current) return;

    const operations = buildPatchOperations(editBaselineRef.current, slideEditData);
    if (!operations.length) {
      if (mode === "manual") setEditingSlide(false);
      return;
    }

    const res = await dispatch(
      patchSlide({
        id,
        slideIndex: activeIndex,
        operations,
        version: presentation?.generation?.version,
      })
    );

    if (!res.error) {
      editBaselineRef.current = clone(slideEditData);
      if (mode === "manual") {
        setEditingSlide(false);
        toast.success("Slide saved");
      }
    } else if (mode === "autosave") {
      toast.error(res.payload || "Autosave failed");
    }
  }, [dispatch, id, activeIndex, slideEditData, editingSlide, presentation?.generation?.version]);

  useEffect(() => {
    if (!editingSlide || !isSlideDirty) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      handleSaveSlide("autosave");
    }, 1000);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [editingSlide, isSlideDirty, handleSaveSlide]);

  const handleCanvasElementClick = useCallback((field) => {
    if (!activeSlide || !EDITABLE_CANVAS_FIELDS.includes(field)) return;
    setCanvasEditField(field);
    setCanvasEditValue(String(activeSlide[field] || ""));
    setCanvasEditOpen(true);
  }, [activeSlide]);

  const handleCanvasQuickSave = useCallback(async () => {
    if (!activeSlide) return;
    const res = await dispatch(
      patchSlide({
        id,
        slideIndex: activeIndex,
        operations: [{ op: "set", path: canvasEditField, value: canvasEditValue }],
        version: presentation?.generation?.version,
      })
    );

    if (!res.error) {
      setCanvasEditOpen(false);
      toast.success("Updated on canvas");
    }
  }, [dispatch, id, activeIndex, canvasEditField, canvasEditValue, activeSlide, presentation?.generation?.version]);

  const handleSaveTheme = useCallback(async () => {
    const res = await dispatch(
      updatePresentation({
        id,
        data: {
          theme: {
            primaryColor: themeEditData.primaryColor,
            secondaryColor: themeEditData.secondaryColor,
            fontFamily: themeEditData.fontFamily,
          },
          themeTokens: {
            titleColor: themeEditData.titleColor,
            bodyColor: themeEditData.bodyColor,
            canvasColor: themeEditData.canvasColor,
            surfaceColor: themeEditData.surfaceColor,
            gradientFrom: themeEditData.gradientFrom,
            gradientTo: themeEditData.gradientTo,
            gradientAngle: Number(themeEditData.gradientAngle) || 135,
          },
          layoutSystem: themeEditData.layoutSystem || DEFAULT_PRESENTATION_LAYOUT_SYSTEM,
          schemaVersion: Number(themeEditData.schemaVersion) || 2,
        },
      })
    );

    if (!res.error) {
      toast.success("Theme updated");
    }
  }, [dispatch, id, themeEditData]);

  // ─── Regenerate slide ───────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    const res = await dispatch(
      regenerateSlide({
        id,
        slideIndex: activeIndex,
        prompt: regenPrompt,
        keepLayout: true,
      })
    );
    if (!res.error) {
      setShowRegenPanel(false);
      setRegenPrompt("");
      toast.success("Slide regenerated");
    }
  }, [dispatch, id, activeIndex, regenPrompt]);

  const handleAssistText = useCallback(async () => {
    const selectedValue = String(slideEditData?.[assistField] || "").trim();
    if (!selectedValue) {
      toast.error("Selected textbox is empty");
      return;
    }

    if (assistAction === "custom" && !assistCustomPrompt.trim()) {
      toast.error("Please enter a custom prompt");
      return;
    }

    const res = await dispatch(
      textAssistSlide({
        id,
        slideIndex: activeIndex,
        action: assistAction,
        selectedText: selectedValue,
        customPrompt: assistAction === "custom" ? assistCustomPrompt : undefined,
      })
    );

    if (!res.error) {
      const assistedText = res.payload?.assistedText || selectedValue;
      setSlideEditData((prev) => ({ ...prev, [assistField]: assistedText }));
      toast.success("Text updated");
    }
  }, [
    activeIndex,
    assistAction,
    assistCustomPrompt,
    assistField,
    dispatch,
    id,
    slideEditData,
  ]);

  // ─── Drag & drop reorder ───────────────────────────────────────
  const handleDragStart = (index) => setDraggingIndex(index);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = useCallback(
    async (targetIndex) => {
      if (draggingIndex === null || draggingIndex === targetIndex) return;
      const newOrder = slides.map((_, i) => i);
      const [removed] = newOrder.splice(draggingIndex, 1);
      newOrder.splice(targetIndex, 0, removed);
      await dispatch(reorderSlides({ id, slideOrder: newOrder }));
      setActiveIndex(targetIndex);
      setDraggingIndex(null);
      toast.success("Slides reordered");
    },
    [dispatch, id, slides, draggingIndex]
  );

  // ─── Export PDF ─────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    try {
      const blob = await presentationService.exportPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(presentation?.title || "presentation").replace(/[^a-zA-Z0-9 ]/g, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Export failed");
    }
  }, [id, presentation?.title]);

  const handleApplyLayoutToSelected = useCallback(async () => {
    if (!selectedIndexes.length) return;

    for (const slideIndex of selectedIndexes) {
      // eslint-disable-next-line no-await-in-loop
      await dispatch(
        applyLayoutToSlide({
          id,
          slideIndex,
          layout: bulkLayout,
          preserveContent: true,
        })
      );
    }

    toast.success(`Applied ${bulkLayout} to ${selectedIndexes.length} slide(s)`);
  }, [dispatch, id, selectedIndexes, bulkLayout]);

  const handleAddComment = useCallback(async () => {
    if (!commentDraft.trim()) return;
    const res = await dispatch(
      addComment({ id, message: commentDraft.trim(), slideIndex: activeIndex })
    );
    if (!res.error) {
      setCommentDraft("");
    }
  }, [dispatch, id, activeIndex, commentDraft]);

  const handleResolveComment = useCallback((commentId, resolved) => {
    dispatch(resolveComment({ id, commentId, resolved }));
  }, [dispatch, id]);

  const handleDeleteComment = useCallback((commentId) => {
    dispatch(deleteComment({ id, commentId }));
  }, [dispatch, id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isModifier = event.ctrlKey || event.metaKey;

      if (isModifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (editingSlide) handleSaveSlide("manual");
        return;
      }

      if (isModifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (editingSlide) undoSlideDraft();
        return;
      }

      if (isModifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (editingSlide) redoSlideDraft();
        return;
      }

      if (!editingSlide && event.key === "ArrowLeft") {
        setActiveIndex((idx) => Math.max(0, idx - 1));
      }
      if (!editingSlide && event.key === "ArrowRight") {
        setActiveIndex((idx) => Math.min(slides.length - 1, idx + 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingSlide, handleSaveSlide, undoSlideDraft, redoSlideDraft, slides.length]);

  // ─── Publish ────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    const res = await dispatch(
      updatePresentation({ id, data: { status: "ready" } })
    );
    if (!res.error) toast.success("Presentation marked ready");
  }, [dispatch, id]);

  if (loading || !presentation) {
    return (
      <div className="editor-loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="presentation-editor">
      {/* Top toolbar */}
      <div className="editor-toolbar">
        <button
          className="icon-btn-lg"
          onClick={() => navigate("/portal/presentations")}
        >
          <HiOutlineArrowLeft size={20} />
        </button>

        {editingTitle ? (
          <div className="title-edit-row">
            <input
              className="title-input"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
              autoFocus
            />
            <button className="btn-sm" onClick={handleSaveTitle}>
              Save
            </button>
            <button
              className="btn-sm btn-ghost"
              onClick={() => setEditingTitle(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <h2
            className="editor-title"
            onClick={() => setEditingTitle(true)}
            title="Click to edit"
          >
            {presentation.title}
            <HiOutlinePencilSquare size={14} className="edit-icon" />
          </h2>
        )}

        <div className="toolbar-right">
          <span className={`autosave-pill autosave-pill-${autosaveStatus}`}>
            {autosaveStatus}
          </span>
          <span className={`status-pill status-${presentation.status}`}>
            {presentation.status}
          </span>
          <button className="btn-sm" onClick={handleExportPdf}>
            <HiOutlineDocumentArrowDown size={16} /> PDF
          </button>
          <button
            className="btn-sm"
            onClick={() =>
              navigate(`/portal/presentations/${id}/present`)
            }
          >
            <HiOutlinePlayCircle size={16} /> Present
          </button>
          {presentation.status === "draft" && (
            <button className="btn-sm btn-primary-sm" onClick={handlePublish}>
              <HiOutlineCheckCircle size={16} /> Publish
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="editor-body">
        {/* Left: Slide filmstrip */}
        <div className="slide-panel" ref={slideListRef}>
          {slides.map((slide, i) => (
            <div
              key={slide._id || i}
              className={`filmstrip-slide ${i === activeIndex ? "active" : ""} ${draggingIndex === i ? "dragging" : ""} ${selectedIndexes.includes(i) ? "selected" : ""}`}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey) {
                  setSelectedSlideIndexes((prev) =>
                    prev.includes(i) ? prev.filter((idx) => idx !== i) : [...prev, i]
                  );
                  return;
                }

                if (event.shiftKey) {
                  const start = Math.min(activeIndex, i);
                  const end = Math.max(activeIndex, i);
                  const range = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
                  setSelectedSlideIndexes(range);
                } else {
                  setSelectedSlideIndexes([i]);
                }

                setActiveIndex(i);
              }}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(i)}
            >
              <span className="filmstrip-num">{i + 1}</span>
              <div className="filmstrip-preview">
                <SlideRenderer
                  slide={slide}
                  theme={presentation.theme}
                  themeTokens={presentation.themeTokens}
                  scale={0.14}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Center: Main slide canvas */}
        <div className="slide-canvas-area">
          {activeSlide && (
            <div className="canvas-wrapper">
              <SlideRenderer
                slide={activeSlide}
                slideNumber={activeIndex + 1}
                totalSlides={slides.length}
                theme={presentation.theme}
                themeTokens={presentation.themeTokens}
                scale={0.7}
                isActive
                onElementClick={handleCanvasElementClick}
              />
            </div>
          )}

          {canvasEditOpen && (
            <div className="canvas-inline-editor">
              <h5>Quick Edit: {canvasEditField}</h5>
              <textarea
                className="form-input"
                rows={canvasEditField === "title" ? 2 : 4}
                value={canvasEditValue}
                onChange={(e) => setCanvasEditValue(e.target.value)}
              />
              <div className="form-actions">
                <button className="btn-primary btn-sm" onClick={handleCanvasQuickSave}>Apply</button>
                <button className="btn-sm btn-ghost" onClick={() => setCanvasEditOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Slide action bar */}
          <div className="slide-actions">
            <button className="btn-sm" onClick={startEditing}>
              <HiOutlinePencilSquare size={16} /> Edit
            </button>
            <button
              className="btn-sm"
              onClick={() => setShowRegenPanel(!showRegenPanel)}
              disabled={regenerating}
            >
              <HiOutlineSparkles size={16} />{" "}
              {regenerating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>

          {/* Regenerate panel */}
          {showRegenPanel && (
            <div className="regen-panel">
              <textarea
                className="form-input"
                rows={2}
                placeholder="Instructions for regeneration..."
                value={regenPrompt}
                onChange={(e) => setRegenPrompt(e.target.value)}
              />
              <button
                className="btn-primary btn-sm"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? "Working..." : "Regenerate Slide"}
              </button>
            </div>
          )}
        </div>

        {/* Right: Slide details / editor */}
        <div className="slide-details-panel">
          {editingSlide ? (
            <div className="slide-edit-form">
              <h4>Edit Slide</h4>
              <div className="form-group">
                <label>Layout</label>
                <select
                  value={slideEditData.layout}
                  onChange={(e) =>
                    updateSlideDraft((prev) => ({ ...prev, layout: e.target.value }))
                  }
                  className="form-input"
                >
                  {[
                    "title",
                    "title-body",
                    "two-column",
                    "image-left",
                    "image-right",
                    "image-full",
                    "bullets",
                    "comparison",
                    "quote",
                    "blank",
                  ].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Title</label>
                <input
                  className="form-input"
                  value={slideEditData.title}
                  onChange={(e) =>
                    updateSlideDraft((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label>Body (HTML)</label>
                <textarea
                  className="form-input"
                  rows={6}
                  value={slideEditData.bodyHtml}
                  onChange={(e) =>
                    updateSlideDraft((prev) => ({
                      ...prev,
                      bodyHtml: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="form-group background-editor-group">
                <label>Background</label>
                <div className="ai-assist-row">
                  <select
                    value={slideEditData.background?.type || "solid"}
                    onChange={(e) =>
                      updateSlideDraft((prev) => ({
                        ...prev,
                        background: { ...prev.background, type: e.target.value },
                      }))
                    }
                    className="form-input"
                  >
                    <option value="solid">Solid</option>
                    <option value="gradient">Gradient</option>
                  </select>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={360}
                    value={slideEditData.background?.gradientAngle ?? 135}
                    onChange={(e) =>
                      updateSlideDraft((prev) => ({
                        ...prev,
                        background: { ...prev.background, gradientAngle: Number(e.target.value) },
                      }))
                    }
                    disabled={slideEditData.background?.type !== "gradient"}
                  />
                </div>
                {slideEditData.background?.type === "gradient" ? (
                  <div className="color-grid-row">
                    <label className="color-field">
                      <span>From</span>
                      <input
                        type="color"
                        value={slideEditData.background?.gradientFrom || "#1a73e8"}
                        onChange={(e) =>
                          updateSlideDraft((prev) => ({
                            ...prev,
                            background: { ...prev.background, gradientFrom: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="color-field">
                      <span>To</span>
                      <input
                        type="color"
                        value={slideEditData.background?.gradientTo || "#174ea6"}
                        onChange={(e) =>
                          updateSlideDraft((prev) => ({
                            ...prev,
                            background: { ...prev.background, gradientTo: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <label className="color-field color-field-single">
                    <span>Color</span>
                    <input
                      type="color"
                      value={slideEditData.background?.solidColor || "#ffffff"}
                      onChange={(e) =>
                        updateSlideDraft((prev) => ({
                          ...prev,
                          background: { ...prev.background, solidColor: e.target.value },
                        }))
                      }
                    />
                  </label>
                )}
              </div>
              <div className="form-group ai-assist-group">
                <label>AI Text Assist</label>
                <div className="ai-assist-row">
                  <select
                    value={assistField}
                    onChange={(e) => setAssistField(e.target.value)}
                    className="form-input"
                  >
                    <option value="title">Title</option>
                    <option value="bodyHtml">Body</option>
                    {(slideEditData.layout === "two-column" || slideEditData.layout === "comparison") && (
                      <option value="bodyHtml2">Body 2</option>
                    )}
                    <option value="speakerNotes">Speaker Notes</option>
                  </select>
                  <select
                    value={assistAction}
                    onChange={(e) => setAssistAction(e.target.value)}
                    className="form-input"
                  >
                    <option value="improve">Improve</option>
                    <option value="simplify">Simplify</option>
                    <option value="grammar">Fix grammar</option>
                    <option value="custom">Custom prompt</option>
                  </select>
                </div>
                {assistAction === "custom" && (
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Custom instruction for AI..."
                    value={assistCustomPrompt}
                    onChange={(e) => setAssistCustomPrompt(e.target.value)}
                  />
                )}
                <button
                  className="btn-sm"
                  type="button"
                  onClick={handleAssistText}
                  disabled={textAssisting}
                >
                  {textAssisting ? "Working..." : "Apply AI Assist"}
                </button>
              </div>
              {(slideEditData.layout === "two-column" ||
                slideEditData.layout === "comparison") && (
                <div className="form-group">
                  <label>Body 2 (HTML)</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    value={slideEditData.bodyHtml2}
                    onChange={(e) =>
                      updateSlideDraft((prev) => ({
                        ...prev,
                        bodyHtml2: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
              <div className="form-group">
                <label>Speaker Notes</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={slideEditData.speakerNotes}
                  onChange={(e) =>
                    updateSlideDraft((prev) => ({
                      ...prev,
                      speakerNotes: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="form-actions compact-actions">
                <button className="btn-sm" disabled={!historyPast.length} onClick={undoSlideDraft}>Undo</button>
                <button className="btn-sm" disabled={!historyFuture.length} onClick={redoSlideDraft}>Redo</button>
                <span className="autosave-note">{isSlideDirty ? "Unsaved changes" : "Synced"}</span>
              </div>
              <div className="form-actions">
                <button className="btn-primary btn-sm" onClick={() => handleSaveSlide("manual")}>
                  Save
                </button>
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => setEditingSlide(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : activeSlide ? (
            <div className="slide-info">
              <h4>Slide {activeIndex + 1}</h4>
              <div className="theme-editor-panel">
                <h5>Bulk Layout Apply</h5>
                <div className="form-group">
                  <label>Selected Slides</label>
                  <p className="helper-text">{selectedIndexes.map((index) => index + 1).join(", ")}</p>
                </div>
                <div className="form-group">
                  <label>Layout</label>
                  <select className="form-input" value={bulkLayout} onChange={(e) => setBulkLayout(e.target.value)}>
                    {["title", "title-body", "two-column", "image-left", "image-right", "image-full", "bullets", "comparison", "quote", "blank"].map((layout) => (
                      <option key={layout} value={layout}>{layout}</option>
                    ))}
                  </select>
                </div>
                <button className="btn-sm" disabled={patching} onClick={handleApplyLayoutToSelected}>Apply to Selected</button>
              </div>
              <div className="theme-editor-panel">
                <h5>Theme</h5>
                <div className="form-group">
                  <label>Layout System</label>
                  <select
                    className="form-input"
                    value={themeEditData.layoutSystem || DEFAULT_PRESENTATION_LAYOUT_SYSTEM}
                    onChange={(e) => setThemeEditData((prev) => ({ ...prev, layoutSystem: e.target.value }))}
                  >
                    {PRESENTATION_LAYOUT_SYSTEMS.map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name}
                      </option>
                    ))}
                  </select>
                  <small className="helper-text">
                    {PRESENTATION_LAYOUT_SYSTEMS.find((system) => system.id === themeEditData.layoutSystem)?.description}
                  </small>
                </div>
                <div className="form-group">
                  <label>Schema Version</label>
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    max={10}
                    value={themeEditData.schemaVersion ?? 2}
                    onChange={(e) => setThemeEditData((prev) => ({ ...prev, schemaVersion: Number(e.target.value) || 2 }))}
                  />
                </div>
                <div className="color-grid-row">
                  <label className="color-field">
                    <span>Primary</span>
                    <input type="color" value={themeEditData.primaryColor || "#1a73e8"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, primaryColor: e.target.value }))} />
                  </label>
                  <label className="color-field">
                    <span>Secondary</span>
                    <input type="color" value={themeEditData.secondaryColor || "#174ea6"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, secondaryColor: e.target.value }))} />
                  </label>
                </div>
                <div className="color-grid-row">
                  <label className="color-field">
                    <span>Title</span>
                    <input type="color" value={themeEditData.titleColor || "#0f172a"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, titleColor: e.target.value }))} />
                  </label>
                  <label className="color-field">
                    <span>Body</span>
                    <input type="color" value={themeEditData.bodyColor || "#1f2937"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, bodyColor: e.target.value }))} />
                  </label>
                </div>
                <div className="color-grid-row">
                  <label className="color-field">
                    <span>Canvas</span>
                    <input type="color" value={themeEditData.canvasColor || "#ffffff"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, canvasColor: e.target.value }))} />
                  </label>
                  <label className="color-field">
                    <span>Surface</span>
                    <input type="color" value={themeEditData.surfaceColor || "#f8fafc"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, surfaceColor: e.target.value }))} />
                  </label>
                </div>
                <div className="color-grid-row">
                  <label className="color-field">
                    <span>Gradient From</span>
                    <input type="color" value={themeEditData.gradientFrom || "#1a73e8"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, gradientFrom: e.target.value }))} />
                  </label>
                  <label className="color-field">
                    <span>Gradient To</span>
                    <input type="color" value={themeEditData.gradientTo || "#174ea6"} onChange={(e) => setThemeEditData((prev) => ({ ...prev, gradientTo: e.target.value }))} />
                  </label>
                </div>
                <div className="form-group">
                  <label>Gradient Angle</label>
                  <input className="form-input" type="number" min={0} max={360} value={themeEditData.gradientAngle ?? 135} onChange={(e) => setThemeEditData((prev) => ({ ...prev, gradientAngle: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label>Font Family</label>
                  <input className="form-input" value={themeEditData.fontFamily || ""} onChange={(e) => setThemeEditData((prev) => ({ ...prev, fontFamily: e.target.value }))} />
                </div>
                <button className="btn-sm" onClick={handleSaveTheme}>Save Theme</button>
              </div>
              <p className="slide-info-layout">
                Layout: <code>{activeSlide.layout}</code>
              </p>
              <p className="slide-info-layout">
                System: <code>{presentation.layoutSystem || DEFAULT_PRESENTATION_LAYOUT_SYSTEM}</code>
              </p>
              {activeSlide.speakerNotes && (
                <div className="speaker-notes-preview">
                  <h5>Speaker Notes</h5>
                  <p>{activeSlide.speakerNotes}</p>
                </div>
              )}
              {activeSlide.citations?.length > 0 && (
                <div className="citations-preview">
                  <h5>Citations</h5>
                  {activeSlide.citations.map((c, i) => (
                    <p key={i}>
                      {c.source}
                      {c.page ? ` (p. ${c.page})` : ""}
                    </p>
                  ))}
                </div>
              )}
              <div className="comments-panel">
                <h5>Comments</h5>
                <div className="comment-input-row">
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Write a collaboration note..."
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                  />
                  <button className="btn-sm" onClick={handleAddComment}>Add</button>
                </div>
                {commentsLoading ? (
                  <p className="helper-text">Loading comments...</p>
                ) : comments.length === 0 ? (
                  <p className="helper-text">No comments on this slide yet.</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment._id} className={`comment-item ${comment.resolved ? "resolved" : ""}`}>
                      <p className="comment-meta">
                        {(comment.author?.firstName || "User")} {(comment.author?.lastName || "")}
                      </p>
                      <p className="comment-message">{comment.message}</p>
                      <div className="comment-actions">
                        <button className="btn-sm" onClick={() => handleResolveComment(comment._id, !comment.resolved)}>
                          {comment.resolved ? "Reopen" : "Resolve"}
                        </button>
                        <button className="btn-sm btn-ghost" onClick={() => handleDeleteComment(comment._id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PresentationEditorPage;
