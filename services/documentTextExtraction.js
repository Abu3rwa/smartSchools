import logger from '../utils/logger.js';
import { connectAi } from '../utils/connectAi.js';

/**
 * Turns an uploaded PDF or photo into plain text for one AI call. The buffer is
 * never written to disk, Firebase or Mongo: the caller receives the text and
 * the upload dies with the request.
 */

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MAX_CHARS = 30000;
export const DOCUMENT_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
]);

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// The lesson builder reads a wider set than the assignment draft flow. Its
// limits live here too so both features share one parser and one set of errors.
export const BUILDER_DOCUMENT_MIME_TYPES = new Set([
    ...DOCUMENT_MIME_TYPES,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'application/octet-stream'
]);

export const BUILDER_EXTENSION_TYPES = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

export const BUILDER_PDF_MAX_PAGES = 40;
export const BUILDER_PARSE_TIMEOUT_MS = 60000;

const TRANSCRIBE_PROMPT = `Transcribe every word in this photo of a page exactly as printed.
Keep headings, numbered lists, tables and answer choices on their own lines.
Do not translate, summarise, correct or add anything.
If there is no readable text, reply with exactly: NO_TEXT_FOUND`;

const documentError = (message, code, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const cleanText = (value) => String(value || '')
    .split('\u0000').join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

const readPdf = async (buffer, { maxPages } = {}) => {
    try {
        const pdfModule = await import('pdf-parse');
        const parse = pdfModule.default || pdfModule;
        const data = await parse(buffer, maxPages ? { max: maxPages } : undefined);
        return {
            text: cleanText(data?.text),
            pageCount: Number(data?.numpages) > 0 ? Number(data.numpages) : 0
        };
    } catch (error) {
        logger.warn('document_pdf_unreadable', { error: error?.message });
        throw documentError(
            'We could not open this PDF. Try another PDF, or upload a photo of the pages.',
            'DOCUMENT_PDF_UNREADABLE',
            422
        );
    }
};

const readImage = async (buffer, mimeType, usage) => {
    const reply = await connectAi(TRANSCRIBE_PROMPT, {
        image: { mimeType, data: buffer.toString('base64') },
        usage
    });
    const text = cleanText(reply.text);
    return /^NO_TEXT_FOUND\.?$/i.test(text) ? '' : text;
};

/**
 * @returns {Promise<{text: string, truncated: boolean, sourceType: 'pdf'|'image'}>}
 */
export const extractDocumentText = async ({ buffer, mimeType, usage }) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw documentError('The uploaded file is empty. Choose the file again.', 'DOCUMENT_EMPTY_FILE');
    }
    if (buffer.length > DOCUMENT_MAX_BYTES) {
        throw documentError('The file is too large. Upload a file under 10 MB.', 'DOCUMENT_TOO_LARGE');
    }

    const normalizedMime = String(mimeType || '').toLowerCase();
    if (!DOCUMENT_MIME_TYPES.has(normalizedMime)) {
        throw documentError(
            'Upload a PDF, JPG, PNG or WebP file.',
            'DOCUMENT_TYPE_UNSUPPORTED'
        );
    }

    const isPdf = normalizedMime === 'application/pdf';
    const text = isPdf
        ? (await readPdf(buffer)).text
        : await readImage(buffer, normalizedMime, usage);

    if (!text) {
        throw documentError(
            isPdf
                ? 'This PDF has no selectable text, which usually means it is a scan. Take a photo of the pages and upload the image instead.'
                : 'We could not read any text in this image. Take a clearer, straight-on photo and try again.',
            'DOCUMENT_NO_TEXT',
            422
        );
    }

    return {
        text: text.slice(0, DOCUMENT_MAX_CHARS),
        truncated: text.length > DOCUMENT_MAX_CHARS,
        sourceType: isPdf ? 'pdf' : 'image'
    };
};

export const isSupportedDocumentMime = (mimeType) => DOCUMENT_MIME_TYPES.has(
    String(mimeType || '').toLowerCase()
);

const XML_ENTITIES = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'"
};

