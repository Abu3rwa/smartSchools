/**
 * Turns a Gmail payload into the plain text the AI is allowed to see:
 * no attachments, no HTML, no quoted history and no signature.
 */
import { Buffer } from 'node:buffer';

const ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
};

export const decodeHtmlEntities = (value) =>
    String(value ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
        if (code[0] === '#') {
            const number = code[1].toLowerCase() === 'x'
                ? Number.parseInt(code.slice(2), 16)
                : Number.parseInt(code.slice(1), 10);
            return Number.isFinite(number) && number > 0 && number <= 0x10ffff
                ? String.fromCodePoint(number)
                : match;
        }
        return ENTITIES[code.toLowerCase()] ?? match;
    });

const decodeBase64Url = (data) => {
    if (!data) return '';
    const normalized = String(data).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
};

export const htmlToText = (html) =>
    decodeHtmlEntities(
        String(html ?? '')
            .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
    )
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const isAttachment = (part) =>
    Boolean(part?.filename)
    || Boolean(part?.body?.attachmentId)
    || (part?.headers || []).some(
        (header) => header?.name?.toLowerCase() === 'content-disposition'
            && /attachment/i.test(String(header.value || ''))
    );

const collect = (part, bucket) => {
    if (!part || isAttachment(part)) return;
    const mimeType = String(part.mimeType || '').toLowerCase();
    if (mimeType === 'text/plain') {
        const text = decodeBase64Url(part.body?.data);
        if (text.trim()) bucket.plain.push(text);
        return;
    }
    if (mimeType === 'text/html') {
        const text = decodeBase64Url(part.body?.data);
        if (text.trim()) bucket.html.push(text);
        return;
    }
    for (const child of part.parts || []) collect(child, bucket);
};

export const extractPlainText = (gmailPayload) => {
    const bucket = { plain: [], html: [] };
    collect(gmailPayload, bucket);
    if (bucket.plain.length) return bucket.plain.join('\n').trim();
    if (bucket.html.length) return htmlToText(bucket.html.join('\n')).trim();
    return '';
};

export const trimBody = (text, maxChars = 3000) => {
    const limit = Number(maxChars) > 0 ? Number(maxChars) : 3000;
    const kept = [];
    for (const line of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
        const trimmed = line.trim();
        if (/^On .+ wrote:$/.test(trimmed)) break;
        if (trimmed === '-----Original Message-----') break;
        if (line === '-- ') break;
        if (line.trimStart().startsWith('>')) continue;
        if (trimmed === '' && kept.length && kept[kept.length - 1].trim() === '') continue;
        kept.push(line);
    }
    const result = kept.join('\n').trim();
    return result.length > limit ? result.slice(0, limit).trimEnd() : result;
};
