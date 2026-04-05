import React from "react";
import "./SlideRenderer.css";

const LAYOUT_CLASSES = {
  title: "slide-layout-title-only",
  "title-only": "slide-layout-title-only",
  "section-header": "slide-layout-section-header",
  "title-body": "slide-layout-title-body",
  "two-column": "slide-layout-two-column",
  bullets: "slide-layout-title-body",
  comparison: "slide-layout-comparison",
  "image-left": "slide-layout-image-text",
  "image-right": "slide-layout-image-text slide-layout-image-right",
  "image-full": "slide-layout-image-full",
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
  themeTokens = {},
  scale = 1,
  onClick,
  onElementClick,
  isActive,
  className = "",
}) {
  const layoutClass = LAYOUT_CLASSES[slide.layout] || "slide-layout-title-body";
  const slideBackground = slide.background || {};
  const backgroundStyle =
    slideBackground.type === "gradient"
      ? `linear-gradient(${slideBackground.gradientAngle ?? themeTokens.gradientAngle ?? 135}deg, ${slideBackground.gradientFrom || themeTokens.gradientFrom || theme.primaryColor || "#1a73e8"} 0%, ${slideBackground.gradientTo || themeTokens.gradientTo || theme.secondaryColor || "#174ea6"} 100%)`
      : slideBackground.type === "image" && slideBackground.imageUrl
        ? `url(${slideBackground.imageUrl}) center / cover no-repeat`
        : slideBackground.solidColor || themeTokens.canvasColor || "#ffffff";
  const style = {
    "--slide-primary": theme.primaryColor || "#1a73e8",
    "--slide-secondary": theme.secondaryColor || "#174ea6",
    "--slide-font": theme.fontFamily || "Segoe UI, Roboto, Arial, sans-serif",
    "--slide-title-color": themeTokens.titleColor || theme.primaryColor || "#1a73e8",
    "--slide-text-color": themeTokens.bodyColor || "#222222",
    "--slide-surface": themeTokens.surfaceColor || "#f7f9fc",
    background: backgroundStyle,
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
      {slide.layout === "title" || slide.layout === "title-only" || slide.layout === "section-header" ? (
        <div className="slide-center-content">
          <h1 className="slide-title" onClick={(event) => {
            event.stopPropagation();
            onElementClick?.("title");
          }}>{slide.title}</h1>
          {slide.subtitle && (
            <p className="slide-subtitle" onClick={(event) => {
              event.stopPropagation();
              onElementClick?.("subtitle");
            }}>{slide.subtitle}</p>
          )}
        </div>
      ) : slide.layout === "two-column" || slide.layout === "comparison" ? (
        <>
          <h2 className="slide-title" onClick={(event) => {
            event.stopPropagation();
            onElementClick?.("title");
          }}>{slide.title}</h2>
          <div className="slide-columns">
            <div
              className="slide-col"
              onClick={(event) => {
                event.stopPropagation();
                onElementClick?.("bodyHtml");
              }}
              dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
            />
            <div
              className="slide-col"
              onClick={(event) => {
                event.stopPropagation();
                onElementClick?.("bodyHtml2");
              }}
              dangerouslySetInnerHTML={{ __html: slide.bodyHtml2 || "" }}
            />
          </div>
        </>
      ) : ["image-left", "image-right", "image-text"].includes(slide.layout) ? (
        <>
          <h2 className="slide-title" onClick={(event) => {
            event.stopPropagation();
            onElementClick?.("title");
          }}>{slide.title}</h2>
          <div className="slide-image-text-row">
            <div className="slide-image-col">
              {slide.imageUrl && (
                <img src={slide.imageUrl} alt={slide.imageAlt || ""} loading="lazy" />
              )}
              {slide.imageCaption && (
                <p className="slide-image-caption">{slide.imageCaption}</p>
              )}
            </div>
            <div
              className="slide-text-col"
              onClick={(event) => {
                event.stopPropagation();
                onElementClick?.("bodyHtml");
              }}
              dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
            />
          </div>
        </>
      ) : slide.layout === "image-full" ? (
        <>
          <h2 className="slide-title" onClick={(event) => {
            event.stopPropagation();
            onElementClick?.("title");
          }}>{slide.title}</h2>
          {slide.imageUrl && (
            <div className="slide-full-image-wrap">
              <img src={slide.imageUrl} alt={slide.imageAlt || ""} className="slide-full-image" loading="lazy" />
            </div>
          )}
          <div
            className="slide-body"
            onClick={(event) => {
              event.stopPropagation();
              onElementClick?.("bodyHtml");
            }}
            dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
          />
        </>
      ) : slide.layout === "big-number" ? (
        <div className="slide-center-content">
          <h1 className="slide-big-number-title" onClick={(event) => {
            event.stopPropagation();
            onElementClick?.("title");
          }}>{slide.title}</h1>
          <div
            className="slide-body"
            onClick={(event) => {
              event.stopPropagation();
              onElementClick?.("bodyHtml");
            }}
            dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
          />
        </div>
      ) : slide.layout === "quote" ? (
        <div className="slide-center-content">
          <blockquote
            className="slide-quote-body"
            onClick={(event) => {
              event.stopPropagation();
              onElementClick?.("bodyHtml");
            }}
            dangerouslySetInnerHTML={{ __html: slide.bodyHtml || "" }}
          />
          <p className="slide-quote-attribution" onClick={(event) => {
            event.stopPropagation();
            onElementClick?.("title");
          }}>{slide.title}</p>
        </div>
      ) : slide.layout === "blank" ? null : (
        <>
          <h2 className="slide-title" onClick={(event) => {
            event.stopPropagation();
            onElementClick?.("title");
          }}>{slide.title}</h2>
          <div
            className="slide-body"
            onClick={(event) => {
              event.stopPropagation();
              onElementClick?.("bodyHtml");
            }}
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
