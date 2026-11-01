const PASTE_INPUT_TYPES = new Set([
  "insertFromPaste",
  "insertFromPasteAsQuotation",
  "insertFromDrop",
]);

/** Exact moment shown for a blocked paste, down to the second. */
export const formatPasteTime = (value, language) =>
  new Date(value).toLocaleString(language, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * Refuses every paste and drop anywhere on the page and reports what was refused.
 * Fields name themselves with data-paste-key / data-paste-index; anything else is "page".
 */
export const watchPaste = (onBlocked) => {
  const report = (event, text, hasFiles = false) => {
    if (!text && !hasFiles) return;
    const field = event.target?.closest?.("[data-paste-key]");
    onBlocked({
      key: field?.dataset.pasteKey || "page",
      index: Number(field?.dataset.pasteIndex) || 0,
      text,
    });
  };

  const onPaste = (event) => {
    event.preventDefault();
    report(
      event,
      event.clipboardData?.getData("text") || "",
      Boolean(event.clipboardData?.files?.length),
    );
  };
  const onDrop = (event) => {
    event.preventDefault();
    report(
      event,
      event.dataTransfer?.getData("text") || "",
      Boolean(event.dataTransfer?.files?.length),
    );
  };
  // Menu and mobile pastes can skip the paste event in some browsers.
  const onBeforeInput = (event) => {
    if (!PASTE_INPUT_TYPES.has(event.inputType)) return;
    event.preventDefault();
    report(event, event.data || event.dataTransfer?.getData("text") || "");
  };
  const onDragOver = (event) => event.preventDefault();

  document.addEventListener("paste", onPaste, true);
  document.addEventListener("drop", onDrop, true);
  document.addEventListener("beforeinput", onBeforeInput, true);
  document.addEventListener("dragover", onDragOver, true);
  return () => {
    document.removeEventListener("paste", onPaste, true);
    document.removeEventListener("drop", onDrop, true);
    document.removeEventListener("beforeinput", onBeforeInput, true);
    document.removeEventListener("dragover", onDragOver, true);
  };
};
