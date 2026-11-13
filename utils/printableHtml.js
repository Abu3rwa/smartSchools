const PRINT_STYLE_ID = 'printable-page-settings';

const sanitizeFilename = (value) => String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-');

/**
 * A4 page settings have to live in CSS now that the browser prints the sheet:
 * the margins the PDF renderer used to apply are declared here instead.
 */
export const withPrintPageCss = (html, { margin = '0' } = {}) => {
    const source = String(html || '');
    if (source.includes(PRINT_STYLE_ID)) return source;

    const style = `<style id="${PRINT_STYLE_ID}">@page{size:A4;margin:${margin};}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style>`;
    const headEnd = source.search(/<\/head\s*>/i);
    if (headEnd === -1) return `${style}${source}`;
    return `${source.slice(0, headEnd)}${style}${source.slice(headEnd)}`;
};

/** Sends a printable sheet the client drops into a hidden iframe and prints. */
export const sendPrintableHtml = (res, html, { filename } = {}) => {
    const body = Buffer.from(String(html || ''), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (filename) {
        res.setHeader('Content-Disposition', `inline; filename="${sanitizeFilename(filename)}"`);
    }
    return res.send(body);
};
