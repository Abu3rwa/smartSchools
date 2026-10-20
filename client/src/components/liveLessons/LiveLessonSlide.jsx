import React, { useMemo } from "react";
import "./LiveLessonSlide.css";

const splitItems = (text) =>
  String(text || "")
    .split(/\r?\n|\s*\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

const makeSlideDocument = (html, language, allowScripts) => {
  const nonce = Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const scriptPolicy = allowScripts ? "'unsafe-inline'" : `'nonce-${nonce}'`;
  const slideCsp = `default-src 'none'; script-src ${scriptPolicy}; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'`;

  const csp = `<meta http-equiv="Content-Security-Policy" content="${slideCsp}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0!important}</style>`;
  const cursorListener = `<script${allowScripts ? "" : ` nonce="${nonce}"`}>window.addEventListener("pointermove",function(event){window.parent.postMessage({type:"live-lesson-slide-pointer",x:event.clientX/window.innerWidth,y:event.clientY/window.innerHeight},"*")});window.addEventListener("pointerleave",function(){window.parent.postMessage({type:"live-lesson-slide-pointer-leave"},"*")});</script>`;
  const content = String(html || "");
  const safeLanguage = String(language || "en").replace(/[^a-zA-Z0-9-]/g, "");
  const direction = /^(ar|fa|he|ur)(?:-|$)/i.test(safeLanguage) ? "rtl" : "ltr";
  if (/<html\b/i.test(content)) {
    const localized = content.replace(/<html\b([^>]*)>/i, (tag, attributes) => {
      const withLanguage = /\blang\s*=/.test(attributes)
        ? attributes
        : `${attributes} lang="${safeLanguage}"`;
      const withDirection = /\bdir\s*=/.test(withLanguage)
        ? withLanguage
        : `${withLanguage} dir="${direction}"`;
      return `<html${withDirection}>`;
    });
    return /<head\b[^>]*>/i.test(localized)
      ? localized.replace(/<head\b[^>]*>/i, (head) => `${head}${csp}${cursorListener}`)
      : localized.replace(
          /<html\b[^>]*>/i,
          (htmlTag) => `${htmlTag}<head>${csp}${cursorListener}</head>`,
        );
  }
  return `<!doctype html><html lang="${safeLanguage}" dir="${direction}"><head>${csp}${cursorListener}</head><body>${content}</body></html>`;
};

export default function LiveLessonSlide({
  slide,
  index,
  total,
  hidden = false,
  children,
  language = "en",
  allowScripts = false,
  hideHtmlHeader = false,
}) {
  const htmlDocument = useMemo(
    () => slide?.type === "html" ? makeSlideDocument(slide.html, language, allowScripts) : "",
    [allowScripts, language, slide],
  );

  if (!slide)
    return (
      <div className="live-slide live-slide-empty">
        Waiting for the teacher…
      </div>
    );
  if (hidden) {
    return (
      <article className="live-slide live-slide-hidden">
        <div className="live-slide-hidden-message">
          <span className="live-slide-kicker">FOCUS MODE</span>
          <h2>Think it through</h2>
          <p>
            Your teacher hid the lesson content. The question is still available
            below.
          </p>
        </div>
        {children}
      </article>
    );
  }

  if (slide.type === "html") {
    return (
      <article className="live-slide live-slide-html">
        {!hideHtmlHeader && (
          <header className="live-slide-header live-slide-html-header">
            <div className="live-slide-html-meta">
              <span className="live-slide-kicker">LESSON SLIDE</span>
              <span className="live-slide-count">
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(total).padStart(2, "0")}
              </span>
            </div>
            {slide.title && <h1>{slide.title}</h1>}
          </header>
        )}
        <div className="live-slide-content live-html-slide-content">
          <iframe
            className="live-html-slide-frame"
            title={slide.title || "Live lesson slide"}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={htmlDocument}
          />
        </div>
        {children}
      </article>
    );
  }

  const items =
    slide.type === "examples" ? slide.examples || [] : splitItems(slide.body);
  return (
    <article className={`live-slide live-slide-${slide.type}`}>
      <header className="live-slide-header">
        <span className="live-slide-kicker">
          {slide.type === "question"
            ? "CHECK FOR UNDERSTANDING"
            : slide.type.replace("-", " ").toUpperCase()}
        </span>
        <span className="live-slide-count">
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </span>
      </header>
      <div className="live-slide-content">
        {slide.title && <h1>{slide.title}</h1>}
        {slide.type === "goals" && items.length > 1 ? (
          <div className="live-goal-grid">
            {items.map((item, itemIndex) => (
              <div
                className="live-content-card live-goal-card"
                key={`${item}-${itemIndex}`}
              >
                <span>{String(itemIndex + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        ) : slide.type === "examples" && items.length ? (
          <div className="live-example-grid">
            {items.map((item, itemIndex) => (
              <blockquote
                className="live-content-card live-example-card"
                key={`${item}-${itemIndex}`}
              >
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
      {slide.type === "activity" && (
        <div className="live-slide-callout">
          Work independently, then be ready to share.
        </div>
      )}
      {slide.type === "exit-ticket" && (
        <div className="live-slide-callout">
          Show what you know before you leave.
        </div>
      )}
      {children}
    </article>
  );
}
