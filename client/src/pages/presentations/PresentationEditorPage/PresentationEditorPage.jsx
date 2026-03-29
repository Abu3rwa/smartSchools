import { useEffect, useState, useCallback, useRef } from "react";
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
  regenerateSlide,
  reorderSlides,
  clearCurrent,
} from "../../../../store/slices/presentationSlice";
import presentationService from "../../../../services/presentationService";
import SlideRenderer from "../../../../components/presentations/SlideRenderer";
import "./PresentationEditorPage.css";

const PresentationEditorPage = () => {
  const { t } = useTranslation(["presentations"]);
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { current: presentation, loading, regenerating, error } = useSelector(
    (s) => s.presentations
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingSlide, setEditingSlide] = useState(false);
  const [slideEditData, setSlideEditData] = useState({});
  const [regenPrompt, setRegenPrompt] = useState("");
  const [showRegenPanel, setShowRegenPanel] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const slideListRef = useRef(null);

  useEffect(() => {
    dispatch(fetchPresentation(id));
    return () => {
      dispatch(clearCurrent());
    };
  }, [dispatch, id]);

  useEffect(() => {
    if (presentation) {
      setTitleValue(presentation.title);
    }
  }, [presentation]);

  const slides = presentation?.slides
    ? [...presentation.slides].sort((a, b) => a.order - b.order)
    : [];
  const activeSlide = slides[activeIndex];

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
    setSlideEditData({
      title: activeSlide.title || "",
      bodyHtml: activeSlide.bodyHtml || "",
      bodyHtml2: activeSlide.bodyHtml2 || "",
      speakerNotes: activeSlide.speakerNotes || "",
      layout: activeSlide.layout || "title-body",
    });
    setEditingSlide(true);
  }, [activeSlide]);

  const handleSaveSlide = useCallback(async () => {
    const res = await dispatch(
      updateSlide({ id, slideIndex: activeIndex, data: slideEditData })
    );
    if (!res.error) {
      setEditingSlide(false);
      toast.success("Slide saved");
    }
  }, [dispatch, id, activeIndex, slideEditData]);

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

  // ─── Publish ────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    const res = await dispatch(
      updatePresentation({ id, data: { status: "published" } })
    );
    if (!res.error) toast.success("Published!");
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
              className={`filmstrip-slide ${i === activeIndex ? "active" : ""} ${draggingIndex === i ? "dragging" : ""}`}
              onClick={() => setActiveIndex(i)}
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
                scale={0.7}
                isActive
              />
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
                    setSlideEditData({ ...slideEditData, layout: e.target.value })
                  }
                  className="form-input"
                >
                  {[
                    "title-only",
                    "section-header",
                    "title-body",
                    "two-column",
                    "comparison",
                    "image-text",
                    "big-number",
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
                    setSlideEditData({ ...slideEditData, title: e.target.value })
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
                    setSlideEditData({
                      ...slideEditData,
                      bodyHtml: e.target.value,
                    })
                  }
                />
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
                      setSlideEditData({
                        ...slideEditData,
                        bodyHtml2: e.target.value,
                      })
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
                    setSlideEditData({
                      ...slideEditData,
                      speakerNotes: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-actions">
                <button className="btn-primary btn-sm" onClick={handleSaveSlide}>
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
              <p className="slide-info-layout">
                Layout: <code>{activeSlide.layout}</code>
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PresentationEditorPage;