const decodeXmlText = (value) => String(value || '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (match) => XML_ENTITIES[match] || match)
    .replace(/&#(\d+);/g, (match, code) => {
        const point = Number(code);
        return Number.isInteger(point) && point > 0 && point <= 0x10ffff
            ? String.fromCodePoint(point)
            : match;
    });

const readDocx = async (buffer) => {
    try {
        const mammoth = await import('mammoth');
        const reader = mammoth.default || mammoth;
        const result = await reader.extractRawText({ buffer });
        return cleanText(result?.value);
    } catch (error) {
        logger.warn('document_docx_unreadable', { error: error?.message });
        throw documentError(
            'We could not open this Word file. Try saving it as a PDF and uploading that instead.',
            'DOCUMENT_DOCX_UNREADABLE',
            422
        );
    }
};

const readPptx = async (buffer) => {
    try {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(buffer);
        const slideNames = Object.keys(zip.files)
            .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
            .sort((left, right) => {
                const number = (name) => Number(name.match(/slide(\d+)\.xml$/)?.[1] || 0);
                return number(left) - number(right);
            });
        const slides = [];
        for (const name of slideNames) {
            const xml = await zip.file(name).async('string');
            const pieces = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
                .map((match) => decodeXmlText(match[1]).trim())
                .filter(Boolean);
            if (pieces.length) slides.push(pieces.join('\n'));
        }
        return cleanText(slides.join('\n\n'));
    } catch (error) {
        logger.warn('document_pptx_unreadable', { error: error?.message });
        throw documentError(
            'We could not open this PowerPoint file. Try saving it as a PDF and uploading that instead.',
            'DOCUMENT_PPTX_UNREADABLE',
            422
        );
    }
};

const readPlainText = async (buffer) => cleanText(buffer.toString('utf8'));

/** Browsers send octet-stream for some files, so the extension decides then. */
export const resolveBuilderDocumentMime = (mimeType, fileName) => {
    const declared = String(mimeType || '').toLowerCase();
    if (declared && declared !== 'application/octet-stream') return declared;
    const extension = String(fileName || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
    return BUILDER_EXTENSION_TYPES[extension] || declared;
};

const hasMagic = (buffer, bytes) => bytes.every((byte, index) => buffer[index] === byte);

const assertMagicBytes = (buffer, normalizedMime) => {
    const isZip = hasMagic(buffer, [0x50, 0x4b, 0x03, 0x04]);
    if (normalizedMime === 'application/pdf' && buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
        throw documentError(
            'This file is named as a PDF but is not one. Choose the PDF itself, not a shortcut.',
            'DOCUMENT_PDF_UNREADABLE',
            422
        );
    }
    if (
        (
            normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            || normalizedMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        )
        && !isZip
    ) {
        throw documentError(
            'This file is named as a Word or PowerPoint file but is not one. Choose the original file.',
            'DOCUMENT_TYPE_UNSUPPORTED',
            422
        );
    }
    if (normalizedMime === 'image/jpeg' && !hasMagic(buffer, [0xff, 0xd8, 0xff])) {
        throw documentError('This file is named as a photo but is not a JPEG.', 'DOCUMENT_TYPE_UNSUPPORTED', 422);
    }
    if (normalizedMime === 'image/png' && !hasMagic(buffer, [0x89, 0x50, 0x4e, 0x47])) {
        throw documentError('This file is named as a photo but is not a PNG.', 'DOCUMENT_TYPE_UNSUPPORTED', 422);
    }
    if (
        normalizedMime === 'image/webp'
        && (buffer.slice(0, 4).toString('latin1') !== 'RIFF' || buffer.slice(8, 12).toString('latin1') !== 'WEBP')
    ) {
        throw documentError('This file is named as a photo but is not a WebP image.', 'DOCUMENT_TYPE_UNSUPPORTED', 422);
    }
};

// Two extractions at once bounds memory: each upload is held in RAM, and a
// vision transcription keeps a whole image alive until the provider replies.
const MAX_CONCURRENT_EXTRACTIONS = 2;
let activeExtractions = 0;
const extractionWaiters = [];

const withExtractionSlot = async (work) => {
    if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) {
        await new Promise((resolve) => extractionWaiters.push(resolve));
    }
    activeExtractions += 1;
    try {
        return await work();
    } finally {
        activeExtractions -= 1;
        const next = extractionWaiters.shift();
        if (next) next();
    }
};

