import React from "react";
import "./SlideRenderer.css";

const LAYOUT_CLASSES = {
  "title-only": "slide-layout-title-only",
  "section-header": "slide-layout-section-header",
  "title-body": "slide-layout-title-body",
  "two-column": "slide-layout-two-column",
  comparison: "slide-layout-comparison",
  "image-text": "slide-layout-image-text",
  "big-number": "slide-layout-big-number",
  quote: "slide-layout-quote",
  blank: "slide-layout-blank",
};

export default function SlideRenderer({
  slide,
  slideNumber,
  totalSlides,
  theme = {},
  scale = 1,
  onClick,
  isActive,
  className = "",
}) {
  const layoutClass = LAYOUT_CLASSES[slide.layout] || "slide-layout-title-body";
  const style = {
    "--slide-primary": theme.primaryColor || "#1a73e8",
    "--slide-secondary": theme.secondaryColor || "#174ea6",
    "--slide-font": theme.fontFamily || "Segoe UI, Roboto, Arial, sans-serif",
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: "top left",
  };

  return (
    <div
      className={`slide-renderer ${layoutClass} ${isActive ? "slide-active" : ""} ${className}`}
      style={style}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {slide.layout === "title-only" || slide.layout === "section-header" ? (
        <div className="slide-center-content">
          <h1 className="slide-title">{slide.title}</h1>
          {slide.subtitle && (
            <p className="slide-subtitle">{slide.subtitle}</p>
          )}
        </div>
      ) : slide.layout === "two-column" || slide.layout === "comparison" ? (
        <>
          <h2 className="slide-title">{slide.title}</h2>
          <div className="slide-columns">
            <div
              className="slide-col"
              dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
            />
            <div
              className="slide-col"
              dangerouslySetInnerHTML={{ __html: slide.bodyHtml2 || "" }}
            />
          </div>
        </>
      ) : slide.layout === "image-text" ? (
        <>
          <h2 className="slide-title">{slide.title}</h2>
          <div className="slide-image-text-row">
            <div className="slide-image-col">
              {slide.imageUrl && (
                <img src={slide.imageUrl} alt={slide.imageAlt || ""} />
              )}
              {slide.imageCaption && (
                <p className="slide-image-caption">{slide.imageCaption}</p>
              )}
            </div>
            <div
              className="slide-text-col"
              dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
            />
          </div>
        </>
      ) : slide.layout === "big-number" ? (
        <div className="slide-center-content">
          <h1 className="slide-big-number-title">{slide.title}</h1>
          <div
            className="slide-body"
            dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
          />
        </div>
      ) : slide.layout === "quote" ? (
        <div className="slide-center-content">
          <blockquote
            className="slide-quote-body"
            dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
          />
          <p className="slide-quote-attribution">{slide.title}</p>
        </div>
      ) : slide.layout === "blank" ? null : (
        <>
          <h2 className="slide-title">{slide.title}</h2>
          <div
            className="slide-body"
            dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
          />
        </>
      )}

      {slideNumber != null && (
        <span className="slide-number">
          {slideNumber} / {totalSlides}
        </span>
      )}
    </div>
  );
}
