import React from "react";
import "./LiveLessonSlide.css";

const splitItems = (text) =>
  String(text || "")
    .split(/\r?\n|\s*\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

export default function LiveLessonSlide({ slide, index, total, hidden = false, children }) {
  if (!slide) return <div className="live-slide live-slide-empty">Waiting for the teacher…</div>;
  if (hidden) {
    return (
      <article className="live-slide live-slide-hidden">
        <div className="live-slide-hidden-message">
          <span className="live-slide-kicker">FOCUS MODE</span>
          <h2>Think it through</h2>
          <p>Your teacher hid the lesson content. The question is still available below.</p>
        </div>
        {children}
      </article>
    );
  }

  const items = slide.type === "examples" ? slide.examples || [] : splitItems(slide.body);
  return (
    <article className={`live-slide live-slide-${slide.type}`}>
      <header className="live-slide-header">
        <span className="live-slide-kicker">
          {slide.type === "question" ? "CHECK FOR UNDERSTANDING" : slide.type.replace("-", " ").toUpperCase()}
        </span>
        <span className="live-slide-count">{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      </header>
      <div className="live-slide-content">
        {slide.title && <h1>{slide.title}</h1>}
        {slide.type === "goals" && items.length > 1 ? (
          <div className="live-goal-grid">
            {items.map((item, itemIndex) => (
              <div className="live-content-card live-goal-card" key={`${item}-${itemIndex}`}>
                <span>{String(itemIndex + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        ) : slide.type === "examples" && items.length ? (
          <div className="live-example-grid">
            {items.map((item, itemIndex) => (
              <blockquote className="live-content-card live-example-card" key={`${item}-${itemIndex}`}>
                <span>EXAMPLE {itemIndex + 1}</span>
                <p>{item}</p>
              </blockquote>
            ))}
          </div>
        ) : (
          <div className="live-slide-copy">
            {items.map((item, itemIndex) => (
              <p key={`${item}-${itemIndex}`}>{item}</p>
            ))}
          </div>
        )}
        {slide.imageUrl && (
          <figure className="live-slide-image-wrap">
            <img src={slide.imageUrl} alt={slide.title || "Lesson visual"} />
          </figure>
        )}
      </div>
      {slide.type === "activity" && <div className="live-slide-callout">Work independently, then be ready to share.</div>}
      {slide.type === "exit-ticket" && <div className="live-slide-callout">Show what you know before you leave.</div>}
      {children}
    </article>
  );
}