const withParseTimeout = (promise, milliseconds) => Promise.race([
    promise,
    new Promise((_, reject) => {
        const timer = setTimeout(() => {
            reject(documentError(
                'Reading this file took too long. Try a smaller file or save it as a PDF.',
                'DOCUMENT_PARSE_TIMEOUT',
                422
            ));
        }, milliseconds);
        if (typeof timer.unref === 'function') timer.unref();
    })
]);

/**
 * The lesson builder's reader: PDF, Word, PowerPoint, plain text and photos.
 * It shares the existing PDF/image readers and errors, and adds only the two
 * office formats and a page cap. Input buffers are never stored.
 *
 * @returns {Promise<{text: string, truncated: boolean, pageCount: number|null,
 *   pages: {first: number, last: number}|null, sourceType: string}>}
 */
export const extractBuilderDocumentText = async ({
    buffer,
    fileName = '',
    mimeType = '',
    usage,
    maxChars = DOCUMENT_MAX_CHARS,
    maxBytes = DOCUMENT_MAX_BYTES
}) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw documentError('The uploaded file is empty. Choose the file again.', 'DOCUMENT_EMPTY_FILE');
    }
    if (buffer.length > maxBytes) {
        throw documentError(
            `The file is too large. Upload a file under ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
            'DOCUMENT_TOO_LARGE'
        );
    }

    const normalizedMime = resolveBuilderDocumentMime(mimeType, fileName);
    if (!BUILDER_DOCUMENT_MIME_TYPES.has(normalizedMime)) {
        throw documentError(
            'Upload a PDF, Word, PowerPoint, TXT, JPG, PNG or WebP file.',
            'DOCUMENT_TYPE_UNSUPPORTED'
        );
    }
    assertMagicBytes(buffer, normalizedMime);

    const isPdf = normalizedMime === 'application/pdf';
    const isImage = IMAGE_MIME_TYPES.has(normalizedMime);
    const reader = isPdf
        ? () => readPdf(buffer, { maxPages: BUILDER_PDF_MAX_PAGES })
        : isImage
            ? async () => ({ text: await readImage(buffer, normalizedMime, usage), pageCount: 0 })
            : normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                ? async () => ({ text: await readDocx(buffer), pageCount: 0 })
                : normalizedMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                    ? async () => ({ text: await readPptx(buffer), pageCount: 0 })
                    : async () => ({ text: await readPlainText(buffer), pageCount: 0 });

    const extracted = await withExtractionSlot(() => withParseTimeout(reader(), BUILDER_PARSE_TIMEOUT_MS));
    const text = extracted.text;

    if (!text) {
        throw documentError(
            isPdf
                ? 'This PDF has no selectable text, which usually means it is a scan. Take a photo of the pages and upload the image instead.'
                : isImage
                    ? 'We could not read any text in this image. Take a clearer, straight-on photo and try again.'
                    : 'We could not find any text in this file.',
            'DOCUMENT_NO_TEXT',
            422
        );
    }

    const truncated = text.length > maxChars;
    const pageCount = isPdf && extracted.pageCount > 0 ? extracted.pageCount : null;
    // A range is a promise the whole document was read. A longer PDF is parsed
    // only up to the page cap, and a cut text may end mid-document.
    const pages = pageCount && !truncated && pageCount <= BUILDER_PDF_MAX_PAGES
        ? { first: 1, last: pageCount }
        : null;

    return {
        text: text.slice(0, maxChars),
        truncated,
        pageCount,
        pages,
        sourceType: isPdf
            ? 'pdf'
            : isImage
                ? 'image'
                : normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    ? 'docx'
                    : normalizedMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                        ? 'pptx'
                        : 'text'
    };
};

export const isImageDocumentMime = (mimeType) => IMAGE_MIME_TYPES.has(
    String(mimeType || '').toLowerCase()
);
