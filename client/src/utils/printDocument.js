import api from "../config/api";

const HTML_REQUEST_OPTIONS = { responseType: "text", headers: { Accept: "text/html" } };

/** Turns a failed printable request into the message the server sent, if it sent one. */
export const printableErrorText = (error, fallback) => {
  const data = error?.response?.data;
  if (typeof data === "string" && data.trim()) {
    try {
      return JSON.parse(data).message || fallback;
    } catch {
      return data.slice(0, 300) || fallback;
    }
  }
  if (data?.message) return data.message;
  if (error?.code === "ECONNABORTED") return fallback;
  return error?.message || fallback;
};

const waitForFrameLoad = (frame, html) => new Promise((resolve) => {
  const onLoad = () => {
    frame.removeEventListener("load", onLoad);
    resolve();
  };
  frame.addEventListener("load", onLoad);
  frame.srcdoc = html;
});

const waitForImages = (doc) => Promise.all(
  Array.from(doc?.images || []).map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }),
);

/**
 * Prints a server-rendered sheet from a hidden same-origin iframe. The print
 * dialog opens from this page, so no popup blocker can stop it.
 */
export const printHtml = async (html) => {
  if (!html || typeof html !== "string") {
    throw new Error("The printable report was empty.");
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Printable report");
  // Off-screen rather than display:none/visibility:hidden: some browsers print a blank page for a hidden frame.
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1024px;height:800px;border:0;";
  document.body.appendChild(frame);

  let removeTimer = null;
  try {
    await waitForFrameLoad(frame, html);
    const win = frame.contentWindow;
    if (!win) throw new Error("The printable report could not be prepared.");
    await waitForImages(frame.contentDocument);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    await new Promise((resolve) => {
      const finish = () => {
        win.removeEventListener("afterprint", finish);
        if (removeTimer) window.clearTimeout(removeTimer);
        resolve();
      };
      win.addEventListener("afterprint", finish, { once: true });
      // Not every browser fires afterprint for an iframe; do not leak the frame.
      removeTimer = window.setTimeout(finish, 60000);
      win.focus();
      win.print();
    });
  } finally {
    if (removeTimer) window.clearTimeout(removeTimer);
    frame.remove();
  }
};

/** Fetches a printable sheet with the signed-in API client, then prints it. */
export const printEndpoint = async (url, { method = "get", data, params } = {}) => {
  const response = method.toLowerCase() === "post"
    ? await api.post(url, data ?? {}, { ...HTML_REQUEST_OPTIONS })
    : await api.get(url, { ...HTML_REQUEST_OPTIONS, ...(params ? { params } : {}) });

  if (typeof response.data !== "string" || !response.data.trim()) {
    throw new Error("The printable report was empty.");
  }
  await printHtml(response.data);
};
