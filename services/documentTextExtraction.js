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

const readPdf = async (buffer) => {
    try {
        const pdfModule = await import('pdf-parse');
        const parse = pdfModule.default || pdfModule;
        const data = await parse(buffer);
        return cleanText(data?.text);
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
        ? await readPdf(buffer)
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

export const isImageDocumentMime = (mimeType) => IMAGE_MIME_TYPES.has(
    String(mimeType || '').toLowerCase()
);
