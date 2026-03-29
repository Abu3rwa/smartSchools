import { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, useNavigate } from "react-router-dom";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineXMark,
  HiOutlineEye,
  HiOutlineEyeSlash,
} from "react-icons/hi2";

import {
  fetchPresentation,
  clearCurrent,
} from "../../../store/slices/presentationSlice";
import SlideRenderer from "../../../components/presentations/SlideRenderer";
import "./PresenterViewPage.css";

const PresenterViewPage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { current: presentation, loading } = useSelector(
    (s) => s.presentations
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(true);

  useEffect(() => {
    dispatch(fetchPresentation(id));
    return () => dispatch(clearCurrent());
  }, [dispatch, id]);

  const slides = presentation?.slides
    ? [...presentation.slides].sort((a, b) => a.order - b.order)
    : [];

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, slides.length - 1));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleExit = useCallback(() => {
    navigate(`/portal/presentations/${id}`);
  }, [navigate, id]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        handleExit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, handleExit]);

  if (loading || !presentation) {
    return (
      <div className="presenter-loading">
        <div className="spinner" />
      </div>
    );
  }

  const currentSlide = slides[currentIndex];
  const nextSlide = slides[currentIndex + 1];

  return (
    <div className="presenter-view">
      {/* Main slide */}
      <div className="presenter-main">
        {currentSlide && (
          <SlideRenderer
            slide={currentSlide}
            slideNumber={currentIndex + 1}
            totalSlides={slides.length}
            theme={presentation.theme}
            className="presenter-current-slide"
          />
        )}
      </div>

      {/* Bottom control bar */}
      <div className="presenter-controls">
        <button className="presenter-btn" onClick={handleExit} title="Exit">
          <HiOutlineXMark size={20} />
        </button>

        <div className="presenter-nav">
          <button
            className="presenter-btn"
            onClick={goPrev}
            disabled={currentIndex === 0}
          >
            <HiOutlineArrowLeft size={20} />
          </button>
          <span className="presenter-counter">
            {currentIndex + 1} / {slides.length}
          </span>
          <button
            className="presenter-btn"
            onClick={goNext}
            disabled={currentIndex === slides.length - 1}
          >
            <HiOutlineArrowRight size={20} />
          </button>
        </div>

        <button
          className="presenter-btn"
          onClick={() => setShowNotes(!showNotes)}
          title={showNotes ? "Hide notes" : "Show notes"}
        >
          {showNotes ? (
            <HiOutlineEyeSlash size={20} />
          ) : (
            <HiOutlineEye size={20} />
          )}
        </button>
      </div>

      {/* Notes panel */}
      {showNotes && (
        <div className="presenter-notes-panel">
          <div className="notes-section">
            <h4>Speaker Notes</h4>
            <p>{currentSlide?.speakerNotes || "No notes for this slide."}</p>
          </div>
          {nextSlide && (
            <div className="notes-section next-preview">
              <h4>Next:</h4>
              <div className="next-slide-mini">
                <SlideRenderer
                  slide={nextSlide}
                  theme={presentation.theme}
                  scale={0.15}
                />
              </div>
              <p className="next-title">{nextSlide.title}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PresenterViewPage;
