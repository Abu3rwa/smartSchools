import logger from "../utils/logger.js";

const MAX_EXTRACTED_TEXT = 80000;
const CHUNK_SIZE = 3000;
const CHUNK_OVERLAP = 200;

/**
 * Extract text content from a file buffer based on MIME type.
 */
export async function extractFromBuffer(buffer, mimeType) {
  switch (mimeType) {
    case "application/pdf":
      return extractPdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buffer);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return extractPptx(buffer);
    case "image/jpeg":
    case "image/jpg":
    case "image/png":
    case "image/webp":
      return extractImage(buffer);
    default:
      throw Object.assign(new Error(`Unsupported MIME type: ${mimeType}`), {
        status: 400,
      });
  }
}

async function extractPdf(buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  const text = data.text.substring(0, MAX_EXTRACTED_TEXT);
  return {
    text,
    pageCount: data.numpages,
    wordCount: countWords(text),
    chunks: chunkText(text),
  };
}

async function extractDocx(buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.substring(0, MAX_EXTRACTED_TEXT);
  return {
    text,
    pageCount: null,
    wordCount: countWords(text),
    chunks: chunkText(text),
  };
}

async function extractPptx(buffer) {
  // Lightweight PPTX extraction via XML parsing
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideTexts = [];

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0", 10);
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0", 10);
      return numA - numB;
    });

  for (const fileName of slideFiles) {
    const content = await zip.files[fileName].async("text");
    // Strip XML tags to get text content
    const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) slideTexts.push(text);
  }

  const fullText = slideTexts.join("\n\n").substring(0, MAX_EXTRACTED_TEXT);
  return {
    text: fullText,
    pageCount: slideFiles.length,
    wordCount: countWords(fullText),
    chunks: chunkText(fullText),
  };
}

async function extractImage() {
  // For MVP, images are stored but not text-extracted.
  // Vision-based extraction to be added in Phase 2.
  return {
    text: "",
    pageCount: 1,
    wordCount: 0,
    chunks: [],
    imageDescription: "",
  };
}

/**
 * Split text into overlapping chunks for context assembly.
 */
export function chunkText(text) {
  if (!text) return [];
  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push({
      text: text.substring(start, end),
      index,
    });
    index++;
    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }

  return chunks;
}

function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export default {
  extractFromBuffer,
  chunkText,
};
